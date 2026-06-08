import {
  DOMAIN_DETECT_PROMPT_MODEL,
  DomainDetectOutputSchema,
  RECOMMEND_PANEL_PROMPT_MODEL,
  RecommendPanelOutputSchema,
  PANEL_ROUND_PROMPT_MODEL,
  PANEL_JUDGE_PROMPT_MODEL,
  PanelJudgeOutputSchema,
  SYNTHESIS_PROMPT_MODEL,
  SynthesisOutputSchema,
  PANEL_MERGE_PROMPT_MODEL,
  buildDomainDetectPrompt,
  buildRecommendPanelPrompt,
  buildPanelJudgePrompt,
  buildSynthesisPrompt,
  buildPanelMergePrompt,
  runPanel,
  type PanelCallbacks,
  type PanelSteps,
} from '@nodx/ai';
import type { ExpertAgent, ExpertPanel, Topic } from '@nodx/models';
import { ai } from './gateway.js';
import { getDocument } from '../db/documents.js';
import { stripHtml } from './document.js';
import {
  acceptLocalMaximum,
  createPanel,
  getPanelByTopic,
  insertExchange,
  insertRound,
  saveLocalMaximum,
  updatePanelStatus,
  updateRoundStopSignals,
} from '../db/panels.js';
import { listTopics } from '../db/topics.js';

// ──────────────────────────────────────────────────────────────────────
// Desktop side of the Expert Panel engine (PRD §3.14 / §8.9).
//
// `@nodx/ai` owns the protocol (prompts + the round-orchestration loop in
// runPanel); this file just supplies the two halves runPanel needs:
//   • PanelSteps    — call the AI gateway (Sonnet for debate/synthesis,
//                     Haiku for the marginal-improvement judge)
//   • PanelCallbacks— persist each round / exchange as it streams in
//
// No UI yet — drive it from `window.__nodxRunPanel(topicId)` in dev.
// ──────────────────────────────────────────────────────────────────────

/** Real gateway-backed implementations of the engine's model primitives. */
const steps: PanelSteps = {
  async runExchange(systemPrompt, userPrompt, signal) {
    // A debate turn — especially a late-round rebuttal addressing several
    // peers — can exceed any single max_tokens cap. completeTextUntilDone
    // resumes the assistant turn whenever it stops at max_tokens, so the
    // utterance is never truncated mid-sentence; short turns still cost one
    // call. Per chunk we use the worker's hard ceiling (8k) and allow up to
    // 4 continuations (≈ 40k tokens total) as a runaway safety bound.
    const r = await ai.completeTextUntilDone({
      prompt: userPrompt,
      system: systemPrompt,
      model: PANEL_ROUND_PROMPT_MODEL,
      maxTokens: 8000,
      maxContinuations: 4,
      temperature: 0.7,
      signal,
    });
    return r.text.trim();
  },
  async judgeMarginal(input, signal) {
    // The convergence judge is a heuristic — it must NEVER crash the debate.
    // On any failure (e.g. the model emits invalid JSON), fall back to "still
    // improving" so we don't fire a spurious marginal_decay stop; the round
    // cap + canonical flow still bound the debate.
    try {
      const r = await ai.complete({
        prompt: buildPanelJudgePrompt(input),
        model: PANEL_JUDGE_PROMPT_MODEL,
        maxTokens: 800,
        schema: PanelJudgeOutputSchema,
        temperature: 0.2,
        signal,
      });
      return r.data.marginalScore;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[panel] marginal judge failed; treating as "still improving":',
        err,
      );
      return 1;
    }
  },
  async synthesize(input, signal) {
    // The Local Max JSON (consensus / divergence / openQuestions / bestAnswer)
    // in Chinese is token-hungry and can exceed a single cap. completeUntilDone
    // resumes the assistant turn if it truncates, then validates the stitched
    // JSON — so a rich synthesis never gets clipped into invalid JSON.
    const r = await ai.completeUntilDone({
      prompt: buildSynthesisPrompt(input),
      model: SYNTHESIS_PROMPT_MODEL,
      maxTokens: 8000,
      maxContinuations: 2,
      schema: SynthesisOutputSchema,
      temperature: 0.4,
      signal,
    });
    return r.data;
  },
};

/** Persist the debate as it runs, so a crash mid-debate leaves a partial transcript. */
function persistenceCallbacks(panelId: string): PanelCallbacks {
  return {
    onRoundStart: (round) =>
      insertRound(panelId, {
        id: round.id,
        roundNumber: round.roundNumber,
        type: round.type,
      }),
    onExchange: (roundId, exchange) => insertExchange(roundId, exchange),
    onRoundComplete: (round) =>
      updateRoundStopSignals(round.id, round.stopSignalsHit),
  };
}

/**
 * UI progress hooks — same shape as the engine's PanelCallbacks, but meant
 * for driving React state (live streaming the transcript) rather than the DB.
 */
export type PanelProgress = PanelCallbacks;

/**
 * Run the DB-persistence callbacks and the optional UI-progress callbacks
 * for the same engine hook. Persistence is awaited first (so the row exists
 * before the UI reads it back); progress is fire-and-forget.
 */
function withProgress(
  persistence: PanelCallbacks,
  progress?: PanelProgress,
): PanelCallbacks {
  if (!progress) return persistence;
  return {
    onRoundStart: async (round) => {
      await persistence.onRoundStart?.(round);
      await progress.onRoundStart?.(round);
    },
    onExchange: async (roundId, exchange) => {
      await persistence.onExchange?.(roundId, exchange);
      await progress.onExchange?.(roundId, exchange);
    },
    onRoundComplete: async (round) => {
      await persistence.onRoundComplete?.(round);
      await progress.onRoundComplete?.(round);
    },
  };
}

export interface FormedPanel {
  panel: ExpertPanel;
  /** The direction question the panel will debate (the Topic title). */
  question: string;
  /** Parent / prior context threaded into every round. */
  context: string;
}

/**
 * Step 1–2 of §8.9: detect the domain (Haiku), recommend a 3–5 person
 * persona stack (Sonnet), and open the panel in `forming`. Returns the
 * created panel plus the question/context the debate will run on.
 *
 * The recommender invents personas on the fly — there's no persona-library
 * seed yet, so each `ExpertAgent` gets a generated `personaTemplateId`
 * placeholder (members are embedded in the panel, not FK'd to a template).
 */
export async function formPanel(
  topic: Topic,
  parentContext = '',
): Promise<FormedPanel> {
  const domainRes = await ai.complete({
    prompt: buildDomainDetectPrompt({
      topicTitle: topic.title,
      parentContext,
    }),
    model: DOMAIN_DETECT_PROMPT_MODEL,
    maxTokens: 200,
    schema: DomainDetectOutputSchema,
    temperature: 0.2,
  });
  const domain = domainRes.data.domain;

  const recRes = await ai.complete({
    prompt: buildRecommendPanelPrompt({
      domain,
      question: topic.title,
      context: parentContext,
    }),
    model: RECOMMEND_PANEL_PROMPT_MODEL,
    maxTokens: 4000,
    schema: RecommendPanelOutputSchema,
    temperature: 0.6,
  });

  const members: ExpertAgent[] = recRes.data.members.map((m) => ({
    id: crypto.randomUUID(),
    personaTemplateId: crypto.randomUUID(),
    displayName: m.displayName,
    role: m.role,
    systemPrompt: m.systemPrompt,
  }));

  const panel = await createPanel({ topicId: topic.id, domain, members });
  return { panel, question: topic.title, context: parentContext };
}

export interface RunDebateOptions {
  /**
   * Cap on debate rounds (excludes synthesis). The engine clamps it to
   * [3, MAX_DEBATE_ROUNDS] and defaults to DEFAULT_MAX_ROUNDS when omitted.
   */
  maxRounds?: number;
  /** UI progress hooks for live-streaming the transcript. */
  progress?: PanelProgress;
}

/**
 * Step 3–4 of §8.9: run the debate (canonical 3 rounds, then extra
 * refinement rounds up to `maxRounds` while it keeps improving), persisting
 * each round / exchange, then flatten the synthesised Local Max onto the
 * panel. Returns the fully-hydrated, converged panel.
 */
export async function runDebate(
  formed: FormedPanel,
  options: RunDebateOptions = {},
): Promise<ExpertPanel> {
  const { panel, question, context } = formed;
  await updatePanelStatus(panel.id, 'debating');

  const { localMaximum } = await runPanel(
    { members: panel.members, question, context, maxRounds: options.maxRounds },
    steps,
    withProgress(persistenceCallbacks(panel.id), options.progress),
  );

  await saveLocalMaximum(panel.id, localMaximum);

  const hydrated = await getPanelByTopic(panel.topicId);
  if (!hydrated) {
    throw new Error(`panel ${panel.id} vanished after debate`);
  }
  return hydrated;
}

/** Convenience: form + debate in one call. */
export async function runPanelForTopic(
  topic: Topic,
  parentContext = '',
): Promise<ExpertPanel> {
  const formed = await formPanel(topic, parentContext);
  return runDebate(formed);
}

export { acceptLocalMaximum, getPanelByTopic };

/**
 * 归纳进文档 (PRD §8.7) — run the 收尾整理者 (Sonnet) to fold a converged
 * panel's Local Maximum into a Markdown section that fits the topic's current
 * thinking document. Returns the raw Markdown for an editable preview; the
 * caller appends it to the document only after the user confirms.
 *
 * Throws if the panel hasn't converged (no localMaximum).
 */
export async function generatePanelMerge(
  topic: Topic,
  panel: ExpertPanel,
): Promise<string> {
  const lm = panel.localMaximum;
  if (!lm) throw new Error('专家组尚未收敛，无法归纳进文档');

  const doc = await getDocument(topic.id);
  const documentText = doc ? stripHtml(doc.content) : '';

  const r = await ai.completeTextUntilDone({
    prompt: buildPanelMergePrompt({
      question: topic.title,
      domain: panel.domain,
      bestAnswer: lm.bestAnswer,
      consensus: lm.consensus,
      divergence: lm.divergence,
      openQuestions: lm.openQuestions,
      confidence: lm.confidence,
      documentText,
    }),
    model: PANEL_MERGE_PROMPT_MODEL,
    maxTokens: 4000,
    maxContinuations: 2,
    temperature: 0.5,
  });
  return r.text.trim();
}

/**
 * Dev-only entry point — no UI exists for the panel yet, so this exposes
 * `window.__nodxRunPanel(topicId)` to drive a full debate from the
 * devtools console and inspect the result. Remove once the panel UI lands.
 * Guarded by the caller (`import.meta.env.DEV`); registering twice is a
 * no-op.
 */
export function registerPanelDevTrigger(): void {
  const w = window as unknown as {
    __nodxRunPanel?: (topicId: string) => Promise<ExpertPanel>;
    __nodxGetPanel?: (topicId: string) => Promise<ExpertPanel | null>;
  };
  if (w.__nodxRunPanel) return;

  w.__nodxRunPanel = async (topicId: string) => {
    const topics = await listTopics({ includeArchived: true });
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) throw new Error(`topic not found: ${topicId}`);
    // eslint-disable-next-line no-console
    console.log('[panel] forming for', topic.title);
    const formed = await formPanel(topic);
    // eslint-disable-next-line no-console
    console.log(
      '[panel] members:',
      formed.panel.members.map((m) => `${m.displayName}(${m.role})`),
    );
    const done = await runDebate(formed);
    // eslint-disable-next-line no-console
    console.log('[panel] converged →', done.localMaximum);
    return done;
  };

  w.__nodxGetPanel = (topicId: string) => getPanelByTopic(topicId);
}

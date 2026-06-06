import {
  MAX_PANEL_ROUNDS,
  type ExpertAgent,
  type LocalMaximumResult,
  type PanelExchange,
  type PanelRound,
  type PanelStopSignal,
} from '@nodx/models';
import {
  buildCritiquePrompt,
  buildInitialPrompt,
  buildRefinePrompt,
  type PeerUtterance,
} from '../prompts/panel/round.js';
import {
  MARGINAL_THRESHOLD,
  type PanelJudgeInput,
} from '../prompts/panel/judge.js';
import type {
  SynthesisInput,
  SynthesisOutput,
  TranscriptEntry,
} from '../prompts/panel/synthesis.js';

/**
 * The model-calling primitives the orchestrator needs. Kept deliberately
 * thin: the orchestrator owns *all* prompt construction and control flow
 * (so it's unit-testable with fakes), while these just "call the model and
 * return the typed result". The desktop layer (`ai/panel.ts`) supplies the
 * real implementations wired to the AI gateway.
 */
export interface PanelSteps {
  /** One expert utterance. `systemPrompt` is the persona; `userPrompt` the round task. */
  runExchange(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
  ): Promise<string>;
  /** Marginal-improvement score ∈ [0,1] for round N vs N-1. */
  judgeMarginal(input: PanelJudgeInput, signal?: AbortSignal): Promise<number>;
  /** Independent moderator's synthesis of the whole transcript. */
  synthesize(
    input: SynthesisInput,
    signal?: AbortSignal,
  ): Promise<SynthesisOutput>;
}

/**
 * Persistence hooks so the desktop layer can write each round / exchange
 * as it streams in, instead of holding the whole debate in memory and
 * flushing at the end. All optional — tests pass none.
 *
 * Order guarantee: `onRoundStart` fires before any `onExchange` for that
 * round (so the FK parent row exists), and `onRoundComplete` fires after
 * all of them.
 */
export interface PanelCallbacks {
  onRoundStart?(round: {
    id: string;
    roundNumber: PanelRound['roundNumber'];
    type: PanelRound['type'];
  }): Promise<void> | void;
  onExchange?(roundId: string, exchange: PanelExchange): Promise<void> | void;
  onRoundComplete?(round: PanelRound): Promise<void> | void;
}

export interface RunPanelInput {
  members: ExpertAgent[];
  question: string;
  context: string;
  /**
   * Cap on debate rounds (excludes synthesis). Clamped to
   * [BASE rounds (3), MAX_DEBATE_ROUNDS]. Defaults to DEFAULT_MAX_ROUNDS.
   * maxRounds = 3 reproduces the canonical fixed flow.
   */
  maxRounds?: number;
}

export interface RunPanelResult {
  rounds: PanelRound[];
  localMaximum: LocalMaximumResult;
}

/** The canonical opening rounds — always run, in this order. */
const BASE_ROUND_TYPES = ['initial', 'critique', 'refined'] as const;

/** Round cap used when the caller doesn't pass one. */
export const DEFAULT_MAX_ROUNDS = 5;

/**
 * Max debate rounds the engine will run (excludes synthesis). One less than
 * the model's hard ceiling so the synthesis round number still fits inside
 * MAX_PANEL_ROUNDS.
 */
export const MAX_DEBATE_ROUNDS = MAX_PANEL_ROUNDS - 1;

/**
 * Drives the §3.14 debate protocol for one direction:
 *   Round 1 initial (closed-book, parallel) →
 *   Round 2 critique (read peers' R1, parallel) →
 *   Round 3 refined  (read peers' R2, parallel) →
 *   … extra refined rounds while the debate keeps improving …
 *   Round N synthesis (independent moderator → Local Maximum).
 *
 * The canonical 3 debate rounds always run. Beyond that, the debate keeps
 * adding refinement rounds up to `maxRounds`, stopping early the moment the
 * convergence judge fires a stop signal (marginal-decay / max-rounds — the
 * thresholds in judge.ts are unchanged). So `maxRounds = 3` reproduces the
 * old fixed flow; a higher cap lets a productive debate go deeper while an
 * unproductive one still stops at 3. Semantic convergence (embeddings) is
 * still deferred (see plan / PRD §8.9).
 */
export async function runPanel(
  input: RunPanelInput,
  steps: PanelSteps,
  callbacks: PanelCallbacks = {},
  signal?: AbortSignal,
): Promise<RunPanelResult> {
  const { members, question, context } = input;
  // Always run the canonical 3; never exceed the engine's debate ceiling.
  const maxRounds = Math.min(
    MAX_DEBATE_ROUNDS,
    Math.max(BASE_ROUND_TYPES.length, input.maxRounds ?? DEFAULT_MAX_ROUNDS),
  );

  const rounds: PanelRound[] = [];
  // member.id → utterance content, accumulated per round so later rounds
  // can show "what everyone else said".
  const byRound: Array<Map<string, string>> = [];

  // Run one debate round: members speak in parallel (reading only prior
  // rounds), persist each exchange as it resolves, judge convergence, and
  // return the completed round.
  const runDebateRound = async (
    type: PanelRound['type'],
    roundNumber: number,
  ): Promise<PanelRound> => {
    const roundId = crypto.randomUUID();
    await callbacks.onRoundStart?.({ id: roundId, roundNumber, type });

    const contents = new Map<string, string>();
    const exchanges = await Promise.all(
      members.map(async (agent) => {
        const userPrompt = buildRoundUserPrompt(
          type,
          agent,
          members,
          question,
          context,
          byRound,
        );
        const content = await steps.runExchange(
          agent.systemPrompt,
          userPrompt,
          signal,
        );
        contents.set(agent.id, content);
        const exchange: PanelExchange = {
          id: crypto.randomUUID(),
          agentId: agent.id,
          content,
          createdAt: Date.now(),
        };
        await callbacks.onExchange?.(roundId, exchange);
        return exchange;
      }),
    );

    byRound.push(contents);

    // Convergence judge runs from round 2 onward (needs a previous round to
    // compare against).
    let stopSignalsHit: PanelStopSignal[] | undefined;
    if (roundNumber >= 2) {
      stopSignalsHit = await evaluateStopSignals(
        question,
        roundNumber,
        maxRounds,
        byRound,
        members,
        steps,
        signal,
      );
    }

    const round: PanelRound = {
      id: roundId,
      roundNumber,
      type,
      // Keep DB insertion order stable (members[] order), not resolve order.
      exchanges: members
        .map((m) => exchanges.find((e) => e.agentId === m.id))
        .filter((e): e is PanelExchange => e !== undefined),
      ...(stopSignalsHit && stopSignalsHit.length > 0
        ? { stopSignalsHit }
        : {}),
    };
    rounds.push(round);
    await callbacks.onRoundComplete?.(round);
    return round;
  };

  // Canonical debate: always initial → critique → refined.
  let last: PanelRound | null = null;
  for (let i = 0; i < BASE_ROUND_TYPES.length; i++) {
    last = await runDebateRound(BASE_ROUND_TYPES[i]!, i + 1);
  }

  // Extension: keep adding refinement rounds while the debate is still
  // improving (no stop signal on the latest round) and we're under the cap.
  let roundNumber = BASE_ROUND_TYPES.length;
  while (roundNumber < maxRounds && !last?.stopSignalsHit?.length) {
    roundNumber += 1;
    last = await runDebateRound('refined', roundNumber);
  }

  // ── Synthesis ─────────────────────────────────────────────────────────
  const synthRoundId = crypto.randomUUID();
  const synthRoundNumber = roundNumber + 1;
  await callbacks.onRoundStart?.({
    id: synthRoundId,
    roundNumber: synthRoundNumber,
    type: 'synthesis',
  });

  const transcript = buildTranscript(members, byRound);
  const synthesis = await steps.synthesize(
    { question, context, transcript },
    signal,
  );
  const localMaximum: LocalMaximumResult = {
    ...synthesis,
    acceptedByUser: false,
  };

  // Synthesis is the moderator's output (stored on the panel's Local Max),
  // not a member utterance — so this round carries no exchanges.
  const synthRound: PanelRound = {
    id: synthRoundId,
    roundNumber: synthRoundNumber,
    type: 'synthesis',
    exchanges: [],
  };
  rounds.push(synthRound);
  await callbacks.onRoundComplete?.(synthRound);

  return { rounds, localMaximum };
}

function buildRoundUserPrompt(
  type: PanelRound['type'],
  agent: ExpertAgent,
  members: ExpertAgent[],
  question: string,
  context: string,
  byRound: Array<Map<string, string>>,
): string {
  if (type === 'initial') {
    return buildInitialPrompt({ question, context });
  }
  if (type === 'critique') {
    const round1 = byRound[0]!;
    return buildCritiquePrompt({
      question,
      ownInitial: round1.get(agent.id) ?? '',
      peers: peersFrom(agent, members, round1),
    });
  }
  // refined (round 3+). Own full history so far + peers' most recent round
  // (the critique for R3, the prior refinement for R4+). `byRound` holds
  // only completed rounds at this point.
  const latest = byRound[byRound.length - 1]!;
  return buildRefinePrompt({
    question,
    ownHistory: byRound
      .map((r) => r.get(agent.id) ?? '')
      .filter((s) => s.length > 0),
    peerCritiques: peersFrom(agent, members, latest),
  });
}

/** Every member *except* `self`, paired with what they said in `round`. */
function peersFrom(
  self: ExpertAgent,
  members: ExpertAgent[],
  round: Map<string, string>,
): PeerUtterance[] {
  return members
    .filter((m) => m.id !== self.id)
    .map((m) => ({
      displayName: m.displayName,
      role: m.role,
      content: round.get(m.id) ?? '',
    }));
}

async function evaluateStopSignals(
  question: string,
  roundNumber: number,
  maxRounds: number,
  byRound: Array<Map<string, string>>,
  members: ExpertAgent[],
  steps: PanelSteps,
  signal?: AbortSignal,
): Promise<PanelStopSignal[]> {
  const hit: PanelStopSignal[] = [];
  const prev = byRound[byRound.length - 2]!;
  const curr = byRound[byRound.length - 1]!;
  const order = (round: Map<string, string>) =>
    members.map((m) => round.get(m.id) ?? '');

  // Marginal-improvement threshold is unchanged (judge.ts MARGINAL_THRESHOLD).
  const marginalScore = await steps.judgeMarginal(
    { question, prevStances: order(prev), currStances: order(curr) },
    signal,
  );
  if (marginalScore < MARGINAL_THRESHOLD) hit.push('marginal_decay');
  // Hard cap (PRD §8.9) — now configurable via maxRounds.
  if (roundNumber >= maxRounds) hit.push('max_rounds');
  return hit;
}

function buildTranscript(
  members: ExpertAgent[],
  byRound: Array<Map<string, string>>,
): TranscriptEntry[] {
  return members.map((m) => ({
    displayName: m.displayName,
    role: m.role,
    utterances: byRound
      .map((r) => r.get(m.id) ?? '')
      .filter((s) => s.length > 0),
  }));
}

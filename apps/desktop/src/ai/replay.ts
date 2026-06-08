import {
  RECAP_PROMPT_MODEL,
  RecapOutputSchema,
  buildRecapPrompt,
  toRecapInput,
  TRACE_PROMPT_MODEL,
  TraceOutputSchema,
  buildTracePrompt,
  toTraceInput,
  type RecapOutput,
} from '@nodx/ai';
import type { Topic } from '@nodx/models';
import { ai, isAiConfigured } from './gateway.js';
import {
  finalizeSession,
  listSessions,
  listStaleSessions,
} from '../db/sessions.js';
import {
  createReplayCardMessage,
  getLatestReplayCard,
  listMessagesBySession,
} from '../db/messages.js';
import { listTopics, setReasoningTrace } from '../db/topics.js';
import { listOpenQuestions } from '../db/comments.js';

// ──────────────────────────────────────────────────────────────────────
// 思路复现 / 卖点② 不丢失 (PRD §3.11 / §8.8). Desktop orchestration: closes
// idle sessions (Haiku → recap + trace) and generates the "上次回顾" replay
// card (Sonnet) when a topic is reopened after a gap. All best-effort.
// ──────────────────────────────────────────────────────────────────────

const REPLAY_GAP_MS = 24 * 60 * 60 * 1000;

/** The replay card content stored in the replay_card message (the recap JSON). */
export type { RecapOutput };

/**
 * Close any idle-past-the-window sessions: one Haiku call per session writes
 * its recap and folds it into the Topic's reasoningTrace. Returns the latest
 * trace (so the caller can use it without re-fetching).
 */
export async function closeStaleSessions(
  topic: Topic,
): Promise<string | undefined> {
  if (!isAiConfigured()) return topic.reasoningTrace;
  const stale = await listStaleSessions(topic.id);
  let trace = topic.reasoningTrace;
  for (const s of stale) {
    try {
      const msgs = await listMessagesBySession(s.id);
      const r = await ai.complete({
        prompt: buildTracePrompt(
          toTraceInput({
            question: topic.title,
            previousTrace: trace,
            sessionMessages: msgs,
          }),
        ),
        model: TRACE_PROMPT_MODEL,
        maxTokens: 1500,
        schema: TraceOutputSchema,
        temperature: 0.3,
      });
      await finalizeSession(s.id, r.data.sessionRecap);
      await setReasoningTrace(topic.id, r.data.trace);
      trace = r.data.trace;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[replay] closing session failed (non-fatal):', err);
    }
  }
  return trace;
}

/**
 * Generate the "上次回顾" replay card when the topic was reopened after a >24h
 * gap and one wasn't made recently. Inserts a `replay_card` message; returns
 * the recap (or null if not generated). `topic.reasoningTrace` should already
 * reflect any just-closed sessions.
 */
export async function maybeGenerateReplayCard(
  topic: Topic,
): Promise<RecapOutput | null> {
  if (!isAiConfigured()) return null;
  const now = Date.now();
  if (now - topic.meta.lastActivity < REPLAY_GAP_MS) return null;

  const latest = await getLatestReplayCard(topic.id);
  if (latest && now - latest.createdAt < REPLAY_GAP_MS) return null;

  const [sessions, openQuestions] = await Promise.all([
    listSessions(topic.id),
    listOpenQuestions(topic.id),
  ]);
  // Nothing to recall yet → skip (avoids an empty card on a fresh topic).
  const haveMaterial =
    !!topic.reasoningTrace ||
    sessions.some((s) => s.aiRecap) ||
    openQuestions.length > 0;
  if (!haveMaterial) return null;

  const r = await ai.complete({
    prompt: buildRecapPrompt(toRecapInput({ topic, sessions, openQuestions })),
    model: RECAP_PROMPT_MODEL,
    maxTokens: 2000,
    schema: RecapOutputSchema,
    temperature: 0.4,
  });
  await createReplayCardMessage(topic.id, JSON.stringify(r.data));
  return r.data;
}

/**
 * Fired when a Topic is opened: close stale sessions first (so the trace +
 * recaps are fresh), then maybe make a replay card. Returns the recap if one
 * was generated (so the caller can refresh + show the banner). Best-effort —
 * swallows errors.
 */
export async function onTopicOpened(topic: Topic): Promise<RecapOutput | null> {
  try {
    const trace = await closeStaleSessions(topic);
    const fresh =
      trace && trace !== topic.reasoningTrace
        ? { ...topic, reasoningTrace: trace }
        : topic;
    return await maybeGenerateReplayCard(fresh);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[replay] onTopicOpened failed (non-fatal):', err);
    return null;
  }
}

/**
 * Dev-only: force-generate a replay card for a topic, bypassing the 24h gate
 * and React-mount timing — `await __nodxReplay("<topicId>")`. Then reload /
 * re-open the topic to see the banner.
 */
export function registerReplayDevTrigger(): void {
  const w = window as unknown as {
    __nodxReplay?: (topicId: string) => Promise<RecapOutput | null>;
  };
  if (w.__nodxReplay) return;
  w.__nodxReplay = async (topicId: string) => {
    const topic = (await listTopics({ includeArchived: true })).find(
      (t) => t.id === topicId,
    );
    if (!topic) throw new Error(`topic not found: ${topicId}`);
    const trace = await closeStaleSessions(topic);
    const fresh = trace ? { ...topic, reasoningTrace: trace } : topic;
    const [sessions, openQuestions] = await Promise.all([
      listSessions(topic.id),
      listOpenQuestions(topic.id),
    ]);
    const r = await ai.complete({
      prompt: buildRecapPrompt(
        toRecapInput({ topic: fresh, sessions, openQuestions }),
      ),
      model: RECAP_PROMPT_MODEL,
      maxTokens: 2000,
      schema: RecapOutputSchema,
      temperature: 0.4,
    });
    await createReplayCardMessage(topic.id, JSON.stringify(r.data));
    // eslint-disable-next-line no-console
    console.log('[replay] forced card →', r.data);
    return r.data;
  };
}

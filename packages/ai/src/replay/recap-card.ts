import type { Comment, ThinkingSession, Topic } from '@nodx/models';
import {
  RECAP_PROMPT_MODEL,
  RECAP_PROMPT_VERSION,
  RecapOutputSchema,
  buildRecapPrompt,
  type RecapInput,
  type RecapOutput,
} from '../prompts/replay/recap.js';

/**
 * Assemble the recap input from domain objects (PRD §8.8 step 1): the Topic's
 * trace, its recent session recaps (newest first), and its unresolved 卡点.
 * Pure — the desktop wrapper feeds the result to `ai.complete` with the recap
 * prompt + schema below.
 */
export function toRecapInput(opts: {
  topic: Topic;
  /** Sessions for this topic; only those with an aiRecap are used. */
  sessions: ThinkingSession[];
  /** Comments of type 'open_question' that are still unresolved. */
  openQuestions: Comment[];
  /** Cap on session recaps fed in. Default 5. */
  maxSessions?: number;
}): RecapInput {
  const sessionRecaps = opts.sessions
    .filter((s) => !!s.aiRecap)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, opts.maxSessions ?? 5)
    .map((s) => s.aiRecap as string);

  const openQuestions = opts.openQuestions
    .filter((c) => c.type === 'open_question' && !c.openQuestionData?.resolvedAt)
    .map((c) => c.openQuestionData?.question)
    .filter((q): q is string => !!q);

  return {
    question: opts.topic.title,
    ...(opts.topic.reasoningTrace
      ? { reasoningTrace: opts.topic.reasoningTrace }
      : {}),
    sessionRecaps,
    openQuestions,
  };
}

export {
  RECAP_PROMPT_MODEL,
  RECAP_PROMPT_VERSION,
  RecapOutputSchema,
  buildRecapPrompt,
  type RecapInput,
  type RecapOutput,
};

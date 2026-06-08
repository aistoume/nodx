import type { Message } from '@nodx/models';
import {
  TRACE_PROMPT_MODEL,
  TRACE_PROMPT_VERSION,
  TraceOutputSchema,
  buildTracePrompt,
  type TraceInput,
  type TraceOutput,
} from '../prompts/replay/trace.js';

/**
 * Assemble the trace-update input from a closing session's messages. Only the
 * actual back-and-forth text matters; survey/card/replay system messages are
 * skipped. Pure — the desktop wrapper runs `ai.complete` with the trace prompt.
 */
export function toTraceInput(opts: {
  question: string;
  previousTrace?: string;
  /** The closing session's messages (any types; text ones are kept). */
  sessionMessages: Message[];
}): TraceInput {
  const sessionMessages = opts.sessionMessages
    .filter((m) => m.type === 'text')
    .map((m) => `${m.role === 'user' ? '我' : 'AI'}：${m.content}`);
  return {
    question: opts.question,
    ...(opts.previousTrace ? { previousTrace: opts.previousTrace } : {}),
    sessionMessages,
  };
}

export {
  TRACE_PROMPT_MODEL,
  TRACE_PROMPT_VERSION,
  TraceOutputSchema,
  buildTracePrompt,
  type TraceInput,
  type TraceOutput,
};

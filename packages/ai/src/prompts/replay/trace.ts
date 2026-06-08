import { z } from 'zod';
import { MODELS, type ModelId } from '../../models.js';
import { JSON_QUOTE_RULE } from '../json-safety.js';

export const TRACE_PROMPT_VERSION = '2026-06-04.v1';
export const TRACE_PROMPT_MODEL: ModelId = MODELS.haiku;

/**
 * Input to the reasoning-trace updater (PRD §8.8). Runs when a ThinkingSession
 * closes: incrementally fold the just-finished session into the running trace.
 */
export interface TraceInput {
  /** The Topic's question/title. */
  question: string;
  /** The trace so far (empty on the first session). */
  previousTrace?: string;
  /** The closing session's messages as "角色：内容" lines. */
  sessionMessages: string[];
}

/**
 * One Haiku call produces BOTH:
 *   - `trace`: the updated reasoning path (append/revise, NOT a rewrite)
 *   - `sessionRecap`: a 1–2 sentence summary of just this session
 * (saves a second call — the recap is needed for ThinkingSession.aiRecap).
 */
export const TraceOutputSchema = z
  .object({
    trace: z.string().min(1),
    sessionRecap: z.string().min(1),
  })
  .strict();
export type TraceOutput = z.infer<typeof TraceOutputSchema>;

/**
 * Reasoning-trace updater — Haiku (cheap, runs at every session close). Keep
 * the trace concise and cumulative: carry forward the prior steps, append or
 * revise only what this session changed. Don't bloat it.
 */
export function buildTracePrompt(input: TraceInput): string {
  return `这是一个思考话题。一次思考会话刚结束，请增量更新"推理路径"摘要，并给本次会话写一句小结。

话题：${input.question}

已有的推理路径（要在它基础上更新，不是重写）：
${input.previousTrace || '（暂无，这是第一次）'}

本次会话的消息：
${input.sessionMessages.length ? input.sessionMessages.join('\n') : '（无实质消息）'}

要求：
- trace：在已有路径基础上**追加或修订**关键推理步骤，保持简洁累积（不要照搬消息原文，提炼"想到哪一步、为什么"）。
- sessionRecap：用 1–2 句话概括本次会话推进了什么。

只输出 JSON：
{
  "trace": "...",
  "sessionRecap": "..."
}${JSON_QUOTE_RULE}`;
}

import { z } from 'zod';
import { MODELS, type ModelId } from '../models.js';

export const ATOMIC_CHECK_PROMPT_VERSION = '2026-05-04.v1';
export const ATOMIC_CHECK_PROMPT_MODEL: ModelId = MODELS.haiku;

export interface AtomicCheckInput {
  /** The conclusion-y sentence to inspect. */
  text: string;
}

export const AtomicMissingFieldSchema = z.enum([
  'who',
  'what',
  'when',
  'deliverable',
]);
export type AtomicMissingField = z.infer<typeof AtomicMissingFieldSchema>;

export const AtomicCheckOutputSchema = z.object({
  is_atomic: z.boolean(),
  missing: z.array(AtomicMissingFieldSchema),
  suggestion: z.string(),
});

export type AtomicCheckOutput = z.infer<typeof AtomicCheckOutputSchema>;

/**
 * Atomic checker — PRD §7.3. Routed to Haiku because it runs frequently
 * (every time the user marks a sentence as a candidate atomic action).
 * If the conclusion is already atomic, missing[] is empty and suggestion
 * is a short note like "已具备 4 要素".
 */
export function buildAtomicCheckPrompt(input: AtomicCheckInput): string {
  return `判断下面这段文字是否已经是一个"原子任务"。原子任务的定义：**谁** + **做什么** + **何时** + **产出物** 四要素都明确。

待判断文字：
"""
${input.text}
"""

只输出 JSON：
{
  "is_atomic": true|false,
  "missing": ["who" | "what" | "when" | "deliverable"],
  "suggestion": "如果未原子，告诉用户该补什么；如果已原子，给一句确认。"
}`;
}

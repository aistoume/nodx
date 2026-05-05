import { z } from 'zod';
import { MODELS, type ModelId } from '../models.js';

export const EXPLAIN_PROMPT_VERSION = '2026-05-04.v1';
export const EXPLAIN_PROMPT_MODEL: ModelId = MODELS.haiku;

export interface ExplainInput {
  /** The text the user selected. Usually a term or short phrase. */
  selection: string;
  /** Surrounding sentence(s) for disambiguation. Optional. */
  context?: string;
}

export const ExplainOutputSchema = z.object({
  /** 50–150 characters of plain explanation. */
  explanation: z.string().min(20).max(400),
});

export type ExplainOutput = z.infer<typeof ExplainOutputSchema>;

/**
 * Just-in-time explanation prompt — fired when the user highlights text in
 * a message and clicks "解释". Output lands as a blue annotation in the
 * right panel (see PRD §2.5). Routed to Haiku for speed.
 */
export function buildExplainPrompt(input: ExplainInput): string {
  return `用一句话（50–150 字）解释下面这个名词，目标读者是企业管理层，不要学究气：

待解释：${input.selection}
${input.context ? `\n上下文：${input.context}` : ''}

只输出 JSON：
{
  "explanation": "<一句话解释>"
}`;
}

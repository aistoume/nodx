import { z } from 'zod';
import { MODELS, type ModelId } from '../models.js';

export const DECOMPOSE_PROMPT_VERSION = '2026-05-04.v1';
export const DECOMPOSE_PROMPT_MODEL: ModelId = MODELS.sonnet;

export interface DecomposeInput {
  question: string;
  /** The factor titles the user kept from the survey step. */
  selectedFactors: string[];
  /**
   * Already-said context (parent-topic summary + last few messages).
   * Pass an empty string when starting a brand-new topic.
   */
  context: string;
}

export const SubQuestionSchema = z.object({
  question: z.string().min(1),
  can_be_atomic: z.boolean(),
});

export const DecomposedFactorSchema = z.object({
  title: z.string().min(1),
  essence: z.string().min(1),
  sub_questions: z.array(SubQuestionSchema).min(1),
});

export const DecomposeOutputSchema = z.object({
  factors: z.array(DecomposedFactorSchema).min(1),
});

export type SubQuestion = z.infer<typeof SubQuestionSchema>;
export type DecomposedFactor = z.infer<typeof DecomposedFactorSchema>;
export type DecomposeOutput = z.infer<typeof DecomposeOutputSchema>;

/**
 * First-principles decomposition prompt — verbatim adaptation of PRD §7.2,
 * with placeholders bound by buildDecomposePrompt. The shape of the JSON
 * output is held by DecomposeOutputSchema so we can reject malformed
 * responses before they hit the UI.
 */
export function buildDecomposePrompt(input: DecomposeInput): string {
  return `你是第一性原理思考教练。

用户问题: ${input.question}
用户选择的关注维度: ${input.selectedFactors.join('、')}
对话上下文: ${input.context || '（新对话，无上下文）'}

任务：对每个维度，按以下步骤分析：
  1. 这个维度的本质是什么？（剥离表象）
  2. 需要回答哪些独立的子问题？
  3. 这些子问题中哪些可以直接拆到原子级（谁/做什么/何时/产出）？哪些需要继续追问？

只输出 JSON：
{
  "factors": [{
    "title": "<维度名>",
    "essence": "<这个维度的本质，一句话>",
    "sub_questions": [
      { "question": "<子问题>", "can_be_atomic": true }
    ]
  }]
}`;
}

import { z } from 'zod';
import { MODELS, type ModelId } from '../models.js';

export const SURVEY_PROMPT_VERSION = '2026-05-05.v2';
export const SURVEY_PROMPT_MODEL: ModelId = MODELS.sonnet;

export interface SurveyInput {
  /** The user's raw, possibly-fuzzy question. */
  question: string;
}

export const SurveyFactorSchema = z.object({
  /** Stable factor id, used to thread the user's selection back into decompose. */
  id: z.string().min(1),
  title: z.string().min(1),
  /** One-line hint — why this dimension matters for the question. */
  hint: z.string().optional(),
});

export const SurveyOutputSchema = z.object({
  factors: z.array(SurveyFactorSchema).min(5).max(7),
});

export type SurveyFactor = z.infer<typeof SurveyFactorSchema>;
export type SurveyOutput = z.infer<typeof SurveyOutputSchema>;

/**
 * Survey-stage prompt. The model returns 5–7 candidate dimensions the user
 * picks from before we run the first-principles decomposition. PRD §7.1
 * keeps a keyword classifier upstream choosing a template — this prompt is
 * what we send after the template is picked and the question is in hand.
 */
export function buildSurveyPrompt(input: SurveyInput): string {
  return `你是 nodx 的"开场分析师"。用户提了一个还比较模糊的决策问题，你的任务**不是**给答案，而是先帮用户对齐——列出 5 到 7 个值得在决策中关注的维度，让用户勾选 3 到 5 个进入下一步拆解。

用户问题：
"""
${input.question}
"""

要求：
1. 维度必须互相独立、不重叠，且对**这个具体问题**有意义（不要套话）。
2. 给每个维度一个稳定的英文蛇形 id（例如 "market_size"、"team_capacity"），后续步骤会用 id 回引。
3. 给每个维度一行 hint，**不超过 30 字**，简短点出杠杆即可（不要长解释、不要举例）。
4. title 不超过 12 字。
5. 不要解释你的思考过程，不要任何前后说明文字，直接输出 JSON。

只输出形如下面结构的 JSON（不要包在 \`\`\`json 代码块里）：
{
  "factors": [
    { "id": "market_size", "title": "市场规模", "hint": "决定上限是 1B 还是 100M" },
    ...
  ]
}`;
}

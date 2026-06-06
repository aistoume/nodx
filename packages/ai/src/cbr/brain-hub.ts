import { z } from 'zod';
import { MODELS, type ModelId } from '../models.js';

export const BRAIN_HUB_PROMPT_VERSION = '2026-06-04.v1';
export const BRAIN_HUB_PROMPT_MODEL: ModelId = MODELS.haiku;

/** Hard cap on sub-intents (PRD §3.16 ③: "≤ 3 sub_intents"). */
export const MAX_SUB_INTENTS = 3;

export interface BrainHubInput {
  /** The user's new question. */
  query: string;
}

/**
 * Brain Hub output (PRD §3.16 ③). Splits a query into ≤3 retrievable
 * sub-intents; a simple single-intent query yields one (often a tidied
 * restatement of the query itself). Each sub-intent is embedded + keyword-
 * recalled independently, then results are fused.
 */
export const BrainHubOutputSchema = z
  .object({
    subIntents: z.array(z.string().min(1)).min(1).max(MAX_SUB_INTENTS),
  })
  .strict();
export type BrainHubOutput = z.infer<typeof BrainHubOutputSchema>;

/**
 * Brain Hub — Haiku (cheap, runs on every query). Decompose ONLY when the
 * query genuinely bundles distinct decision questions; otherwise return a
 * single intent. Each sub-intent should read as a self-contained "problem
 * scene" so it matches well against stored case signatures.
 */
export function buildBrainHubPrompt(input: BrainHubInput): string {
  return `你是 CBR 检索的"大脑中枢"。把用户的新问题拆成**最多 ${MAX_SUB_INTENTS} 个**可独立检索的子意图（sub_intent），用于去案例库里召回相似的历史决策。

用户问题：${input.query}

规则：
- 如果问题本身就是单一决策意图，**只返回 1 个**（可以是对原问题的精炼复述）。
- 只有当问题确实捆绑了多个**不同**的决策问题时，才拆成 2–3 个。
- 每个子意图写成一个自包含的"问题场景"短句（领域 + 决策点），便于和案例的 problemSignature 匹配。
- 不要发散、不要加问题里没有的假设。

只输出 JSON：
{ "subIntents": ["<子意图1>"] }`;
}

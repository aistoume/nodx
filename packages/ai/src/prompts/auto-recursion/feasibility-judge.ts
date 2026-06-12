import { MODELS, type ModelId } from '../../models.js';
import { JSON_QUOTE_RULE } from '../json-safety.js';

export const FEASIBILITY_JUDGE_PROMPT_VERSION = '2026-06-08.v1';
export const FEASIBILITY_JUDGE_PROMPT_MODEL: ModelId = MODELS.haiku;

export interface FeasibilityJudgeInput {
  /** The candidate child-topic title being scored. */
  candidateTitle: string;
  /** Short context: the parent direction + its accepted conclusion. */
  topicTitle: string;
  localMaxBest: string;
}

/**
 * 可行性评分员 (PRD §4) — one tight Haiku call per candidate. Output is a
 * `FeasibilityBreakdown` (validated against the @nodx/models schema by the
 * caller). Kept deliberately terse: it runs up to 5× per PM evaluation, so
 * every token counts. The composite feasibilityScore is computed by the
 * orchestrator, not the model.
 */
export function buildFeasibilityJudgePrompt(
  input: FeasibilityJudgeInput,
): string {
  return `给候选子话题打可行性分（都是 0–1）：
- resourceCost：花多少钱/人力（低=省）
- timeToResolve：多久能想清楚（低=快）
- decisionRisk：判断错的代价（低=安全）
- value：解决它对整体决策的价值（高=关键）
- dependencies：依赖什么才能开始（数组，每条 ≤ 30 字，无则空数组）

背景方向：${input.topicTitle}
已采纳结论：${input.localMaxBest.slice(0, 600)}

候选子话题：${input.candidateTitle}

只输出 JSON：
{"resourceCost":0.0,"timeToResolve":0.0,"decisionRisk":0.0,"value":0.0,"dependencies":["<短>"]}${JSON_QUOTE_RULE}`;
}

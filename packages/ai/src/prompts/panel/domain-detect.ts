import { z } from 'zod';
import { MODELS, type ModelId } from '../../models.js';

export const DOMAIN_DETECT_PROMPT_VERSION = '2026-06-02.v1';
export const DOMAIN_DETECT_PROMPT_MODEL: ModelId = MODELS.haiku;

export interface DomainDetectInput {
  /** The direction Topic's title (e.g. "要不要现在出海东南亚"). */
  topicTitle: string;
  /**
   * Parent-topic summary / surrounding context. Empty string when the
   * direction stands alone with no parent.
   */
  parentContext: string;
}

/**
 * Identifies the decision domain so the panel recommender knows which
 * kind of experts to assemble. `confidence` lets the caller fall back to
 * a generic stack when the model is unsure (PRD §8.9 step 1).
 */
export const DomainDetectOutputSchema = z.object({
  domain: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type DomainDetectOutput = z.infer<typeof DomainDetectOutputSchema>;

/**
 * Domain identification — Haiku because it's a cheap, single-shot
 * classification that gates the (expensive) Sonnet recommender.
 */
export function buildDomainDetectPrompt(input: DomainDetectInput): string {
  return `你是决策领域分类器。给定一个决策方向，判断它属于哪个专业领域（用于后续组建对口的 AI 专家组）。

决策方向：${input.topicTitle}
背景上下文：${input.parentContext || '（无上下文）'}

领域用一个简短名词短语描述，例如「跨境电商战略」「企业融资」「产品定价」「组织管理」「技术架构选型」。
confidence 表示你对这个领域判断的把握（0–1）。

只输出 JSON：
{
  "domain": "<领域名词短语>",
  "confidence": 0.0
}`;
}

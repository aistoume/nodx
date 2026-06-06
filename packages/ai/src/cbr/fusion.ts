import { z } from 'zod';
import { MODELS, type ModelId } from '../models.js';

export const FUSION_PROMPT_VERSION = '2026-06-04.v1';
export const FUSION_PROMPT_MODEL: ModelId = MODELS.sonnet;

/** A retrieved candidate shown to the fusion writer. */
export interface FusionCandidate {
  /** Stable ref the report points back to (case id). */
  id: string;
  domain: string;
  decisionType: string;
  /** Text-ified problem signature. */
  signatureText: string;
  /** Text-ified solution pattern. */
  solutionText: string;
  qualityScore: number;
}

export interface FusionInput {
  /** The user's new question. */
  query: string;
  /** Top-K retrieved cases (already ranked). */
  candidates: FusionCandidate[];
}

const CaseInsightSchema = z
  .object({
    caseRef: z.string().min(1),
    insight: z.string().min(1),
  })
  .strict();

/**
 * The 多路融合师's reference report (PRD §3.16 ④). NOT an answer — a synthesis
 * of what the retrieved cases offer the new question:
 *   - coreBorrows     : the 3 most relevant things to borrow
 *   - contrastCases   : up to 2 cases that chose differently (counter-examples)
 *   - crossPatterns   : patterns that recur across cases
 *   - contextWarnings : where the old context differs enough to NOT copy
 */
export const FusionReportSchema = z
  .object({
    coreBorrows: z.array(CaseInsightSchema),
    contrastCases: z.array(CaseInsightSchema),
    crossPatterns: z.array(z.string().min(1)),
    contextWarnings: z.array(z.string().min(1)),
  })
  .strict();
export type FusionReport = z.infer<typeof FusionReportSchema>;

function formatCandidates(cands: FusionCandidate[]): string {
  return cands
    .map(
      (c, i) =>
        `【候选 ${i + 1}｜id=${c.id}｜域=${c.domain}｜类型=${c.decisionType}｜质量=${c.qualityScore}】
  问题场景：${c.signatureText}
  方案模式：${c.solutionText}`,
    )
    .join('\n\n');
}

/**
 * 多路融合师 — Sonnet. Reads the Top-K retrieved cases against the new
 * question and writes a *reference* report (not a decision). It must stay
 * honest about transfer: flag where the old context differs enough that
 * copying would mislead (语境警示). `caseRef` should cite the candidate id.
 */
export function buildFusionPrompt(input: FusionInput): string {
  return `你是 CBR 的"多路融合师"。用户提出了一个新问题，系统检索到了若干历史决策案例。请综合这些案例，写一份**参考报告**（不是直接给答案，而是告诉用户能从老案例里借鉴什么、要警惕什么）。

== 用户新问题 ==
${input.query}

== 检索到的候选案例（已按相关度排序）==
${formatCandidates(input.candidates)}

== 输出要求 ==
- coreBorrows：最值得借鉴的 3 条（caseRef 写候选 id，insight 写具体能借鉴什么）
- contrastCases：最多 2 条做了**不同选择**的对照案例（caseRef + 它给出的反面参照）
- crossPatterns：跨多个案例反复出现的可复用模式
- contextWarnings（语境警示）：老案例语境与新问题差异大、**不能照搬**的关键点（诚实，宁可多提醒）

只输出 JSON：
{
  "coreBorrows": [ { "caseRef": "<id>", "insight": "..." } ],
  "contrastCases": [ { "caseRef": "<id>", "insight": "..." } ],
  "crossPatterns": ["..."],
  "contextWarnings": ["..."]
}`;
}

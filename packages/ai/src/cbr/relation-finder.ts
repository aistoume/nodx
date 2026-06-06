import { z } from 'zod';
import { CaseRelationTypeSchema } from '@nodx/models';
import { MODELS, type ModelId } from '../models.js';

export const RELATION_FINDER_PROMPT_VERSION = '2026-06-04.v1';
export const RELATION_FINDER_PROMPT_MODEL: ModelId = MODELS.sonnet;

/** A compact view of an existing case, shown to the relation-finder. */
export interface ExistingCaseSummary {
  id: string;
  domain: string;
  decisionType: string;
  frameworks: string[];
  /** One-line gist of the problem signature. */
  signatureText: string;
}

/**
 * Input to the 关系发现者 (PRD §3.18). Runs right after a case is abstracted:
 * given the new case + the existing library, it decides which existing cases
 * the new one relates to, and how.
 */
export interface RelationFinderInput {
  newCase: {
    domain: string;
    decisionType: string;
    frameworks: string[];
    signatureText: string;
    solutionText: string;
  };
  existing: ExistingCaseSummary[];
}

/**
 * One proposed edge from the new case to an existing one. `targetCaseId` must
 * be one of the supplied existing ids — the persistence layer drops any that
 * aren't (the model can hallucinate ids).
 */
export const FoundRelationSchema = z
  .object({
    targetCaseId: z.string().min(1),
    relationType: CaseRelationTypeSchema,
    weight: z.number().min(0).max(1),
  })
  .strict();
export type FoundRelation = z.infer<typeof FoundRelationSchema>;

export const RelationFinderOutputSchema = z
  .object({
    relations: z.array(FoundRelationSchema),
  })
  .strict();
export type RelationFinderOutput = z.infer<typeof RelationFinderOutputSchema>;

function formatExisting(cases: ExistingCaseSummary[]): string {
  if (!cases.length) return '（案例库为空，无可关联案例）';
  return cases
    .map(
      (c) =>
        `- id=${c.id} | 领域=${c.domain} | 类型=${c.decisionType} | 框架=${c.frameworks.join('、') || '—'} | 摘要：${c.signatureText}`,
    )
    .join('\n');
}

/**
 * 关系发现者 — Sonnet. Builds the simplified-GraphRAG edges (PRD §3.18). Only
 * propose an edge when the relationship is real; an empty list is a valid,
 * common answer (especially early when the library is small).
 *
 * relationType meanings:
 *   shares_framework — same thinking framework applied
 *   shares_domain    — same problem domain
 *   contrasts        — similar problem, *opposite* choice (useful counter-case)
 *   composed_from    — this case reuses pieces of the target
 *   caused_by        — this decision was triggered by the target's outcome
 */
export function buildRelationFinderPrompt(input: RelationFinderInput): string {
  const { newCase } = input;
  return `你是 CBR 知识库的"关系发现者"。判断【新案例】与【已有案例】之间存在哪些有意义的关系边。

== 新案例 ==
领域：${newCase.domain}
决策类型：${newCase.decisionType}
框架：${newCase.frameworks.join('、') || '—'}
问题摘要：${newCase.signatureText}
方案摘要：${newCase.solutionText}

== 已有案例 ==
${formatExisting(input.existing)}

== 关系类型 ==
- shares_framework：用了相同的思维框架
- shares_domain：同一问题领域
- contrasts：相似问题但做了相反选择（有价值的对照案例）
- composed_from：本案例复用了该案例的部分
- caused_by：本决策由该案例的结果触发

== 要求 ==
- 只在关系**确实存在**时才连边；宁缺毋滥。可以一条都不连。
- targetCaseId 只能是上面列出的 id，不要编造。
- weight（0–1）表示关系强度。

只输出 JSON：
{ "relations": [ { "targetCaseId": "<已有案例id>", "relationType": "shares_domain", "weight": 0.0 } ] }`;
}

import { z } from 'zod';
import {
  ProblemSignatureSchema,
  ReasoningPathSchema,
  SolutionPatternSchema,
} from '@nodx/models';
import { MODELS, type ModelId } from '../models.js';
import { JSON_QUOTE_RULE } from '../prompts/json-safety.js';

export const ABSTRACTOR_PROMPT_VERSION = '2026-06-04.v1';
export const ABSTRACTOR_PROMPT_MODEL: ModelId = MODELS.sonnet;

/**
 * Input to the 抽象师 (PRD §3.16 step ①). The source is a Topic that reached
 * localMaximum via the expert panel — we feed its question + the panel's
 * synthesised Local Max so the abstractor can distil a reusable case.
 */
export interface AbstractorInput {
  /** The direction question (Topic title). */
  question: string;
  /** Parent / prior context; empty string when none. */
  context: string;
  /** The panel's synthesised answer (Topic.aiSummary). */
  bestAnswer: string;
  consensus: string[];
  divergence: Array<{ point: string; conditions: string }>;
  openQuestions: string[];
  /** Panel confidence (0–1) — an anchor for the abstractor's qualityScore. */
  confidence: number;
}

/**
 * What the abstractor emits: the AI-authored, de-identified content of an
 * AbstractedCase. The id / embeddings / visibility / dates are added by the
 * indexer + persistence layer, so they're not part of this schema. The three
 * structured blocks reuse the canonical `@nodx/models` shapes.
 */
export const AbstractorOutputSchema = z
  .object({
    problemSignature: ProblemSignatureSchema,
    reasoningPath: ReasoningPathSchema,
    solutionPattern: SolutionPatternSchema,
    /** Abstractor's assessment of how solid / reusable this case is (0–1). */
    qualityScore: z.number().min(0).max(1),
  })
  .strict();
export type AbstractorOutput = z.infer<typeof AbstractorOutputSchema>;

function bulletize(items: string[]): string {
  return items.length ? items.map((s) => `- ${s}`).join('\n') : '（无）';
}

/**
 * 抽象师 — Sonnet. Takes a converged decision and distils it into a
 * domain-tagged, **de-identified** case: the problem scene, the reasoning
 * method, and the solution shape. De-identification is folded in (per the
 * §3.16 "省钱原则" we don't run a separate Haiku sanitiser in V1): strip
 * company / person / product names, and keep numbers only at order-of-
 * magnitude ("亿级" not "3.7 亿").
 */
export function buildAbstractorPrompt(input: AbstractorInput): string {
  const divergence = input.divergence.length
    ? input.divergence
        .map((d) => `- ${d.point}（前提：${d.conditions}）`)
        .join('\n')
    : '（无）';

  return `你是 CBR（案例推理）知识库的"抽象师"。把一个已经收敛的决策，抽象成一个**去标识化、可复用**的案例。

== 原始决策 ==
方向问题：${input.question}
背景上下文：${input.context || '（无）'}
最佳结论：${input.bestAnswer}
共识：
${bulletize(input.consensus)}
仍存分歧：
${divergence}
开放问题：
${bulletize(input.openQuestions)}
专家组置信度：${input.confidence}

== 去标识化要求（必须做）==
- 去掉公司名 / 人名 / 产品名 / 可识别的内部代号
- 数字只保留量级（"亿级""数百万"），不要具体数字
- 时间相对化（"高利率周期"而非具体日期）

== 抽象要求 ==
把案例拆成三块，提炼"可迁移的本质"，不要照抄原文：
1. problemSignature：这是个什么类型的决策问题（领域、决策类型、关键维度、硬约束）
2. reasoningPath：用了哪些思维框架、问了哪些关键问题、做了哪些关键取舍
3. solutionPattern：方案的结构、关键杠杆、风险缓解手段
并给一个 qualityScore（0–1）：这个案例作为可复用知识有多扎实（可参考专家组置信度，但你自己判断）。

decisionType 只能取：'go_no_go'（做不做）| 'allocation'（资源分配）| 'sequencing'（先后顺序）| 'tradeoff'（多选一权衡）。

只输出 JSON：
{
  "problemSignature": { "domain": "<领域名词短语>", "decisionType": "go_no_go", "keyDimensions": ["..."], "constraints": ["..."] },
  "reasoningPath": { "frameworks": ["..."], "keyQuestions": ["..."], "pivotalDecisions": ["..."] },
  "solutionPattern": { "structure": "<方案结构一句话>", "keyLevers": ["..."], "riskMitigations": ["..."] },
  "qualityScore": 0.0
}${JSON_QUOTE_RULE}`;
}

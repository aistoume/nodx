import { z } from 'zod';
import { MODELS, type ModelId } from '../models.js';
import { JSON_QUOTE_RULE } from '../prompts/json-safety.js';

export const ADAPTER_PROMPT_VERSION = '2026-06-04.v1';
export const ADAPTER_PROMPT_MODEL: ModelId = MODELS.sonnet;

/**
 * Input to the 适配执行师 (PRD §3.16 ④). The user picked one retrieved case
 * to "采用"; we hand the adapter the case's distilled content + the new
 * question/context so it can *rewrite* (not replay) the old solution.
 */
export interface AdapterInput {
  /** The user's new question. */
  query: string;
  /** New-situation context (industry / size / time / constraints). Empty ok. */
  newContext: string;
  /** The chosen case. */
  sourceCase: {
    id: string;
    domain: string;
    decisionType: string;
    /** Text-ified problem signature. */
    signatureText: string;
    /** Text-ified solution pattern. */
    solutionText: string;
    /** Thinking frameworks used in the original case. */
    frameworks: string[];
  };
}

/**
 * Adapter output. Mirrors PRD §3.16 ④'s AdaptedSolution but without the
 * `sourceCaseId` (the caller fills that in from the chosen case, so the model
 * can't get it wrong).
 */
export const AdapterOutputSchema = z
  .object({
    inheritedStructure: z.string().min(1),
    contextualizedLevers: z.array(z.string().min(1)),
    newRiskMitigations: z.array(z.string().min(1)),
    requiresExpertPanel: z.boolean(),
    rediscussDirections: z.array(z.string().min(1)),
  })
  .strict();
export type AdapterOutput = z.infer<typeof AdapterOutputSchema>;

/**
 * 适配执行师 — Sonnet. The non-negotiable rule (PRD §3.15 "Fork & Adapt, 绝不
 * Replay"): never hand back the old answer. Keep the transferable skeleton,
 * re-express the levers for the new context, add new-situation risks, and
 * honestly flag whether the differences are big enough to need a fresh debate
 * — if so, name exactly which points to re-debate (so the panel runs only the
 * diff, not the whole thing).
 */
export function buildAdapterPrompt(input: AdapterInput): string {
  const { sourceCase } = input;
  return `你是 CBR 的"适配执行师"。用户选中了一个历史案例想复用到他的新问题上。你的任务是把老方案**改写**到新语境——**绝不照搬老答案**（老案例是脚手架，不是答案）。

== 用户的新问题 ==
${input.query}
新语境：${input.newContext || '（未提供，按通用情况处理）'}

== 选中的历史案例 ==
领域：${sourceCase.domain}
决策类型：${sourceCase.decisionType}
思维框架：${sourceCase.frameworks.join('、') || '—'}
问题场景：${sourceCase.signatureText}
方案模式：${sourceCase.solutionText}

== 输出要求 ==
- inheritedStructure：从老方案里**可迁移的骨架**（一句话，保留的结构/方法）
- contextualizedLevers：把关键杠杆**针对新语境重新表述**（不是抄老的）
- newRiskMitigations：新情况**特有的**风险与缓解
- requiresExpertPanel：新旧语境差异是否大到**需要重新辩论**（true/false，诚实判断）
- rediscussDirections：若 requiresExpertPanel=true，**具体列出**该重新讨论的差异点（让专家组只跑这些，而不是从头跑）；若 false 则为空数组

只输出 JSON：
{
  "inheritedStructure": "...",
  "contextualizedLevers": ["..."],
  "newRiskMitigations": ["..."],
  "requiresExpertPanel": true,
  "rediscussDirections": ["..."]
}${JSON_QUOTE_RULE}`;
}

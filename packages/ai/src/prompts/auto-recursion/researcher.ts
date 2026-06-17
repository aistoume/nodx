import { z } from 'zod';
import { MODELS, type ModelId } from '../../models.js';
import { JSON_QUOTE_RULE } from '../json-safety.js';

// ──────────────────────────────────────────────────────────────────────
// 现实数据研究员 (PRD §3.19 改进): when the PM flags needs_real_world_data,
// try a web search FIRST — some "real-world" gaps (market prices, vendor
// capabilities, regulatory timelines) are publicly answerable. Two stages:
//
//   1. researcher — Sonnet WITH enableWebSearch, freeform Markdown findings
//      (web-search responses carry citations; forcing JSON here is fragile)
//   2. verdict    — Haiku, strict JSON: which gaps are now resolved vs
//      still genuinely missing (needs proprietary/interview/measured data)
//
// Only if the verdict says still_blocked does the run stop — and the
// findings are persisted to the node either way, so nothing is lost.
// ──────────────────────────────────────────────────────────────────────

export const RESEARCHER_PROMPT_VERSION = '2026-06-12.v1';
export const RESEARCHER_PROMPT_MODEL: ModelId = MODELS.sonnet;

export interface ResearcherInput {
  topicTitle: string;
  /** The accepted conclusion (trimmed) — context for what the gaps block. */
  bestAnswer: string;
  /** The real-world data gaps the PM identified (whatsMissing). */
  gaps: string[];
}

/**
 * Freeform-Markdown research pass over the PM's data gaps. Honesty is the
 * core requirement: a gap that needs proprietary data must be SAID to be
 * unanswerable, not paper-filled with plausible-sounding numbers.
 */
export function buildResearcherPrompt(input: ResearcherInput): string {
  return `你是研究员。一个决策推进到这里时，项目经理判断缺少"真实世界数据"。请用网络搜索逐条核实这些缺口——有些其实是公开可查的（市场价格、供应商能力、监管时限、行业基准），有些则真的查不到（内部数据、需访谈/实测的结论）。

【决策方向】
${input.topicTitle}

【已采纳的结论（数据缺口阻塞的对象）】
${input.bestAnswer.slice(0, 800)}

【待核实的数据缺口】
${input.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}

要求：
1. **逐条**处理上面每个缺口，用 \`### 缺口 N：<缩写>\` 作小标题。
2. 查得到的：给出**具体数据 + 来源**（站点/机构名 + 时间），并注明可信度（高/中/低）。
3. 查不到的：明确写「**❌ 公开渠道无法回答**」+ 一句为什么（如"需要贵司内部交易数据"），**绝不编造数字**。
4. 末尾加 \`### 总结\`：一句话说明几条已补齐、几条仍缺。
5. 直接输出 Markdown，不要代码块包装。

开始：`;
}

export const RESEARCH_VERDICT_PROMPT_VERSION = '2026-06-12.v1';
export const RESEARCH_VERDICT_PROMPT_MODEL: ModelId = MODELS.haiku;

export interface ResearchVerdictInput {
  gaps: string[];
  /** The researcher's Markdown findings. */
  findingsMarkdown: string;
}

/**
 * Did the research actually unblock the run? Referenced by **gap number**
 * (1-based, matching the prompt's numbered list) instead of echoing the full
 * gap text — the gaps can be long paragraphs, so echoing them blew past
 * Haiku's token budget and truncated the JSON. The caller maps numbers back
 * to the full gap strings.
 *
 * `resolved_enough` = remaining gaps no longer block the PM re-triage;
 * `still_blocked` = keeps the honest real-world stop.
 */
export const ResearchVerdictSchema = z
  .object({
    resolvedGaps: z.array(z.number().int().positive()),
    stillMissing: z.array(z.number().int().positive()),
    verdict: z.enum(['resolved_enough', 'still_blocked']),
  })
  .strict();
export type ResearchVerdict = z.infer<typeof ResearchVerdictSchema>;

export function buildResearchVerdictPrompt(
  input: ResearchVerdictInput,
): string {
  return `判定一次网络搜索是否补齐了决策所缺的真实世界数据。

【待判定的数据缺口】（带编号）
${input.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}

【搜索结果】
${input.findingsMarkdown.slice(0, 4000)}

判定规则：
- resolvedGaps：搜索给出了**具体、有来源**数据、已不再阻塞的缺口**编号**
- stillMissing：仍然缺的缺口**编号**（搜索明确说查不到，或给出的内容空泛/无来源）
- verdict："resolved_enough"（剩余缺口已不阻塞继续推演）或 "still_blocked"（关键缺口仍在，必须停下来等真实数据）。**宁可保守**：拿不准时选 still_blocked。

**只填上面的缺口编号（数字），不要复述缺口文字。** 只输出 JSON：
{"resolvedGaps":[1],"stillMissing":[2,3],"verdict":"still_blocked"}${JSON_QUOTE_RULE}`;
}

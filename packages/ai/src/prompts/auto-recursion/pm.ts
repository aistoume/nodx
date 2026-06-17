import { z } from 'zod';
import {
  NextMovePlanStatusSchema,
  RecommendedActionSchema,
} from '@nodx/models';
import { MODELS, type ModelId } from '../../models.js';
import { JSON_QUOTE_RULE } from '../json-safety.js';

export const PM_PROMPT_VERSION = '2026-06-08.v2';
export const PM_PROMPT_MODEL: ModelId = MODELS.sonnet;

export interface PmInput {
  /** The evaluated Topic's title (the direction's core question). */
  topicTitle: string;
  /** The accepted Local Maximum being triaged. */
  bestAnswer: string;
  consensus: string[];
  divergence: { point: string; conditions: string }[];
  openQuestions: string[];
  confidence: number;
  /** Recursion lineage, when the PM runs below the root (depth ≥ 1). */
  parentContext?: { depth: number; ancestorTopicTitles: string[] };
  /**
   * 研究员 web-search findings from a prior needs_real_world_data verdict —
   * when present the PM re-triages WITH this data, and must not re-flag
   * gaps the findings already answer.
   */
  researchFindings?: string;
}

/**
 * Models routinely emit `"field": null` for optionals despite being told to
 * omit them (live-verified on Sonnet) — accept null and normalise to
 * undefined so the rest of the pipeline only deals with absence.
 */
const optionalNullableString = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined);

/**
 * A candidate as the PM emits it — title + provenance + recommended action
 * ONLY. Feasibility breakdown / score are the 评分员's job (separate Haiku
 * calls); the orchestrator merges them in afterwards.
 */
export const PmChildCandidateSchema = z
  .object({
    title: z.string().min(1),
    sourceOpenQuestion: optionalNullableString,
    sourceOptionChoice: optionalNullableString,
    recommendedAction: RecommendedActionSchema,
  })
  .strict();
export type PmChildCandidate = z.infer<typeof PmChildCandidateSchema>;

/**
 * The PM's raw triage output (pre-enrichment). `topPick` here is a
 * qualitative draft — the orchestrator recomputes it from the 评分员's
 * feasibility scores and annotates the reasoning if they disagree.
 */
export const PmOutputSchema = z
  .object({
    status: NextMovePlanStatusSchema,
    atomicityScore: z.number().min(0).max(1),
    whatsMissing: z.array(z.string().min(1)),
    childCandidates: z.array(PmChildCandidateSchema).max(5),
    topPick: optionalNullableString,
    topPickReasoning: optionalNullableString,
  })
  .strict();
export type PmOutput = z.infer<typeof PmOutputSchema>;

function formatList(items: string[]): string {
  return items.length ? items.map((s) => `- ${s}`).join('\n') : '（无）';
}

/**
 * 项目经理 PM (PRD §3.19 / §4) — triages a freshly-accepted Local Maximum:
 * is it atomic enough to act on, and if not, what's the next move? Routed
 * to Sonnet: this is a judgment call that shapes everything downstream.
 *
 * Deliberately NOT asked for feasibility numbers — candidate scoring is the
 * 可行性评分员's job (Haiku, one call per candidate), keeping each model on
 * the task it's priced for.
 */
export function buildPmPrompt(input: PmInput): string {
  const lineage = input.parentContext
    ? `\n递进谱系：这是自动递进的第 ${input.parentContext.depth} 层。根问题到这里的路径：${input.parentContext.ancestorTopicTitles.join(' → ')}。不要提出与祖先话题重复的候选。\n`
    : '';

  const divergenceBlock = input.divergence.length
    ? input.divergence
        .map((d) => `- ${d.point}（${d.conditions}）`)
        .join('\n')
    : '（无）';

  const researchBlock =
    input.researchFindings && input.researchFindings.trim()
      ? `
【已通过网络搜索补充的现实数据】（研究员刚核实过——这些缺口**已有数据**，重新分流时不要再把它们标成 needs_real_world_data；把数据当作已知事实使用）
${input.researchFindings.trim().slice(0, 5000)}
`
      : '';

  return `你是项目经理（PM）。一个专家组刚就下面的方向收敛出结论，用户已采纳。你的任务：判断这个结论**够不够"原子"**——能不能直接拿去执行——并决定下一步怎么推进。
${lineage}${researchBlock}
【方向（核心问题）】
${input.topicTitle}

【专家组结论（把握 ${Math.round(input.confidence * 100)}%）】
${input.bestAnswer}

【共识】
${formatList(input.consensus)}

【仍存分歧（分歧点（什么前提下倒向哪边））】
${divergenceBlock}

【未解卡点】
${formatList(input.openQuestions)}

== 评估标准 ==

1. **atomicityScore（0–1）**：原子 = 谁（who）/ 做什么（what）/ 何时（when）/ 产出物（deliverable）四要素齐备、可验收。四要素各占约 1/4，缺则扣。
2. **status 分流**（四选一）：
   - "atomic_complete"：够原子（约 atomicityScore ≥ 0.7），到此为止
   - "needs_deepening"：还需深挖——卡点或模糊处可以靠继续思考解决
   - "needs_real_world_data"：缺的是真实世界数据（市场实测 / 用户访谈 / 报价单 / 法务意见），**再想也想不出来**。这不是逃避，是诚实标记"这个不是想出来的"——标了就停，别让 AI 编造调研结果
   - "multi_path_choice"：存在多个并列方案，必须先择一才能继续
   **分流边界（容易判错）**：缺口如果是**用户自己一句话就能回答的前提问题**（如"资金性质是什么""要不要商业化""预算上限多少"），那是待择一的分叉 → 归 "multi_path_choice"（或可继续推演的 "needs_deepening"），**不算 needs_real_world_data**。"needs_real_world_data" 只留给必须由外部世界产生的事实：实测数据、第三方报价、法律意见、访谈结果。
3. **whatsMissing**：还缺什么才算原子（短句列表；atomic_complete 时为空数组）。
4. **childCandidates**：**仅当 status 为 "needs_deepening" 或 "multi_path_choice" 时填**（其余 status 一律给空数组）。最多 5 个，每个：
   - title：子话题标题（一个聚焦的可辩论问题）
   - sourceOpenQuestion：衍生自哪个卡点（如适用）
   - sourceOptionChoice：衍生自哪个分叉选项（如适用）
   - recommendedAction："spawn_and_run" | "spawn_only" | "skip" | "flag_as_real_world_action"
   **不要给候选打可行性分**——那是另一位评分员的工作。
5. **topPick / topPickReasoning**：从候选中**定性**推荐一个（写 title 原文），说明为什么。最终排序会由评分员的分数决定，你的推荐只是草稿。无候选时两个字段都省略。

只输出 JSON：
{
  "status": "needs_deepening",
  "atomicityScore": 0.0,
  "whatsMissing": ["<短句>"],
  "childCandidates": [
    {
      "title": "<子话题标题>",
      "sourceOpenQuestion": "<可选>",
      "sourceOptionChoice": "<可选>",
      "recommendedAction": "spawn_and_run"
    }
  ],
  "topPick": "<候选 title 原文，可选>",
  "topPickReasoning": "<一两句，可选>"
}${JSON_QUOTE_RULE}`;
}

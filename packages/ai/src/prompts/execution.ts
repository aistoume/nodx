import { z } from 'zod';
import { MODELS, type ModelId } from '../models.js';
import { JSON_QUOTE_RULE } from './json-safety.js';
import { ReportActionItemSchema } from './report.js';

export const EXTRACT_EXECUTION_PROMPT_VERSION = '2026-06.v1';
export const EXTRACT_EXECUTION_PROMPT_MODEL: ModelId = MODELS.sonnet;

/** An atomic action already pinned in the thinking node (Comment.type='atomic'). */
export interface AtomicActionInput {
  who: string;
  what: string;
  when: string;
  deliverable: string;
  isComplete: boolean;
}

export interface ExtractExecutionInput {
  topicTitle: string;
  /** Plain-text of the thinking node's document (trimmed to ~10k). */
  documentText: string;
  /** Already-pinned atomic actions, folded in verbatim as a starting point. */
  atomicActions: AtomicActionInput[];
}

/**
 * The split-out 执行方案: a verifiable action checklist plus what must be in
 * place before starting. `actionItems` reuse the report's 谁/做什么/何时/产出
 * shape (see ReportActionItem).
 */
export const ExecutionPlanOutputSchema = z
  .object({
    /** A concrete title for the execution node (imperative, ≤ 24 字). */
    title: z.string().min(1),
    actionItems: z.array(ReportActionItemSchema),
    /** Prerequisites / open decisions that gate execution. */
    dependencies: z.array(z.string().min(1)),
  })
  .strict();
export type ExecutionPlanOutput = z.infer<typeof ExecutionPlanOutputSchema>;

function formatAtomics(actions: AtomicActionInput[]): string {
  if (actions.length === 0) return '（无已标记的原子动作）';
  return actions
    .map(
      (a) =>
        `- 谁：${a.who}｜做什么：${a.what}｜何时：${a.when}｜产出：${a.deliverable}${a.isComplete ? '（已完成）' : ''}`,
    )
    .join('\n');
}

/**
 * 执行拆分者 — reads a thinking node's document + its pinned atomic actions
 * and distils the *concrete execution plan* out of it: who does what by when
 * with what deliverable. Extraction, not invention — if the source doesn't
 * name an owner or date, leave that field empty rather than fabricating.
 */
export function buildExtractExecutionPrompt(
  input: ExtractExecutionInput,
): string {
  return `你是执行拆分者。下面是一个"思考节点"的文档 + 已经标记的原子动作。请把其中**具体的执行方案**抽取出来，整理成一份可验收的行动清单——谁、做什么、何时、产出什么。

【思考节点主题】
${input.topicTitle}

【已标记的原子动作】（直接纳入清单起点，可细化）
${formatAtomics(input.atomicActions)}

【思考文档全文】
${input.documentText.slice(0, 10000) || '（空）'}

要求：
1. **只抽取、不发明**：文档里没写负责人/时间就把 who/when 留空，绝不编造。
2. actionItems：每条尽量填 who / what / when / deliverable（what 必填）；把文档"下一步"里的动作、已标记的原子动作都收进来，去重合并。
3. dependencies：开工前必须先就位的前提、或还没定的关键决策（列表；没有就空数组）。
4. title：给这份执行方案起一个具体的祈使句标题（≤24 字，如"落地第三方风控接入"）。

只输出 JSON：
{
  "title": "<执行方案标题>",
  "actionItems": [
    { "who": "<可空>", "what": "<必填>", "when": "<可空>", "deliverable": "<可空>" }
  ],
  "dependencies": ["<前提/待决>"]
}${JSON_QUOTE_RULE}`;
}

/** Render an execution plan as the new execution node's Markdown document. */
export function executionToMarkdown(plan: ExecutionPlanOutput): string {
  const parts: string[] = [`# ▶ 执行方案：${plan.title}`];

  if (plan.actionItems.length > 0) {
    parts.push(
      '## 行动清单',
      '| 谁 | 做什么 | 何时 | 产出物 |',
      '|---|---|---|---|',
      ...plan.actionItems.map(
        (a) =>
          `| ${a.who ?? '—'} | ${a.what} | ${a.when ?? '—'} | ${a.deliverable ?? '—'} |`,
      ),
    );
  } else {
    parts.push('## 行动清单', '（暂无——回到思考节点先沉淀出具体动作）');
  }

  if (plan.dependencies.length > 0) {
    parts.push(
      '## 开工前提 / 待决',
      ...plan.dependencies.map((d) => `- ${d}`),
    );
  }

  return parts.join('\n\n');
}

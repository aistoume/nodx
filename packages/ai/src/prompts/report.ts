import { z } from 'zod';
import { MODELS, type ModelId } from '../models.js';
import { JSON_QUOTE_RULE } from './json-safety.js';

export const REPORT_PROMPT_VERSION = '2026-06-04.v1';
export const REPORT_PROMPT_MODEL: ModelId = MODELS.sonnet;

/** One node (Topic) of the scanned subtree, condensed for the report. */
export interface ReportNode {
  title: string;
  /** aiSummary if present, else a document excerpt — the node's substance. */
  content: string;
  /** 原子动作 (atomic comments), text-formatted. */
  atomicActions: string[];
  /** 卡点 / open questions on this node. */
  openQuestions: string[];
}

export interface ReportInput {
  /** The root decision question. */
  rootQuestion: string;
  /** The root + descendant topics (BFS order). */
  nodes: ReportNode[];
}

export const ReportActionItemSchema = z
  .object({
    who: z.string().optional(),
    what: z.string().min(1),
    when: z.string().optional(),
    deliverable: z.string().optional(),
  })
  .strict();
export type ReportActionItem = z.infer<typeof ReportActionItemSchema>;

/**
 * 收尾整理者 output (PRD §3.10 / §8.7): the three deliverables for the boss —
 * a 3–5 sentence summary, a structured action list, and the open questions.
 */
export const ReportOutputSchema = z
  .object({
    /** 决策摘要 — 3–5 句给老板. */
    summary: z.string().min(1),
    /** 行动清单 — 谁/做什么/何时/产出. */
    actionItems: z.array(ReportActionItemSchema),
    /** 未解问题清单. */
    openQuestions: z.array(z.string().min(1)),
  })
  .strict();
export type ReportOutput = z.infer<typeof ReportOutputSchema>;

function formatNode(n: ReportNode, i: number): string {
  const lines = [`### 方向 ${i + 1}：${n.title}`, n.content || '（无小结）'];
  if (n.atomicActions.length) {
    lines.push('原子动作：\n' + n.atomicActions.map((a) => `  - ${a}`).join('\n'));
  }
  if (n.openQuestions.length) {
    lines.push('卡点：\n' + n.openQuestions.map((q) => `  - ${q}`).join('\n'));
  }
  return lines.join('\n');
}

/**
 * 收尾整理者 — Sonnet. Distils a whole decision subtree into a report an
 * executive can act on. Stay faithful to the material; the action list should
 * be concrete (prefer 谁/何时/产出 when the source has them), and openQuestions
 * carry forward what's genuinely unresolved (卡点 + judgement gaps).
 */
export function buildReportPrompt(input: ReportInput): string {
  return `你是决策"收尾整理者"。下面是一个决策（含若干子方向）的全部思考材料。请整理成一份给老板看的**决策汇报**，三段：摘要 / 行动清单 / 未解问题。

== 核心决策 ==
${input.rootQuestion}

== 各方向的思考材料 ==
${input.nodes.map(formatNode).join('\n\n')}

== 输出要求 ==
- summary：决策摘要，3–5 句，直接给老板看，说清"结论是什么、为什么、下一步大方向"。
- actionItems：行动清单。尽量结构化（who 责任人 / what 做什么 / when 时间 / deliverable 产出物）；
  材料里没有的字段可省略，但 what 必填。把分散在各方向的原子动作汇总、去重、排序。
- openQuestions：未解问题清单（汇总各方向的卡点 + 仍需判断/数据的点），按重要性排序。

只输出 JSON：
{
  "summary": "...",
  "actionItems": [ { "who": "...", "what": "...", "when": "...", "deliverable": "..." } ],
  "openQuestions": ["..."]
}${JSON_QUOTE_RULE}`;
}

/** Serialise a report to Markdown (MVP export format, PRD §3.10). Pure. */
export function reportToMarkdown(
  report: ReportOutput,
  rootQuestion: string,
): string {
  const out: string[] = [
    `# 决策汇报：${rootQuestion}`,
    '',
    '## 决策摘要',
    report.summary,
    '',
    '## 行动清单',
  ];
  if (report.actionItems.length === 0) {
    out.push('（暂无）');
  } else {
    out.push('| 谁 | 做什么 | 何时 | 产出 |', '|---|---|---|---|');
    for (const a of report.actionItems) {
      const cell = (s?: string) => (s ? s.replace(/\|/g, '\\|') : '—');
      out.push(`| ${cell(a.who)} | ${cell(a.what)} | ${cell(a.when)} | ${cell(a.deliverable)} |`);
    }
  }
  out.push('', '## 未解问题');
  if (report.openQuestions.length === 0) {
    out.push('（暂无）');
  } else {
    for (const q of report.openQuestions) out.push(`- ${q}`);
  }
  out.push('');
  return out.join('\n');
}

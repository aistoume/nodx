import { MODELS, type ModelId } from '../../models.js';

export const PANEL_MERGE_PROMPT_VERSION = '2026-06-07.v1';
export const PANEL_MERGE_PROMPT_MODEL: ModelId = MODELS.sonnet;

export interface PanelMergeDivergence {
  point: string;
  conditions: string;
}

export interface PanelMergeInput {
  /** The direction / question this panel debated (topic title). */
  question: string;
  /** Detected domain of the panel (e.g. 战略 / 财务). */
  domain: string;
  /** Local-Maximum synthesis fields the debate converged on. */
  bestAnswer: string;
  consensus: string[];
  divergence: PanelMergeDivergence[];
  openQuestions: string[];
  confidence: number;
  /**
   * Plain-text dump of the topic's current thinking document, for context so
   * the AI writes a section that *continues* the document instead of
   * repeating ground already covered. May be empty. Trimmed to ~8k chars.
   */
  documentText?: string;
}

/**
 * 收尾整理者 (PRD §8.7) — folds an expert-panel's Local Maximum back into the
 * thinking document. Output is freeform Markdown: a single cohesive section
 * (one H2 + prose) that the caller appends to the end of the document. It
 * weaves the structured synthesis (结论 / 共识 / 分歧 / 待解问题) into flowing
 * text that fits the document's voice, rather than dumping the raw fields.
 */
export function buildPanelMergePrompt(input: PanelMergeInput): string {
  const confidencePct = Math.round(input.confidence * 100);

  const consensusBlock =
    input.consensus.length > 0
      ? input.consensus.map((c) => `- ${c}`).join('\n')
      : '（无）';
  const divergenceBlock =
    input.divergence.length > 0
      ? input.divergence
          .map((d) => `- ${d.point}（前提/条件：${d.conditions}）`)
          .join('\n')
      : '（无）';
  const openBlock =
    input.openQuestions.length > 0
      ? input.openQuestions.map((q) => `- ${q}`).join('\n')
      : '（无）';

  const docBlock =
    input.documentText && input.documentText.trim()
      ? `【当前思考文档已有内容】（你写的小节将接在它后面，不要重复这里已经讲过的内容）
${input.documentText.trim().slice(0, 8000)}

`
      : '';

  return `你是一位"收尾整理者"。一组互补的 AI 专家刚就下面这个方向做完了结构化辩论，收敛出了一个 Local Maximum 结论。请你把这份结论**归纳成一段能直接并入用户思考文档的小节**。

${docBlock}【辩论的方向 / 问题】
${input.question}

【领域】
${input.domain}

【专家组收敛出的结论（best answer，把握 ${confidencePct}%）】
${input.bestAnswer}

【已达成的共识】
${consensusBlock}

【仍存的分歧（point — 在什么前提下倒向哪边）】
${divergenceBlock}

【尚未解决的开放问题 / 卡点】
${openBlock}

写作要求：
1. 用 Markdown 输出，**以一个 H2 标题开头**：\`## 专家组结论：…\`（冒号后用一句话点出方向）。
2. 标题下**先用 2-4 句话的连贯段落给出核心结论**（融合 best answer 与把握度），让读者一眼看清"专家组建议怎么做、有多大把握"。不要写成字段堆叠。
3. 然后按需用 \`### 共识\`、\`### 仍存分歧\`、\`### 待解问题（卡点）\` 三个小节承接——**只写有内容的小节**（对应输入为"无"的就省略）。分歧要讲清"在什么前提下会倒向哪边"；待解问题用列表，每条以 \`> [需用户判断]\` 引用块开头。
4. 语气与一份深度思考文档一致：克制、具体、给判断，不要营销腔，不要"综上所述"之类的空话。
5. **不要重复**当前文档已经详细讨论过的论据；这一节是"专家组怎么看 + 收敛到哪"的增量。
6. **直接输出 Markdown 正文**，从 \`## 专家组结论\` 开始，不要 \\\`\\\`\\\` 代码块包装、不要"以下是"等前缀。

开始写：
`;
}

import { MODELS, type ModelId } from '../models.js';
import type { DecomposedFactor } from './decompose.js';

export const DOCUMENT_DRAFT_PROMPT_VERSION = '2026-05-05.v1';
export const DOCUMENT_DRAFT_PROMPT_MODEL: ModelId = MODELS.sonnet;

export interface DocumentDraftInput {
  question: string;
  selectedFactors: string[];
  decomposed: DecomposedFactor[];
}

/**
 * Initial "thinking document" generation prompt.
 *
 * Output is freeform Markdown — no JSON schema. The caller (apps/desktop
 * ai/document.ts) uses completeText() and feeds the result through marked
 * to produce HTML for the TipTap editor.
 *
 * Structure: opening framing paragraph → one H2 per chosen factor (each
 * with AI's analysis + "待回答" sub-section pinned to the decompose
 * sub-questions) → closing "下一步" H2 with concrete actions.
 */
export function buildDocumentDraftPrompt(input: DocumentDraftInput): string {
  const decomposedBlock = input.decomposed
    .map(
      (f, i) =>
        `${i + 1}. ${f.title}\n   本质：${f.essence}\n   子问题：\n${f.sub_questions
          .map((sq) => `     - ${sq.question}`)
          .join('\n')}`,
    )
    .join('\n\n');

  return `你是一位深度思考者。基于用户的决策问题、用户选定的关注维度，以及第一性原理拆解的子问题，写一份"思考文档"。这份文档将作为用户后续编辑、深化思考的起点。

【用户问题】
${input.question}

【用户选定的关注维度】
${input.selectedFactors.join('、')}

【第一性原理拆解结果】
${decomposedBlock}

文档要求：
1. 用 Markdown 格式输出。
2. **首段**（不带任何标题）：用 2-3 句话框定问题的本质和决策杠杆，让读者一眼看出"赌的是什么"。
3. **每个关注维度一个 H2 章节**（## {维度名}），章节内容：
   - 一段 AI 的核心思考（150-250 字），给出**真实的分析、视角、决策杠杆**。不要含糊的"需要考虑 X"，要给具体观点。
   - 一个 \`### 待回答\` 小节，列出该维度对应的子问题，每条以 \`> [需用户判断]\` 引用块开头，再用一两句给出你的初步判断或参考方向。
4. **最后一个 H2** 章节叫 \`## 下一步\`，列 3-5 个具体可执行的动作（带主语和时间约束，例如"本周内完成对 3 家头部公司的访谈"）。
5. **直接输出 Markdown 正文**，不要用 \\\`\\\`\\\` 代码块包装、不要"以下是文档"等前缀，从首段开始即可。

开始写：
`;
}

export const REFINE_SELECTION_PROMPT_VERSION = '2026-05-05.v1';
export const REFINE_SELECTION_PROMPT_MODEL: ModelId = MODELS.sonnet;

export interface RefineSelectionInput {
  fullDocument: string;
  selection: string;
  userQuestion: string;
}

/**
 * Selection refinement prompt — when the user highlights a passage in the
 * document and asks AI to deepen it. The AI returns a single replacement
 * passage in the same shape (paragraph for paragraph, list-item for
 * list-item) so the editor can swap it inline.
 */
export function buildRefineSelectionPrompt(
  input: RefineSelectionInput,
): string {
  return `你是用户的思考陪练。下面是用户当前正在编辑的"思考文档"全文，以及用户选中、提出问题的某一段。请基于全文上下文，给出**一段改进版本**来替换选中部分。

【文档全文】
${input.fullDocument}

【选中部分】
${input.selection}

【用户问题】
${input.userQuestion}

要求：
1. 改进版本要**针对用户问题**进行回答和延展，加入具体的分析、数据点、决策杠杆。
2. 保持与原选中部分相当的篇幅（不要膨胀超过 50%）。
3. 保持与原选中部分一致的格式：原文是段落则输出段落；原文是列表项则输出列表项；原文是引用块则输出引用块。
4. **只输出改进后的 Markdown 内容**，不要任何说明、不要"改进版本："之类前缀、不要 \\\`\\\`\\\` 代码块包装。

开始：
`;
}

import { MODELS, type ModelId } from '../models.js';

export const SYNTHESIZE_MATERIALS_PROMPT_VERSION = '2026-07.v1';
export const SYNTHESIZE_MATERIALS_PROMPT_MODEL: ModelId = MODELS.sonnet;

/** One material linked into the thinking node as input. */
export interface SynthesisMaterialInput {
  /** '方案' (case) or '灵感' (attention) — for the model's context. */
  kindLabel: string;
  title: string;
  subtitle?: string;
  body?: string;
}

export interface SynthesizeMaterialsInput {
  /** The thinking node's title. */
  topicTitle: string;
  /** The user's question — what they want synthesised out of the inputs. */
  question: string;
  /** The materials the user linked to this node (方案 + 灵感). */
  materials: SynthesisMaterialInput[];
  /** Existing doc text of the node, if any — so we build on it, not repeat. */
  existingDoc?: string;
}

function formatMaterials(materials: SynthesisMaterialInput[]): string {
  if (materials.length === 0) return '（没有连入的素材）';
  return materials
    .map((m, i) => {
      const sub = m.subtitle ? `（${m.subtitle}）` : '';
      const body = m.body ? `\n   ${m.body}` : '';
      return `${i + 1}. 【${m.kindLabel}】${m.title}${sub}${body}`;
    })
    .join('\n');
}

/**
 * 素材综合者 — the user has pulled several 素材 (past 方案 + captured 灵感)
 * onto the canvas, wired them into one thinking node, and asked a question.
 * Synthesise those inputs into fresh thinking that answers the question —
 * cross-reference the materials, note where they agree / conflict / transfer,
 * and end with a concrete take. Output is freeform Markdown written into the
 * node's document.
 */
export function buildSynthesizeMaterialsPrompt(
  input: SynthesizeMaterialsInput,
): string {
  const existing =
    input.existingDoc && input.existingDoc.trim()
      ? `\n【这个节点已有的内容】（在它基础上延展，别重复）\n${input.existingDoc.trim().slice(0, 6000)}\n`
      : '';

  return `你是素材综合者。用户把下面几份"素材"（过去的方案 + 捕获的灵感）连到了同一个思考节点上，并提出了一个问题。请把这些素材**综合**成一段新的思考——不是罗列，而是交叉印证：它们在哪儿相互印证、哪儿冲突、哪些能迁移到当前问题上，最后给出一个具体的判断。
${existing}
【思考节点主题】
${input.topicTitle}

【用户的问题】
${input.question || '（未填写具体问题——就围绕主题综合这些素材）'}

【连入的素材】
${formatMaterials(input.materials)}

要求：
1. 用 Markdown 输出，以 \`## 素材综合\` 开头。
2. 先 2-4 句给出**综合后的核心判断**（直接回答用户问题）。
3. 再用 \`### 交叉印证 / 冲突\`、\`### 可迁移的点\` 等小节展开——**明确引用是哪份素材**（用它的标题）。
4. 结尾 \`### 对这个问题的启示\`：这些素材合起来告诉我们该怎么想/怎么做。
5. **只用连入的素材 + 你的推理**，不要编造素材里没有的事实。
6. 直接输出 Markdown 正文，不要 \\\`\\\`\\\` 包装、不要"以下是"等前缀。

开始：`;
}

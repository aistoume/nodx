import { MODELS, type ModelId } from '../../models.js';

export const PANEL_ROUND_PROMPT_VERSION = '2026-06-02.v1';
export const PANEL_ROUND_PROMPT_MODEL: ModelId = MODELS.sonnet;

/**
 * Round prompts produce a free-form utterance (one expert speaking), not
 * JSON — they go through `completeText`, and the model's reply is the
 * exchange content verbatim. The expert's persona is supplied separately
 * as the system prompt; these builders only assemble the *user* turn.
 */

/** What one other expert said, as shown to a peer in later rounds. */
export interface PeerUtterance {
  displayName: string;
  role: string;
  content: string;
}

export interface InitialRoundInput {
  /** The direction question under debate. */
  question: string;
  /** Parent / prior context; empty string when none. */
  context: string;
}

export interface CritiqueRoundInput {
  question: string;
  /** This expert's own Round-1 initial take. */
  ownInitial: string;
  /** Every *other* expert's Round-1 take. */
  peers: PeerUtterance[];
}

export interface RefineRoundInput {
  question: string;
  /** This expert's own Round-1 + Round-2 utterances, in order. */
  ownHistory: string[];
  /** Every *other* expert's Round-2 critique. */
  peerCritiques: PeerUtterance[];
}

function formatPeers(peers: PeerUtterance[]): string {
  return peers
    .map((p) => `【${p.displayName}（${p.role}）】\n${p.content}`)
    .join('\n\n');
}

/**
 * Round 1 — closed-book first take. Deliberately *excludes* every other
 * expert's view so first judgements don't contaminate each other
 * (PRD §3.14 Round 1 「独立首发」).
 */
export function buildInitialPrompt(input: InitialRoundInput): string {
  return `这是一场结构化专家辩论的第 1 轮：独立首发。请只凭你自己的专业判断，对下面的决策方向写出你的初步立场。**此刻你看不到其他专家的发言，不要假设他们会说什么。**

决策方向：${input.question}
背景上下文：${input.context || '（无上下文）'}

请给出：
1. 你的核心判断（立场鲜明）
2. 支撑判断的关键理由（用你的专业框架）
3. 你最担心 / 最不确定的点

用自然段落表达，保持你人格设定的视角和语气。`;
}

/**
 * Round 2 — cross-examination. The expert now reads peers' Round-1 takes
 * and pushes back / builds on them (PRD §3.14 Round 2 「交叉质疑」).
 */
export function buildCritiquePrompt(input: CritiqueRoundInput): string {
  return `这是辩论的第 2 轮：交叉质疑。下面是你自己的初判，以及其他专家的初判。请针对**其他专家**的观点写出你的反驳、补充或追问——指出你认为站不住脚的地方，也吸收你认为有道理的地方。

决策方向：${input.question}

你自己的初判：
${input.ownInitial}

其他专家的初判：
${formatPeers(input.peers)}

请逐一回应你最在意的几个分歧点：哪些观点你不同意、为什么；哪些让你重新考虑。保持你人格设定的视角。`;
}

/**
 * Round 3 — refine stance. The expert updates their position, explicitly
 * stating what changed their mind and what they hold (PRD §3.14 Round 3
 * 「修正立场」).
 */
export function buildRefinePrompt(input: RefineRoundInput): string {
  return `这是辩论的第 3 轮：修正立场。读完其他专家的质疑后，请更新你的立场，并**明确说出**：哪些地方你被说服了（改变了看法），哪些地方你依然坚持（以及为什么坚持）。

决策方向：${input.question}

你之前的发言：
${input.ownHistory.map((h, i) => `（第 ${i + 1} 次）${h}`).join('\n\n')}

其他专家对你的质疑：
${formatPeers(input.peerCritiques)}

请给出你修正后的最终立场，区分「已被说服」与「仍坚持」两部分。`;
}

import { z } from 'zod';
import { MODELS, type ModelId } from '../../models.js';
import { JSON_QUOTE_RULE } from '../json-safety.js';

export const RECAP_PROMPT_VERSION = '2026-06-04.v1';
export const RECAP_PROMPT_MODEL: ModelId = MODELS.sonnet;

/**
 * Input to the 思考复现者 (PRD §3.11 / §8.8). Assembled from the Topic's
 * reasoningTrace, recent session recaps, and unresolved 卡点.
 */
export interface RecapInput {
  /** The Topic's question/title — where the thinking started. */
  question: string;
  /** Condensed reasoning path the AI has been maintaining. */
  reasoningTrace?: string;
  /** Recent ThinkingSession recaps, newest first. */
  sessionRecaps: string[];
  /** Unresolved open-question (卡点) texts. */
  openQuestions: string[];
}

/**
 * The "上次回顾" card — fixed four sections (PRD §8.8 step 3), structured so
 * the UI renders each section cleanly.
 */
export const RecapOutputSchema = z
  .object({
    /** 起点：你从什么问题出发. */
    startingPoint: z.string().min(1),
    /** 路径：走过的 3–5 步推理. */
    path: z.array(z.string().min(1)),
    /** 卡点：上次停在哪、卡在什么. */
    stuckPoints: z.array(z.string().min(1)),
    /** 新进展：期间有无相关推进. */
    newProgress: z.array(z.string().min(1)),
  })
  .strict();
export type RecapOutput = z.infer<typeof RecapOutputSchema>;

function block(label: string, items: string[]): string {
  return `${label}\n${items.length ? items.map((s) => `- ${s}`).join('\n') : '（无）'}`;
}

/**
 * 思考复现者 — Sonnet. Reconstructs where the user left off so they can pick
 * the thread back up. Stays faithful to the supplied trace/recaps/卡点 — do
 * NOT invent progress that isn't in the inputs.
 */
export function buildRecapPrompt(input: RecapInput): string {
  return `用户隔了一段时间重新打开这个思考话题。请基于下面的材料，生成一张"上次回顾"卡片，帮他快速接上思路。

话题（起点问题）：${input.question}

已维护的推理路径：
${input.reasoningTrace || '（暂无）'}

${block('最近几次思考会话的小结（新→旧）：', input.sessionRecaps)}

${block('上次留下的卡点（未解决的问题）：', input.openQuestions)}

请严格基于以上材料，输出固定四段（不要编造材料里没有的内容）：
- startingPoint：一句话说清当初从什么问题出发
- path：走过的 3–5 步关键推理（基于推理路径）
- stuckPoints：上次停在哪、卡在什么（基于卡点；没有就空数组）
- newProgress：基于会话小结，最近有什么推进（没有就空数组）

只输出 JSON：
{
  "startingPoint": "...",
  "path": ["..."],
  "stuckPoints": ["..."],
  "newProgress": ["..."]
}${JSON_QUOTE_RULE}`;
}

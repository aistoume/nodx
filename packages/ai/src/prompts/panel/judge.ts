import { z } from 'zod';
import { MODELS, type ModelId } from '../../models.js';
import { JSON_QUOTE_RULE } from '../json-safety.js';

export const PANEL_JUDGE_PROMPT_VERSION = '2026-06-02.v1';
export const PANEL_JUDGE_PROMPT_MODEL: ModelId = MODELS.haiku;

/**
 * Below this, round N added little over round N-1 → the convergence
 * judge fires `marginal_decay` and the debate advances to synthesis
 * (PRD §8.9). Tunable; starts conservative so we don't cut debates short.
 */
export const MARGINAL_THRESHOLD = 0.15;

export interface PanelJudgeInput {
  question: string;
  /** Each expert's stance in the previous round (round N-1). */
  prevStances: string[];
  /** Each expert's stance in the current round (round N). */
  currStances: string[];
}

/**
 * `marginalScore` ∈ [0,1]: how much *new* substance round N added over
 * round N-1. High = positions still moving meaningfully; low = the
 * debate has stabilised (diminishing returns).
 */
export const PanelJudgeOutputSchema = z.object({
  marginalScore: z.number().min(0).max(1),
  rationale: z.string(),
});
export type PanelJudgeOutput = z.infer<typeof PanelJudgeOutputSchema>;

/**
 * Marginal-improvement judge — Haiku, because it runs at the end of every
 * round and is a relative comparison, not deep reasoning. Semantic-
 * convergence (embedding similarity) is the protocol's other stop signal
 * but needs an embedding endpoint we don't have yet, so this round relies
 * on marginal-decay + the 5-round hard cap (see plan).
 */
export function buildPanelJudgePrompt(input: PanelJudgeInput): string {
  return `你是辩论收敛裁判。比较专家组**前后两轮**的立场，判断后一轮相比前一轮带来了多少**实质性的新增改进**（新论点、立场移动、关键反驳被解决）。

决策方向：${input.question}

前一轮各专家立场：
${input.prevStances.map((s, i) => `[${i + 1}] ${s}`).join('\n\n')}

当前一轮各专家立场：
${input.currStances.map((s, i) => `[${i + 1}] ${s}`).join('\n\n')}

marginalScore 含义：
- 接近 1：立场仍在大幅移动，辩论远未收敛
- 接近 0：基本只是重复上一轮，已无实质新增（收益递减）

只输出 JSON（rationale 一句话，≤40 字）：
{
  "marginalScore": 0.0,
  "rationale": "<简短理由>"
}${JSON_QUOTE_RULE}`;
}

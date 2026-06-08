import { z } from 'zod';
import { DivergenceItemSchema } from '@nodx/models';
import { MODELS, type ModelId } from '../../models.js';
import { JSON_QUOTE_RULE } from '../json-safety.js';

export const SYNTHESIS_PROMPT_VERSION = '2026-06-02.v1';
export const SYNTHESIS_PROMPT_MODEL: ModelId = MODELS.sonnet;

/** One expert's full transcript across the debate rounds. */
export interface TranscriptEntry {
  displayName: string;
  role: string;
  /** Utterances in round order (initial, critique, refined). */
  utterances: string[];
}

export interface SynthesisInput {
  question: string;
  context: string;
  transcript: TranscriptEntry[];
}

/**
 * The moderator's synthesis — everything in `LocalMaximumResult` except
 * the user-set acceptance fields (`acceptedByUser` / `acceptedAt`), which
 * the persistence layer fills in. Mirrors `LocalMaximumResultSchema` so a
 * `SynthesisOutput` slots straight into a panel's Local Max.
 */
export const SynthesisOutputSchema = z
  .object({
    consensus: z.array(z.string().min(1)),
    divergence: z.array(DivergenceItemSchema),
    openQuestions: z.array(z.string().min(1)),
    bestAnswer: z.string().min(1),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type SynthesisOutput = z.infer<typeof SynthesisOutputSchema>;

function formatTranscript(transcript: TranscriptEntry[]): string {
  return transcript
    .map((e) => {
      const rounds = e.utterances
        .map((u, i) => `  〔第 ${i + 1} 轮〕${u}`)
        .join('\n');
      return `【${e.displayName}（${e.role}）】\n${rounds}`;
    })
    .join('\n\n');
}

/**
 * Synthesis round — an *independent* moderator (not one of the debaters)
 * reads the whole transcript and distils the panel's Local Maximum
 * (PRD §3.14 Round 4 / §8.9). Routed to Sonnet: this is the highest-value
 * reasoning step in the protocol.
 *
 * `divergence` items pair a contested point with the precondition that
 * would flip the call (see `DivergenceItem`); `openQuestions` are the
 * threads left dangling — they become 卡点 comments downstream.
 */
export function buildSynthesisPrompt(input: SynthesisInput): string {
  return `你是这场专家辩论的**独立主持人**——你没有参与辩论，立场中立。请通读全部 transcript，综合出这个方向的「局部最优解（Local Maximum）」。

决策方向：${input.question}
背景上下文：${input.context || '（无上下文）'}

辩论记录：
${formatTranscript(input.transcript)}

请综合输出：
- consensus：专家们最终达成的共识要点
- divergence：仍存在的分歧，每条注明「在什么前提下这个分歧会倒向某一边」
- openQuestions：尚未解开、需要用户进一步决策或获取信息的开放问题
- bestAnswer：综合所有视角后，对这个方向给出的最佳行动建议（可执行、不和稀泥）
- confidence：你对这个 bestAnswer 的把握（0–1）

只输出 JSON：
{
  "consensus": ["<共识要点>"],
  "divergence": [{ "point": "<分歧点>", "conditions": "<什么前提下倒向哪边>" }],
  "openQuestions": ["<开放问题>"],
  "bestAnswer": "<最佳行动建议>",
  "confidence": 0.0
}${JSON_QUOTE_RULE}`;
}

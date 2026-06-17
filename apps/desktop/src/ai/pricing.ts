import { MODELS } from '@nodx/ai';

/**
 * USD per million tokens, by model id (2026-06 Anthropic list prices).
 * Used by the auto-recursion budget meter (PRD §3.19 — $5 hard cap).
 * Keep in sync with MODELS when a tier is swapped.
 */
export const PRICE_PER_MTOK: Record<string, { input: number; output: number }> =
  {
    [MODELS.sonnet]: { input: 3, output: 15 },
    [MODELS.haiku]: { input: 1, output: 5 },
  };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Estimated cost of one call. Unknown models price as Sonnet — for a budget
 * GUARD it's safer to overestimate than to silently meter at zero.
 */
export function estimateUsd(model: string, usage: TokenUsage): number {
  const price = PRICE_PER_MTOK[model] ?? PRICE_PER_MTOK[MODELS.sonnet]!;
  return (
    (usage.inputTokens / 1_000_000) * price.input +
    (usage.outputTokens / 1_000_000) * price.output
  );
}

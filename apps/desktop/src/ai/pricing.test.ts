import { describe, expect, it } from 'vitest';
import { MODELS } from '@nodx/ai';
import { estimateUsd } from './pricing.js';

describe('estimateUsd', () => {
  it('prices Sonnet at $3/M in + $15/M out', () => {
    expect(
      estimateUsd(MODELS.sonnet, { inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    ).toBeCloseTo(18, 10);
    expect(
      estimateUsd(MODELS.sonnet, { inputTokens: 2_500, outputTokens: 600 }),
    ).toBeCloseTo(0.0075 + 0.009, 10);
  });

  it('prices Haiku at $1/M in + $5/M out', () => {
    expect(
      estimateUsd(MODELS.haiku, { inputTokens: 700, outputTokens: 120 }),
    ).toBeCloseTo(0.0007 + 0.0006, 10);
  });

  it('prices unknown models conservatively as Sonnet', () => {
    expect(
      estimateUsd('mystery-model', { inputTokens: 1_000_000, outputTokens: 0 }),
    ).toBeCloseTo(3, 10);
  });

  it('returns 0 for zero usage', () => {
    expect(estimateUsd(MODELS.haiku, { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

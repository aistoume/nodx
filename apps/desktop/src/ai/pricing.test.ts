import { describe, expect, it } from 'vitest';
import { MODELS } from '@nodx/ai';
import { estimateUsd } from './pricing.js';

describe('estimateUsd', () => {
  it('prices the core tier (Opus 4.8) at $15/M in + $75/M out', () => {
    expect(
      estimateUsd(MODELS.sonnet, { inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    ).toBeCloseTo(90, 10);
    expect(
      estimateUsd(MODELS.sonnet, { inputTokens: 2_500, outputTokens: 600 }),
    ).toBeCloseTo(0.0375 + 0.045, 10);
  });

  it('prices Haiku at $1/M in + $5/M out', () => {
    expect(
      estimateUsd(MODELS.haiku, { inputTokens: 700, outputTokens: 120 }),
    ).toBeCloseTo(0.0007 + 0.0006, 10);
  });

  it('prices unknown models conservatively at the core-tier rate', () => {
    expect(
      estimateUsd('mystery-model', { inputTokens: 1_000_000, outputTokens: 0 }),
    ).toBeCloseTo(15, 10);
  });

  it('returns 0 for zero usage', () => {
    expect(estimateUsd(MODELS.haiku, { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

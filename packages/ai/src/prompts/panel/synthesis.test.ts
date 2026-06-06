import { describe, expect, it } from 'vitest';
import {
  SYNTHESIS_PROMPT_MODEL,
  SynthesisOutputSchema,
  buildSynthesisPrompt,
  type TranscriptEntry,
} from './synthesis.js';

const transcript: TranscriptEntry[] = [
  {
    displayName: '老王',
    role: 'critic',
    utterances: ['初判反对', '坚持反对', '部分让步'],
  },
  {
    displayName: '小李',
    role: 'proposer',
    utterances: ['初判支持', '回应质疑', '修正方案'],
  },
];

describe('buildSynthesisPrompt', () => {
  it('binds question, context and the full transcript', () => {
    const out = buildSynthesisPrompt({
      question: '要不要出海',
      context: '现金流紧张',
      transcript,
    });
    expect(out).toContain('要不要出海');
    expect(out).toContain('现金流紧张');
    expect(out).toContain('老王');
    expect(out).toContain('初判反对');
    expect(out).toContain('小李');
    expect(out).toContain('修正方案');
    expect(out).toContain('独立主持人');
  });
});

describe('SynthesisOutputSchema', () => {
  const valid = {
    consensus: ['市场有机会'],
    divergence: [{ point: '时间窗', conditions: '若 Q3 现金流转正则成立' }],
    openQuestions: ['监管牌照能不能拿到'],
    bestAnswer: '先小规模试点，Q3 复盘再决定是否加注',
    confidence: 0.7,
  };

  it('accepts a valid synthesis', () => {
    expect(SynthesisOutputSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a divergence item missing conditions', () => {
    expect(() =>
      SynthesisOutputSchema.parse({
        ...valid,
        divergence: [{ point: '时间窗' }],
      }),
    ).toThrow();
  });

  it('rejects an empty bestAnswer', () => {
    expect(() =>
      SynthesisOutputSchema.parse({ ...valid, bestAnswer: '' }),
    ).toThrow();
  });

  it('rejects confidence out of range', () => {
    expect(() =>
      SynthesisOutputSchema.parse({ ...valid, confidence: 2 }),
    ).toThrow();
  });
});

describe('synthesis metadata', () => {
  it('routes to sonnet (highest-value step)', () => {
    expect(SYNTHESIS_PROMPT_MODEL).toContain('sonnet');
  });
});

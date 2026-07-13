import { describe, expect, it } from 'vitest';
import { MODELS } from '../models.js';
import {
  DECOMPOSE_PROMPT_MODEL,
  DecomposeOutputSchema,
  buildDecomposePrompt,
} from './decompose.js';

describe('buildDecomposePrompt', () => {
  it('binds question, factors and context', () => {
    const out = buildDecomposePrompt({
      question: '现在该投资股票吗？',
      selectedFactors: ['宏观利率', '估值水平'],
      context: '上一轮我们分析了流动性',
    });
    expect(out).toContain('现在该投资股票吗？');
    expect(out).toContain('宏观利率、估值水平');
    expect(out).toContain('上一轮我们分析了流动性');
  });

  it('falls back to a placeholder when context is empty', () => {
    const out = buildDecomposePrompt({
      question: 'q',
      selectedFactors: ['a'],
      context: '',
    });
    expect(out).toContain('新对话');
  });
});

describe('DecomposeOutputSchema', () => {
  const valid = {
    factors: [
      {
        title: '宏观利率',
        essence: '资金的时间成本',
        sub_questions: [
          { question: '美联储 6 月加不加息？', can_be_atomic: false },
          { question: '我什么时候动用现金？', can_be_atomic: true },
        ],
      },
    ],
  };

  it('accepts valid output', () => {
    expect(DecomposeOutputSchema.parse(valid)).toEqual(valid);
  });

  it('rejects empty factors', () => {
    expect(() => DecomposeOutputSchema.parse({ factors: [] })).toThrow();
  });

  it('rejects sub_questions with missing fields', () => {
    expect(() =>
      DecomposeOutputSchema.parse({
        factors: [
          {
            title: 't',
            essence: 'e',
            sub_questions: [{ question: 'q' }],
          },
        ],
      }),
    ).toThrow();
  });
});

describe('decompose metadata', () => {
  it('routes to sonnet', () => {
    expect(DECOMPOSE_PROMPT_MODEL).toBe(MODELS.sonnet);
  });
});

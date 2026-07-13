import { describe, expect, it } from 'vitest';
import { MODELS } from '../models.js';
import {
  ABSTRACTOR_PROMPT_MODEL,
  AbstractorOutputSchema,
  buildAbstractorPrompt,
} from './abstractor.js';

describe('buildAbstractorPrompt', () => {
  const out = buildAbstractorPrompt({
    question: '要不要出海东南亚',
    context: '现金流紧张',
    bestAnswer: '先小规模试点',
    consensus: ['市场有机会'],
    divergence: [{ point: '时间窗', conditions: 'Q3 现金流转正' }],
    openQuestions: ['监管牌照'],
    confidence: 0.7,
  });

  it('binds the decision content', () => {
    expect(out).toContain('要不要出海东南亚');
    expect(out).toContain('先小规模试点');
    expect(out).toContain('市场有机会');
    expect(out).toContain('时间窗');
    expect(out).toContain('监管牌照');
  });

  it('instructs de-identification', () => {
    expect(out).toContain('去标识化');
    expect(out).toContain('量级');
  });
});

describe('AbstractorOutputSchema', () => {
  const valid = {
    problemSignature: {
      domain: '跨境电商战略',
      decisionType: 'go_no_go',
      keyDimensions: ['现金流'],
      constraints: ['6 个月窗口'],
    },
    reasoningPath: {
      frameworks: ['第一性原理'],
      keyQuestions: ['市场是否真实'],
      pivotalDecisions: ['先试点'],
    },
    solutionPattern: {
      structure: '分阶段试点',
      keyLevers: ['本地化'],
      riskMitigations: ['Q3 止损'],
    },
    qualityScore: 0.8,
  };

  it('accepts valid output', () => {
    expect(AbstractorOutputSchema.parse(valid)).toEqual(valid);
  });
  it('rejects an unknown decisionType', () => {
    expect(() =>
      AbstractorOutputSchema.parse({
        ...valid,
        problemSignature: { ...valid.problemSignature, decisionType: 'guess' },
      }),
    ).toThrow();
  });
  it('rejects qualityScore out of range', () => {
    expect(() =>
      AbstractorOutputSchema.parse({ ...valid, qualityScore: 2 }),
    ).toThrow();
  });
});

describe('abstractor metadata', () => {
  it('routes to sonnet', () => {
    expect(ABSTRACTOR_PROMPT_MODEL).toBe(MODELS.sonnet);
  });
});

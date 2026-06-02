import { describe, expect, it } from 'vitest';
import {
  DivergenceItemSchema,
  LocalMaximumResultSchema,
  type LocalMaximumResult,
} from './local-maximum.js';

const validResult: LocalMaximumResult = {
  consensus: ['关键变量是现金流而非估值', '本轮不动用应急储备'],
  divergence: [
    {
      point: '6 个月时间窗是否合理',
      conditions: '若 Q3 末现金流低于 X 美元，则窗口仍合理',
    },
  ],
  openQuestions: ['监管口径未明确', '人才招聘速度未验证'],
  bestAnswer: '在 Q3 末根据现金流再做最终决定。',
  confidence: 0.78,
  acceptedByUser: false,
};

describe('DivergenceItemSchema', () => {
  it('accepts a valid divergence item', () => {
    expect(
      DivergenceItemSchema.parse({
        point: '估值方法',
        conditions: '若同行 PE > 30',
      }),
    ).toEqual({ point: '估值方法', conditions: '若同行 PE > 30' });
  });

  it('rejects a divergence item missing conditions', () => {
    expect(() => DivergenceItemSchema.parse({ point: 'x' })).toThrow();
  });

  it('rejects empty point', () => {
    expect(() =>
      DivergenceItemSchema.parse({ point: '', conditions: 'c' }),
    ).toThrow();
  });
});

describe('LocalMaximumResultSchema', () => {
  it('accepts a complete unaccepted result', () => {
    expect(LocalMaximumResultSchema.parse(validResult)).toEqual(validResult);
  });

  it('accepts confidence at the lower boundary 0', () => {
    const out = LocalMaximumResultSchema.parse({
      ...validResult,
      confidence: 0,
    });
    expect(out.confidence).toBeCloseTo(0);
  });

  it('accepts confidence at the upper boundary 1', () => {
    const out = LocalMaximumResultSchema.parse({
      ...validResult,
      confidence: 1,
    });
    expect(out.confidence).toBeCloseTo(1);
  });

  it('rejects confidence above 1', () => {
    expect(() =>
      LocalMaximumResultSchema.parse({ ...validResult, confidence: 1.01 }),
    ).toThrow();
  });

  it('rejects confidence below 0', () => {
    expect(() =>
      LocalMaximumResultSchema.parse({ ...validResult, confidence: -0.01 }),
    ).toThrow();
  });

  it('rejects missing bestAnswer', () => {
    const { bestAnswer: _drop, ...rest } = validResult;
    expect(() => LocalMaximumResultSchema.parse(rest)).toThrow();
  });

  it('rejects acceptedByUser as a non-boolean', () => {
    expect(() =>
      LocalMaximumResultSchema.parse({
        ...validResult,
        acceptedByUser: 'yes',
      }),
    ).toThrow();
  });

  it('accepts an accepted result with acceptedAt', () => {
    const accepted: LocalMaximumResult = {
      ...validResult,
      acceptedByUser: true,
      acceptedAt: 1_700_000_002_000,
    };
    expect(LocalMaximumResultSchema.parse(accepted)).toEqual(accepted);
  });

  it('rejects a malformed divergence array element', () => {
    expect(() =>
      LocalMaximumResultSchema.parse({
        ...validResult,
        divergence: [{ point: '缺 conditions' }],
      }),
    ).toThrow();
  });

  it('rejects unknown extra fields (strict)', () => {
    expect(() =>
      LocalMaximumResultSchema.parse({ ...validResult, mystery: true }),
    ).toThrow();
  });
});

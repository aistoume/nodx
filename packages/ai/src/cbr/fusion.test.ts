import { describe, expect, it } from 'vitest';
import { MODELS } from '../models.js';
import {
  FUSION_PROMPT_MODEL,
  FusionReportSchema,
  buildFusionPrompt,
} from './fusion.js';

describe('buildFusionPrompt', () => {
  it('binds the query and every candidate', () => {
    const out = buildFusionPrompt({
      query: '要不要做市某新交易所',
      candidates: [
        {
          id: 'case_a',
          domain: '受监管做市系统',
          decisionType: 'sequencing',
          signatureText: '风控独立性 vs 延迟',
          solutionText: '热路径静态规则',
          qualityScore: 0.8,
        },
      ],
    });
    expect(out).toContain('要不要做市某新交易所');
    expect(out).toContain('case_a');
    expect(out).toContain('风控独立性 vs 延迟');
    expect(out).toContain('语境警示');
  });
});

describe('FusionReportSchema', () => {
  const valid = {
    coreBorrows: [{ caseRef: 'case_a', insight: '风控独立性必须前置' }],
    contrastCases: [{ caseRef: 'case_b', insight: '它选了动态模型，反例' }],
    crossPatterns: ['监管合规普遍是硬约束'],
    contextWarnings: ['老案例是股票市场，新问题是加密，监管不同'],
  };
  it('accepts a valid report', () => {
    expect(FusionReportSchema.parse(valid)).toEqual(valid);
  });
  it('accepts empty arrays', () => {
    expect(
      FusionReportSchema.parse({
        coreBorrows: [],
        contrastCases: [],
        crossPatterns: [],
        contextWarnings: [],
      }),
    ).toBeTruthy();
  });
  it('rejects a borrow missing insight', () => {
    expect(() =>
      FusionReportSchema.parse({ ...valid, coreBorrows: [{ caseRef: 'x' }] }),
    ).toThrow();
  });
});

describe('fusion metadata', () => {
  it('routes to sonnet', () => {
    expect(FUSION_PROMPT_MODEL).toBe(MODELS.sonnet);
  });
});

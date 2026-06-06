import { describe, expect, it } from 'vitest';
import {
  AdaptedSolutionSchema,
  type AdaptedSolution,
} from './adapted-solution.js';

const valid: AdaptedSolution = {
  sourceCaseId: 'case_1',
  inheritedStructure: '分阶段限时试点 + 滞后指标门控',
  contextualizedLevers: ['以本地合规为先决条件', '复购率作为门控指标'],
  newRiskMitigations: ['监管牌照前置验证'],
  requiresExpertPanel: true,
  rediscussDirections: ['加密市场的监管差异是否改变排序'],
};

describe('AdaptedSolutionSchema', () => {
  it('accepts a valid adaptation', () => {
    expect(AdaptedSolutionSchema.parse(valid)).toEqual(valid);
  });
  it('accepts empty arrays + no panel', () => {
    expect(
      AdaptedSolutionSchema.parse({
        ...valid,
        requiresExpertPanel: false,
        contextualizedLevers: [],
        newRiskMitigations: [],
        rediscussDirections: [],
      }),
    ).toBeTruthy();
  });
  it('rejects empty inheritedStructure', () => {
    expect(() =>
      AdaptedSolutionSchema.parse({ ...valid, inheritedStructure: '' }),
    ).toThrow();
  });
  it('rejects a non-boolean requiresExpertPanel', () => {
    expect(() =>
      AdaptedSolutionSchema.parse({ ...valid, requiresExpertPanel: 'yes' }),
    ).toThrow();
  });
  it('rejects unknown extra fields (strict)', () => {
    expect(() =>
      AdaptedSolutionSchema.parse({ ...valid, extra: 1 }),
    ).toThrow();
  });
});

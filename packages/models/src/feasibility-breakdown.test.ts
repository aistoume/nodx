import { describe, expect, it } from 'vitest';
import {
  FeasibilityBreakdownSchema,
  type FeasibilityBreakdown,
} from './feasibility-breakdown.js';

const valid: FeasibilityBreakdown = {
  resourceCost: 0.3,
  timeToResolve: 0.2,
  decisionRisk: 0.5,
  value: 0.8,
  dependencies: ['需要财务部门提供 Q3 现金流数据'],
};

describe('FeasibilityBreakdownSchema', () => {
  it('accepts a valid breakdown', () => {
    expect(FeasibilityBreakdownSchema.parse(valid)).toEqual(valid);
  });

  it('accepts empty dependencies', () => {
    expect(
      FeasibilityBreakdownSchema.parse({ ...valid, dependencies: [] })
        .dependencies,
    ).toEqual([]);
  });

  it('accepts the 0 and 1 boundaries on every dimension', () => {
    expect(() =>
      FeasibilityBreakdownSchema.parse({
        ...valid,
        resourceCost: 0,
        timeToResolve: 1,
        decisionRisk: 0,
        value: 1,
      }),
    ).not.toThrow();
  });

  it('rejects a dimension above 1', () => {
    expect(() =>
      FeasibilityBreakdownSchema.parse({ ...valid, decisionRisk: 1.01 }),
    ).toThrow();
  });

  it('rejects a negative dimension', () => {
    expect(() =>
      FeasibilityBreakdownSchema.parse({ ...valid, value: -0.1 }),
    ).toThrow();
  });

  it('rejects missing value dimension', () => {
    const { value: _drop, ...rest } = valid;
    expect(() => FeasibilityBreakdownSchema.parse(rest)).toThrow();
  });

  it('rejects wrong-typed dependencies', () => {
    expect(() =>
      FeasibilityBreakdownSchema.parse({ ...valid, dependencies: 'none' }),
    ).toThrow();
  });

  it('rejects empty-string dependency entries', () => {
    expect(() =>
      FeasibilityBreakdownSchema.parse({ ...valid, dependencies: [''] }),
    ).toThrow();
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() =>
      FeasibilityBreakdownSchema.parse({ ...valid, vibe: 'good' }),
    ).toThrow();
  });
});

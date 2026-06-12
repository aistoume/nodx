import { describe, expect, it } from 'vitest';
import {
  ChildCandidateSchema,
  RecommendedActionSchema,
  type ChildCandidate,
} from './child-candidate.js';

const valid: ChildCandidate = {
  title: '确定 Kill Switch 的三级触发阈值',
  sourceOpenQuestion: '阈值设多少才不会误杀正常交易？',
  feasibilityScore: 0.74,
  breakdown: {
    resourceCost: 0.2,
    timeToResolve: 0.3,
    decisionRisk: 0.4,
    value: 0.9,
    dependencies: ['需要历史交易量数据'],
  },
  recommendedAction: 'spawn_and_run',
};

describe('RecommendedActionSchema', () => {
  it('accepts the four documented actions', () => {
    for (const a of [
      'spawn_and_run',
      'spawn_only',
      'skip',
      'flag_as_real_world_action',
    ] as const) {
      expect(RecommendedActionSchema.parse(a)).toBe(a);
    }
  });

  it('rejects an unknown action', () => {
    expect(() => RecommendedActionSchema.parse('spawn')).toThrow();
  });
});

describe('ChildCandidateSchema', () => {
  it('accepts a candidate derived from an open question', () => {
    expect(ChildCandidateSchema.parse(valid)).toEqual(valid);
  });

  it('accepts a candidate derived from an option choice instead', () => {
    const { sourceOpenQuestion: _drop, ...rest } = valid;
    const fromFork = { ...rest, sourceOptionChoice: '方案 B：自建' };
    expect(ChildCandidateSchema.parse(fromFork)).toEqual(fromFork);
  });

  it('accepts a candidate with neither source (PM gap analysis)', () => {
    const { sourceOpenQuestion: _drop, ...rest } = valid;
    expect(() => ChildCandidateSchema.parse(rest)).not.toThrow();
  });

  it('rejects empty title', () => {
    expect(() =>
      ChildCandidateSchema.parse({ ...valid, title: '' }),
    ).toThrow();
  });

  it('rejects missing breakdown', () => {
    const { breakdown: _drop, ...rest } = valid;
    expect(() => ChildCandidateSchema.parse(rest)).toThrow();
  });

  it('rejects feasibilityScore out of range', () => {
    expect(() =>
      ChildCandidateSchema.parse({ ...valid, feasibilityScore: 1.2 }),
    ).toThrow();
    expect(() =>
      ChildCandidateSchema.parse({ ...valid, feasibilityScore: -0.2 }),
    ).toThrow();
  });

  it('rejects wrong-typed feasibilityScore', () => {
    expect(() =>
      ChildCandidateSchema.parse({ ...valid, feasibilityScore: 'high' }),
    ).toThrow();
  });

  it('rejects unknown recommendedAction', () => {
    expect(() =>
      ChildCandidateSchema.parse({ ...valid, recommendedAction: 'run' }),
    ).toThrow();
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() =>
      ChildCandidateSchema.parse({ ...valid, rank: 1 }),
    ).toThrow();
  });
});

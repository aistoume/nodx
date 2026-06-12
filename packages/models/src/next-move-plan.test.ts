import { describe, expect, it } from 'vitest';
import type { ChildCandidate } from './child-candidate.js';
import {
  NextMovePlanSchema,
  NextMovePlanStatusSchema,
  type NextMovePlan,
} from './next-move-plan.js';

const candidate: ChildCandidate = {
  title: '确定 Kill Switch 触发阈值',
  feasibilityScore: 0.8,
  breakdown: {
    resourceCost: 0.2,
    timeToResolve: 0.3,
    decisionRisk: 0.3,
    value: 0.9,
    dependencies: [],
  },
  recommendedAction: 'spawn_and_run',
};

const validPlan: NextMovePlan = {
  id: 'nmp_1',
  topicId: 'topic_1',
  status: 'needs_deepening',
  atomicityScore: 0.45,
  whatsMissing: ['缺少负责人', '没有验收标准'],
  childCandidates: [candidate],
  topPick: candidate.title,
  topPickReasoning: '可行性最高且解锁后续两个卡点',
  createdAt: 1_700_000_000_000,
};

describe('NextMovePlanStatusSchema', () => {
  it('accepts the four documented statuses', () => {
    for (const s of [
      'atomic_complete',
      'needs_deepening',
      'needs_real_world_data',
      'multi_path_choice',
    ] as const) {
      expect(NextMovePlanStatusSchema.parse(s)).toBe(s);
    }
  });

  it('rejects an unknown status', () => {
    expect(() => NextMovePlanStatusSchema.parse('done')).toThrow();
  });
});

describe('NextMovePlanSchema', () => {
  it('accepts a deepening plan with candidates + topPick', () => {
    expect(NextMovePlanSchema.parse(validPlan)).toEqual(validPlan);
  });

  it('accepts an atomic_complete plan with no candidates and no topPick', () => {
    const done: NextMovePlan = {
      id: 'nmp_2',
      topicId: 'topic_1',
      status: 'atomic_complete',
      atomicityScore: 0.92,
      whatsMissing: [],
      childCandidates: [],
      createdAt: 1_700_000_000_000,
    };
    expect(NextMovePlanSchema.parse(done)).toEqual(done);
  });

  it('accepts exactly 5 candidates but rejects 6', () => {
    const five = { ...validPlan, childCandidates: Array(5).fill(candidate) };
    expect(() => NextMovePlanSchema.parse(five)).not.toThrow();
    const six = { ...validPlan, childCandidates: Array(6).fill(candidate) };
    expect(() => NextMovePlanSchema.parse(six)).toThrow();
  });

  it('rejects missing topicId', () => {
    const { topicId: _drop, ...rest } = validPlan;
    expect(() => NextMovePlanSchema.parse(rest)).toThrow();
  });

  it('rejects atomicityScore out of range', () => {
    expect(() =>
      NextMovePlanSchema.parse({ ...validPlan, atomicityScore: 1.5 }),
    ).toThrow();
    expect(() =>
      NextMovePlanSchema.parse({ ...validPlan, atomicityScore: -0.1 }),
    ).toThrow();
  });

  it('rejects wrong-typed whatsMissing', () => {
    expect(() =>
      NextMovePlanSchema.parse({ ...validPlan, whatsMissing: '缺负责人' }),
    ).toThrow();
  });

  it('rejects empty-string entries in whatsMissing', () => {
    expect(() =>
      NextMovePlanSchema.parse({ ...validPlan, whatsMissing: [''] }),
    ).toThrow();
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() =>
      NextMovePlanSchema.parse({ ...validPlan, budget: 5 }),
    ).toThrow();
  });
});

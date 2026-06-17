import { describe, expect, it } from 'vitest';
import type { ChildCandidate, NextMovePlan } from '@nodx/models';
import {
  resolvePickedCandidate,
  resolveStopAfterPlan,
  resolveStopBeforeSpawn,
} from './auto-recursion-policy.js';

const cand = (title: string, score: number): ChildCandidate => ({
  title,
  feasibilityScore: score,
  breakdown: {
    resourceCost: 0.5,
    timeToResolve: 0.5,
    decisionRisk: 0.5,
    value: score,
    dependencies: [],
  },
  recommendedAction: 'spawn_and_run',
});

const plan = (over: Partial<NextMovePlan> = {}): NextMovePlan => ({
  id: 'p1',
  topicId: 't1',
  status: 'needs_deepening',
  atomicityScore: 0.4,
  whatsMissing: [],
  childCandidates: [cand('高', 0.9), cand('低', 0.2)],
  topPick: '高',
  createdAt: 1,
  ...over,
});

describe('resolveStopAfterPlan', () => {
  it('atomic_complete → completed', () => {
    expect(
      resolveStopAfterPlan(plan({ status: 'atomic_complete', childCandidates: [], topPick: undefined })),
    ).toBe('completed');
  });

  it('needs_real_world_data → hit_real_world_block', () => {
    expect(
      resolveStopAfterPlan(plan({ status: 'needs_real_world_data', childCandidates: [], topPick: undefined })),
    ).toBe('hit_real_world_block');
  });

  it('deepening with no candidates degenerates to completed', () => {
    expect(
      resolveStopAfterPlan(plan({ childCandidates: [], topPick: undefined })),
    ).toBe('completed');
  });

  it('deepening / multi_path with candidates continues', () => {
    expect(resolveStopAfterPlan(plan())).toBeNull();
    expect(resolveStopAfterPlan(plan({ status: 'multi_path_choice' }))).toBeNull();
  });
});

describe('resolveStopBeforeSpawn', () => {
  const base = { spentUsd: 1, budgetUsd: 5, nextDepth: 2, depthLimit: 4 };

  it('passes when under both caps', () => {
    expect(resolveStopBeforeSpawn(base)).toBeNull();
  });

  it('budget at/over the cap → budget_exhausted', () => {
    expect(resolveStopBeforeSpawn({ ...base, spentUsd: 5 })).toBe('budget_exhausted');
    expect(resolveStopBeforeSpawn({ ...base, spentUsd: 5.01 })).toBe('budget_exhausted');
  });

  it('next depth beyond the limit → depth_exhausted', () => {
    expect(resolveStopBeforeSpawn({ ...base, nextDepth: 5 })).toBe('depth_exhausted');
    expect(resolveStopBeforeSpawn({ ...base, nextDepth: 4 })).toBeNull();
  });

  it('budget wins when both caps fire', () => {
    expect(
      resolveStopBeforeSpawn({ ...base, spentUsd: 9, nextDepth: 9 }),
    ).toBe('budget_exhausted');
  });
});

describe('resolvePickedCandidate', () => {
  it('explicit pick wins over topPick', () => {
    expect(resolvePickedCandidate(plan(), '低')!.title).toBe('低');
  });

  it('falls back to topPick, then to the first (highest) candidate', () => {
    expect(resolvePickedCandidate(plan())!.title).toBe('高');
    expect(resolvePickedCandidate(plan({ topPick: undefined }))!.title).toBe('高');
    expect(resolvePickedCandidate(plan(), '不存在')!.title).toBe('高');
  });

  it('returns null when there are no candidates', () => {
    expect(
      resolvePickedCandidate(plan({ childCandidates: [], topPick: undefined })),
    ).toBeNull();
  });

  it('skips excluded candidates (rolled-back), falling through to the next', () => {
    // topPick 高 is excluded → next-highest 低 wins
    expect(
      resolvePickedCandidate(plan(), undefined, new Set(['高']))!.title,
    ).toBe('低');
  });

  it('returns null when every candidate is excluded', () => {
    expect(
      resolvePickedCandidate(plan(), undefined, new Set(['高', '低'])),
    ).toBeNull();
  });

  it('an explicit excluded pick is ignored in favour of an eligible one', () => {
    // user re-picks 高 but it's excluded → falls back to 低
    expect(resolvePickedCandidate(plan(), '高', new Set(['高']))!.title).toBe('低');
  });
});

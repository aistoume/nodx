import { describe, expect, it } from 'vitest';
import {
  AutoRecursionModeSchema,
  AutoRecursionRunSchema,
  AutoRecursionStatusSchema,
  RunInterruptionSchema,
  type AutoRecursionRun,
} from './auto-recursion-run.js';

const validRun: AutoRecursionRun = {
  id: 'run_1',
  rootTopicId: 'topic_1',
  mode: 'auto_step',
  budgetUsd: 5.0,
  depthLimit: 4,
  startedAt: 1_700_000_000_000,
  status: 'running',
  totalSpentUsd: 0,
  maxDepthReached: 0,
  spawnedTopicIds: [],
  interruptions: [],
};

describe('AutoRecursionModeSchema', () => {
  it('accepts the three documented modes', () => {
    for (const m of ['pilot', 'auto_step', 'auto_run'] as const) {
      expect(AutoRecursionModeSchema.parse(m)).toBe(m);
    }
  });

  it('rejects an unknown mode', () => {
    expect(() => AutoRecursionModeSchema.parse('manual')).toThrow();
  });
});

describe('AutoRecursionStatusSchema', () => {
  it('accepts the six documented statuses', () => {
    for (const s of [
      'running',
      'paused_by_user',
      'completed',
      'budget_exhausted',
      'depth_exhausted',
      'hit_real_world_block',
    ] as const) {
      expect(AutoRecursionStatusSchema.parse(s)).toBe(s);
    }
  });

  it('rejects an unknown status', () => {
    expect(() => AutoRecursionStatusSchema.parse('stopped')).toThrow();
  });
});

describe('RunInterruptionSchema', () => {
  it('accepts the three documented actions', () => {
    for (const a of ['redirected', 'paused', 'rolled_back'] as const) {
      expect(
        RunInterruptionSchema.parse({ topicId: 't1', action: a, at: 1 }),
      ).toEqual({ topicId: 't1', action: a, at: 1 });
    }
  });

  it('rejects an unknown action', () => {
    expect(() =>
      RunInterruptionSchema.parse({ topicId: 't1', action: 'killed', at: 1 }),
    ).toThrow();
  });
});

describe('AutoRecursionRunSchema', () => {
  it('accepts a freshly-started run', () => {
    expect(AutoRecursionRunSchema.parse(validRun)).toEqual(validRun);
  });

  it('accepts a finished run with spend + spawned topics + interruptions', () => {
    const done: AutoRecursionRun = {
      ...validRun,
      status: 'budget_exhausted',
      endedAt: 1_700_000_900_000,
      totalSpentUsd: 5.01,
      maxDepthReached: 3,
      spawnedTopicIds: ['t2', 't3'],
      interruptions: [
        { topicId: 't2', action: 'rolled_back', at: 1_700_000_500_000 },
      ],
    };
    expect(AutoRecursionRunSchema.parse(done)).toEqual(done);
  });

  it('rejects negative budgetUsd / totalSpentUsd', () => {
    expect(() =>
      AutoRecursionRunSchema.parse({ ...validRun, budgetUsd: -1 }),
    ).toThrow();
    expect(() =>
      AutoRecursionRunSchema.parse({ ...validRun, totalSpentUsd: -0.01 }),
    ).toThrow();
  });

  it('rejects a zero or fractional depthLimit', () => {
    expect(() =>
      AutoRecursionRunSchema.parse({ ...validRun, depthLimit: 0 }),
    ).toThrow();
    expect(() =>
      AutoRecursionRunSchema.parse({ ...validRun, depthLimit: 2.5 }),
    ).toThrow();
  });

  it('rejects missing rootTopicId', () => {
    const { rootTopicId: _drop, ...rest } = validRun;
    expect(() => AutoRecursionRunSchema.parse(rest)).toThrow();
  });

  it('rejects wrong-typed spawnedTopicIds', () => {
    expect(() =>
      AutoRecursionRunSchema.parse({ ...validRun, spawnedTopicIds: 't2' }),
    ).toThrow();
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() =>
      AutoRecursionRunSchema.parse({ ...validRun, note: 'x' }),
    ).toThrow();
  });
});

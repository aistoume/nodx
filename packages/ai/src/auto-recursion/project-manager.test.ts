import { describe, expect, it } from 'vitest';
import type {
  FeasibilityBreakdown,
  LocalMaximumResult,
  Topic,
} from '@nodx/models';
import { NextMovePlanSchema } from '@nodx/models';
import {
  generateNextMovePlan,
  type AutoRecursionSteps,
} from './project-manager.js';

const topic: Topic = {
  id: 'topic_1',
  parentId: null,
  title: '要不要自建风控系统？',
  status: 'exploring',
  isPinned: false,
  isArchived: false,
  createdAt: 1,
  updatedAt: 1,
  meta: { messageCount: 0, childCount: 0, lastActivity: 1 },
  hasOpenQuestions: false,
};

const localMax: LocalMaximumResult = {
  consensus: ['先买后建'],
  divergence: [{ point: '自建时点', conditions: '若日交易量破 10 万则提前' }],
  openQuestions: ['第三方 SLA 够不够？'],
  bestAnswer: '先用第三方风控撑 6 个月，并行评估自建。',
  confidence: 0.8,
  acceptedByUser: true,
};

/** Per-candidate breakdowns the fake judge serves, keyed by title. */
function makeSteps(
  pmOutput: unknown,
  breakdowns: Record<string, FeasibilityBreakdown>,
): AutoRecursionSteps & { pmPrompts: string[]; judgePrompts: string[] } {
  const pmPrompts: string[] = [];
  const judgePrompts: string[] = [];
  return {
    pmPrompts,
    judgePrompts,
    async runPm(prompt) {
      pmPrompts.push(prompt);
      return pmOutput;
    },
    async runFeasibilityJudge(prompt) {
      judgePrompts.push(prompt);
      const hit = Object.entries(breakdowns).find(([title]) =>
        prompt.includes(title),
      );
      if (!hit) throw new Error(`no breakdown stubbed for prompt: ${prompt}`);
      return hit[1];
    },
  };
}

const bd = (
  value: number,
  rest: Partial<FeasibilityBreakdown> = {},
): FeasibilityBreakdown => ({
  resourceCost: 0.5,
  timeToResolve: 0.5,
  decisionRisk: 0.5,
  value,
  dependencies: [],
  ...rest,
});

describe('generateNextMovePlan', () => {
  it('scores candidates in parallel, sorts by feasibility, and refills topPick', async () => {
    const steps = makeSteps(
      {
        status: 'needs_deepening',
        atomicityScore: 0.4,
        whatsMissing: ['没有负责人'],
        childCandidates: [
          { title: '候选低', recommendedAction: 'spawn_only' },
          { title: '候选高', recommendedAction: 'spawn_and_run' },
          { title: '候选中', recommendedAction: 'skip' },
        ],
        topPick: '候选低',
        topPickReasoning: 'PM 觉得它眼熟',
      },
      {
        候选低: bd(0.1),
        候选高: bd(0.9),
        候选中: bd(0.5),
      },
    );

    const plan = await generateNextMovePlan(topic, localMax, steps);

    // one judge call per candidate
    expect(steps.judgePrompts).toHaveLength(3);
    // sorted desc by feasibilityScore
    expect(plan.childCandidates.map((c) => c.title)).toEqual([
      '候选高',
      '候选中',
      '候选低',
    ]);
    // score formula: 0.2*0.5 + 0.2*0.5 + 0.3*0.5 + 0.3*value
    expect(plan.childCandidates[0]!.feasibilityScore).toBeCloseTo(0.62, 10);
    // topPick refilled to the score winner, annotation appended
    expect(plan.topPick).toBe('候选高');
    expect(plan.topPickReasoning).toContain('PM 觉得它眼熟');
    expect(plan.topPickReasoning).toContain(
      '[PM 原推荐：候选低，被评分员分流改为 候选高]',
    );
    // identity + validity
    expect(plan.topicId).toBe(topic.id);
    expect(() => NextMovePlanSchema.parse(plan)).not.toThrow();
  });

  it('keeps the PM reasoning unannotated when its draft already matches the winner', async () => {
    const steps = makeSteps(
      {
        status: 'multi_path_choice',
        atomicityScore: 0.3,
        whatsMissing: ['两条路线未择一'],
        childCandidates: [
          { title: 'A 路线', recommendedAction: 'spawn_and_run' },
          { title: 'B 路线', recommendedAction: 'spawn_only' },
        ],
        topPick: 'A 路线',
        topPickReasoning: '解锁后续一切',
      },
      { 'A 路线': bd(0.95), 'B 路线': bd(0.2) },
    );
    const plan = await generateNextMovePlan(topic, localMax, steps);
    expect(plan.topPick).toBe('A 路线');
    expect(plan.topPickReasoning).toBe('解锁后续一切');
    expect(plan.topPickReasoning).not.toContain('PM 原推荐');
  });

  it('drops candidates + spends zero judge calls for atomic_complete', async () => {
    const steps = makeSteps(
      {
        status: 'atomic_complete',
        atomicityScore: 0.9,
        whatsMissing: [],
        // a stray candidate the PM shouldn't have emitted — must be dropped
        childCandidates: [{ title: '多余', recommendedAction: 'skip' }],
        topPick: '多余',
      },
      {},
    );
    const plan = await generateNextMovePlan(topic, localMax, steps);
    expect(plan.status).toBe('atomic_complete');
    expect(plan.childCandidates).toEqual([]);
    expect(plan.topPick).toBeUndefined();
    expect(plan.topPickReasoning).toBeUndefined();
    expect(steps.judgePrompts).toHaveLength(0);
  });

  it('drops candidates for needs_real_world_data the same way', async () => {
    const steps = makeSteps(
      {
        status: 'needs_real_world_data',
        atomicityScore: 0.5,
        whatsMissing: ['需要真实报价数据'],
        childCandidates: [],
      },
      {},
    );
    const plan = await generateNextMovePlan(topic, localMax, steps);
    expect(plan.status).toBe('needs_real_world_data');
    expect(plan.childCandidates).toEqual([]);
    expect(steps.judgePrompts).toHaveLength(0);
  });

  it('threads parentContext lineage into the PM prompt', async () => {
    const steps = makeSteps(
      {
        status: 'atomic_complete',
        atomicityScore: 0.8,
        whatsMissing: [],
        childCandidates: [],
      },
      {},
    );
    await generateNextMovePlan(topic, localMax, steps, {
      parentContext: { depth: 2, ancestorTopicTitles: ['根问题', '一层子题'] },
    });
    expect(steps.pmPrompts[0]).toContain('第 2 层');
    expect(steps.pmPrompts[0]).toContain('根问题 → 一层子题');
  });

  it('threads researchFindings into the PM prompt for re-triage', async () => {
    const steps = makeSteps(
      {
        status: 'needs_deepening',
        atomicityScore: 0.6,
        whatsMissing: [],
        childCandidates: [],
      },
      {},
    );
    await generateNextMovePlan(topic, localMax, steps, {
      researchFindings: '### 缺口 1\nSEC 官网显示 BD 注册平均 180 天',
    });
    expect(steps.pmPrompts[0]).toContain('已通过网络搜索补充的现实数据');
    expect(steps.pmPrompts[0]).toContain('BD 注册平均 180 天');
    expect(steps.pmPrompts[0]).toContain('不要再把它们标成 needs_real_world_data');
  });

  it('tolerates explicit nulls on optional PM fields (live-observed Sonnet behaviour)', async () => {
    const steps = makeSteps(
      {
        status: 'needs_deepening',
        atomicityScore: 0.4,
        whatsMissing: ['x'],
        childCandidates: [
          {
            title: '唯一候选',
            sourceOpenQuestion: null,
            sourceOptionChoice: null,
            recommendedAction: 'spawn_and_run',
          },
        ],
        topPick: null,
        topPickReasoning: null,
      },
      { 唯一候选: bd(0.8) },
    );
    const plan = await generateNextMovePlan(topic, localMax, steps);
    expect(plan.childCandidates).toHaveLength(1);
    expect(plan.childCandidates[0]!.sourceOpenQuestion).toBeUndefined();
    expect(plan.topPick).toBe('唯一候选');
    expect(plan.topPickReasoning).toBeUndefined();
  });

  it('throws a labelled error when the PM output fails schema validation', async () => {
    const steps = makeSteps(
      {
        status: 'done', // not a valid NextMovePlanStatus
        atomicityScore: 0.5,
        whatsMissing: [],
        childCandidates: [],
      },
      {},
    );
    await expect(
      generateNextMovePlan(topic, localMax, steps),
    ).rejects.toThrow(/PM 输出不符合 PmOutputSchema/);
  });

  it('rejects a PM payload with more than 5 candidates', async () => {
    const steps = makeSteps(
      {
        status: 'needs_deepening',
        atomicityScore: 0.4,
        whatsMissing: ['x'],
        childCandidates: Array.from({ length: 6 }, (_, i) => ({
          title: `c${i}`,
          recommendedAction: 'skip',
        })),
      },
      {},
    );
    await expect(
      generateNextMovePlan(topic, localMax, steps),
    ).rejects.toThrow(/PM 输出不符合/);
  });

  it('propagates a judge failure instead of returning a half-scored plan', async () => {
    const steps = makeSteps(
      {
        status: 'needs_deepening',
        atomicityScore: 0.4,
        whatsMissing: ['x'],
        childCandidates: [
          { title: '好候选', recommendedAction: 'spawn_and_run' },
          { title: '坏候选', recommendedAction: 'spawn_only' },
        ],
      },
      {
        好候选: bd(0.9),
        坏候选: { ...bd(0.5), decisionRisk: 2 }, // invalid dimension
      },
    );
    await expect(
      generateNextMovePlan(topic, localMax, steps),
    ).rejects.toThrow(/坏候选/);
  });
});

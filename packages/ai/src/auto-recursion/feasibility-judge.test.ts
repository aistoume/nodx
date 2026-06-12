import { describe, expect, it } from 'vitest';
import type { FeasibilityBreakdown } from '@nodx/models';
import {
  FEASIBILITY_JUDGE_PROMPT_MODEL,
  buildFeasibilityJudgePrompt,
} from '../prompts/auto-recursion/feasibility-judge.js';
import { MODELS } from '../models.js';
import {
  computeFeasibilityScore,
  scoreFeasibility,
} from './feasibility-judge.js';

const ctx = {
  topicTitle: '要不要自建风控系统？',
  localMaxBest: '先用第三方风控撑过前 6 个月，并行评估自建。',
};

const validBreakdown: FeasibilityBreakdown = {
  resourceCost: 0.4,
  timeToResolve: 0.2,
  decisionRisk: 0.6,
  value: 0.9,
  dependencies: ['需要第三方报价单'],
};

describe('buildFeasibilityJudgePrompt', () => {
  it('routes to Haiku and embeds candidate + context', () => {
    expect(FEASIBILITY_JUDGE_PROMPT_MODEL).toBe(MODELS.haiku);
    const p = buildFeasibilityJudgePrompt({
      candidateTitle: '对比三家第三方风控的 SLA',
      topicTitle: ctx.topicTitle,
      localMaxBest: ctx.localMaxBest,
    });
    expect(p).toContain('对比三家第三方风控的 SLA');
    expect(p).toContain('要不要自建风控系统？');
    expect(p).toContain('dependencies');
  });

  it('truncates an over-long localMaxBest to keep the prompt tight', () => {
    const p = buildFeasibilityJudgePrompt({
      candidateTitle: 'x',
      topicTitle: 't',
      localMaxBest: 'A'.repeat(2000),
    });
    expect(p.length).toBeLessThan(1500);
  });
});

describe('computeFeasibilityScore', () => {
  it('applies the 0.2/0.2/0.3/0.3 weights with cost/time/risk inverted', () => {
    // (1-0.4)*0.2 + (1-0.2)*0.2 + (1-0.6)*0.3 + 0.9*0.3 = 0.12+0.16+0.12+0.27
    expect(computeFeasibilityScore(validBreakdown)).toBeCloseTo(0.67, 10);
  });

  it('scores the ideal candidate 1 and the worst-cost candidate 0.3', () => {
    expect(
      computeFeasibilityScore({
        resourceCost: 0,
        timeToResolve: 0,
        decisionRisk: 0,
        value: 1,
        dependencies: [],
      }),
    ).toBe(1);
    expect(
      computeFeasibilityScore({
        resourceCost: 1,
        timeToResolve: 1,
        decisionRisk: 1,
        value: 1,
        dependencies: [],
      }),
    ).toBeCloseTo(0.3, 10);
  });

  it('stays within ChildCandidateSchema bounds at the extremes', () => {
    expect(
      computeFeasibilityScore({
        resourceCost: 0,
        timeToResolve: 0,
        decisionRisk: 0,
        value: 0,
        dependencies: [],
      }),
    ).toBeCloseTo(0.7, 10);
  });
});

describe('scoreFeasibility', () => {
  it('builds the prompt, calls the judge, and returns the validated breakdown', async () => {
    const prompts: string[] = [];
    const result = await scoreFeasibility('候选 A', ctx, async (p) => {
      prompts.push(p);
      return validBreakdown;
    });
    expect(result).toEqual(validBreakdown);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('候选 A');
  });

  it('throws a labelled error when a dimension is out of range', async () => {
    await expect(
      scoreFeasibility('候选 B', ctx, async () => ({
        ...validBreakdown,
        value: 1.5,
      })),
    ).rejects.toThrow(/评分员输出不符合.*候选 B/s);
  });

  it('throws when dependencies are missing', async () => {
    const { dependencies: _drop, ...rest } = validBreakdown;
    await expect(
      scoreFeasibility('候选 C', ctx, async () => rest),
    ).rejects.toThrow(/FeasibilityBreakdown/);
  });

  it('throws when the judge returns non-JSON-object garbage', async () => {
    await expect(
      scoreFeasibility('候选 D', ctx, async () => 'high feasibility'),
    ).rejects.toThrow();
  });
});

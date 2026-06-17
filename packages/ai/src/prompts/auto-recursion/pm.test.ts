import { describe, expect, it } from 'vitest';
import { MODELS } from '../../models.js';
import {
  PM_PROMPT_MODEL,
  PM_PROMPT_VERSION,
  PmOutputSchema,
  buildPmPrompt,
  type PmInput,
} from './pm.js';

const input: PmInput = {
  topicTitle: '要不要自建风控系统？',
  bestAnswer: '先用第三方风控撑 6 个月，并行评估自建。',
  consensus: ['先买后建'],
  divergence: [{ point: '自建时点', conditions: '日交易量破 10 万则提前' }],
  openQuestions: ['第三方 SLA 够不够？'],
  confidence: 0.8,
};

describe('buildPmPrompt', () => {
  it('routes to Sonnet', () => {
    expect(PM_PROMPT_MODEL).toBe(MODELS.sonnet);
    expect(PM_PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.v\d+$/);
  });

  it('embeds the Local Max fields and the four-element atomicity rule', () => {
    const p = buildPmPrompt(input);
    expect(p).toContain('要不要自建风控系统？');
    expect(p).toContain('先买后建');
    expect(p).toContain('第三方 SLA 够不够？');
    expect(p).toContain('deliverable');
    expect(p).toContain('80%'); // confidence rendered as percentage
  });

  it('carries the user-answerable → multi_path_choice triage boundary (v2)', () => {
    const p = buildPmPrompt(input);
    expect(p).toContain('分流边界');
    expect(p).toContain('用户自己一句话就能回答的前提问题');
    expect(p).toContain('不算 needs_real_world_data');
  });

  it('states the honest-stop principle for real-world data', () => {
    const p = buildPmPrompt(input);
    expect(p).toContain('不是逃避');
    expect(p).toContain('别让 AI 编造调研结果');
  });

  it('threads lineage when parentContext is given, omits it otherwise', () => {
    expect(buildPmPrompt(input)).not.toContain('递进谱系');
    const p = buildPmPrompt({
      ...input,
      parentContext: { depth: 3, ancestorTopicTitles: ['根', '一层'] },
    });
    expect(p).toContain('第 3 层');
    expect(p).toContain('根 → 一层');
  });

  it('PmOutputSchema normalises null optionals to undefined', () => {
    const out = PmOutputSchema.parse({
      status: 'needs_deepening',
      atomicityScore: 0.5,
      whatsMissing: [],
      childCandidates: [],
      topPick: null,
      topPickReasoning: null,
    });
    expect(out.topPick).toBeUndefined();
    expect(out.topPickReasoning).toBeUndefined();
  });
});

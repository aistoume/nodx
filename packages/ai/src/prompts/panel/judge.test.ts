import { describe, expect, it } from 'vitest';
import {
  MARGINAL_THRESHOLD,
  PANEL_JUDGE_PROMPT_MODEL,
  PanelJudgeOutputSchema,
  buildPanelJudgePrompt,
} from './judge.js';

describe('buildPanelJudgePrompt', () => {
  it('binds question and both rounds of stances', () => {
    const out = buildPanelJudgePrompt({
      question: '要不要出海',
      prevStances: ['支持', '反对'],
      currStances: ['有条件支持', '部分让步'],
    });
    expect(out).toContain('要不要出海');
    expect(out).toContain('支持');
    expect(out).toContain('有条件支持');
    expect(out).toContain('部分让步');
  });
});

describe('PanelJudgeOutputSchema', () => {
  it('accepts a valid score', () => {
    const valid = { marginalScore: 0.1, rationale: '基本重复' };
    expect(PanelJudgeOutputSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a score out of range', () => {
    expect(() =>
      PanelJudgeOutputSchema.parse({ marginalScore: 1.2, rationale: 'x' }),
    ).toThrow();
  });
});

describe('judge metadata', () => {
  it('routes to haiku (runs every round)', () => {
    expect(PANEL_JUDGE_PROMPT_MODEL).toContain('haiku');
  });

  it('exposes a sane default threshold', () => {
    expect(MARGINAL_THRESHOLD).toBeGreaterThan(0);
    expect(MARGINAL_THRESHOLD).toBeLessThan(1);
  });
});

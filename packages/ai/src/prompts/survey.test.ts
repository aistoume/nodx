import { describe, expect, it } from 'vitest';
import {
  SURVEY_PROMPT_MODEL,
  SURVEY_PROMPT_VERSION,
  SurveyOutputSchema,
  buildSurveyPrompt,
} from './survey.js';

describe('buildSurveyPrompt', () => {
  it('embeds the user question verbatim', () => {
    const out = buildSurveyPrompt({ question: '要不要 ALL IN AI？' });
    expect(out).toContain('要不要 ALL IN AI？');
    expect(out).toContain('开场分析师');
  });

  it('asks for JSON output', () => {
    const out = buildSurveyPrompt({ question: 'foo' });
    expect(out).toMatch(/JSON/);
  });
});

describe('SurveyOutputSchema', () => {
  it('accepts 5 factors', () => {
    const factors = Array.from({ length: 5 }, (_, i) => ({
      id: `f_${i}`,
      title: `维度 ${i}`,
      hint: '解释',
    }));
    expect(SurveyOutputSchema.parse({ factors })).toEqual({ factors });
  });

  it('rejects fewer than 5 factors', () => {
    expect(() =>
      SurveyOutputSchema.parse({
        factors: [{ id: 'a', title: 't' }],
      }),
    ).toThrow();
  });

  it('rejects more than 7 factors', () => {
    const factors = Array.from({ length: 8 }, (_, i) => ({
      id: `f_${i}`,
      title: `t${i}`,
    }));
    expect(() => SurveyOutputSchema.parse({ factors })).toThrow();
  });

  it('hint is optional', () => {
    const factors = Array.from({ length: 5 }, (_, i) => ({
      id: `f_${i}`,
      title: `t${i}`,
    }));
    expect(() => SurveyOutputSchema.parse({ factors })).not.toThrow();
  });
});

describe('survey metadata', () => {
  it('exposes a non-empty version + model id', () => {
    expect(SURVEY_PROMPT_VERSION).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(SURVEY_PROMPT_MODEL).toMatch(/^claude-/);
  });
});

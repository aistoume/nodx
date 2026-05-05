import { describe, expect, it } from 'vitest';
import {
  EXPLAIN_PROMPT_MODEL,
  ExplainOutputSchema,
  buildExplainPrompt,
} from './explain.js';

describe('buildExplainPrompt', () => {
  it('embeds the selection', () => {
    const out = buildExplainPrompt({ selection: '美林时钟' });
    expect(out).toContain('美林时钟');
  });

  it('omits the context line when none is given', () => {
    const out = buildExplainPrompt({ selection: 'PEG' });
    expect(out).not.toContain('上下文：');
  });

  it('includes the context line when given', () => {
    const out = buildExplainPrompt({
      selection: 'PEG',
      context: '估值章节',
    });
    expect(out).toContain('上下文：估值章节');
  });
});

describe('ExplainOutputSchema', () => {
  it('accepts mid-length explanation', () => {
    const v = { explanation: '美林时钟是把宏观周期分四阶段的资产轮动框架。' };
    expect(ExplainOutputSchema.parse(v)).toEqual(v);
  });

  it('rejects empty/very-short explanation', () => {
    expect(() =>
      ExplainOutputSchema.parse({ explanation: '太短' }),
    ).toThrow();
  });

  it('rejects explanations beyond the 400-char ceiling', () => {
    const long = '细节'.repeat(300);
    expect(() => ExplainOutputSchema.parse({ explanation: long })).toThrow();
  });
});

describe('explain metadata', () => {
  it('routes to haiku for low latency on hover', () => {
    expect(EXPLAIN_PROMPT_MODEL).toContain('haiku');
  });
});

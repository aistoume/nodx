import { describe, expect, it } from 'vitest';
import {
  RECOMMEND_PANEL_PROMPT_MODEL,
  RecommendPanelOutputSchema,
  buildRecommendPanelPrompt,
} from './recommend.js';

describe('buildRecommendPanelPrompt', () => {
  it('binds domain, question and context', () => {
    const out = buildRecommendPanelPrompt({
      domain: '跨境电商战略',
      question: '要不要现在出海东南亚',
      context: '现金流紧张',
    });
    expect(out).toContain('跨境电商战略');
    expect(out).toContain('要不要现在出海东南亚');
    expect(out).toContain('现金流紧张');
  });

  it('falls back to a placeholder when context is empty', () => {
    const out = buildRecommendPanelPrompt({
      domain: 'd',
      question: 'q',
      context: '',
    });
    expect(out).toContain('无上下文');
  });
});

describe('RecommendPanelOutputSchema', () => {
  const member = (role: string, name = role) => ({
    displayName: name,
    role,
    systemPrompt: `你是${name}`,
  });

  it('accepts a valid 3-member panel with a critic', () => {
    const valid = {
      members: [member('proposer'), member('critic'), member('practitioner')],
    };
    expect(RecommendPanelOutputSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a panel with no critic (echo-chamber guard)', () => {
    expect(() =>
      RecommendPanelOutputSchema.parse({
        members: [
          member('proposer'),
          member('practitioner'),
          member('constraint'),
        ],
      }),
    ).toThrow();
  });

  it('rejects fewer than 3 members', () => {
    expect(() =>
      RecommendPanelOutputSchema.parse({
        members: [member('proposer'), member('critic')],
      }),
    ).toThrow();
  });

  it('rejects more than 5 members', () => {
    expect(() =>
      RecommendPanelOutputSchema.parse({
        members: [
          member('proposer'),
          member('critic'),
          member('practitioner'),
          member('constraint'),
          member('user_proxy'),
          member('proposer', 'proposer2'),
        ],
      }),
    ).toThrow();
  });

  it('rejects an unknown role', () => {
    expect(() =>
      RecommendPanelOutputSchema.parse({
        members: [member('proposer'), member('critic'), member('strategist')],
      }),
    ).toThrow();
  });
});

describe('recommend metadata', () => {
  it('routes to sonnet (composition is reasoning)', () => {
    expect(RECOMMEND_PANEL_PROMPT_MODEL).toContain('sonnet');
  });
});

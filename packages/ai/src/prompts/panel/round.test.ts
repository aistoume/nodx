import { describe, expect, it } from 'vitest';
import { MODELS } from '../../models.js';
import {
  PANEL_ROUND_PROMPT_MODEL,
  buildCritiquePrompt,
  buildInitialPrompt,
  buildRefinePrompt,
  type PeerUtterance,
} from './round.js';

const peers: PeerUtterance[] = [
  { displayName: '老王', role: 'critic', content: '现金流撑不住' },
  { displayName: '小李', role: 'practitioner', content: '渠道已经铺好' },
];

describe('buildInitialPrompt', () => {
  it('binds question and context, and stays closed-book', () => {
    const out = buildInitialPrompt({
      question: '要不要出海',
      context: '现金流紧张',
    });
    expect(out).toContain('要不要出海');
    expect(out).toContain('现金流紧张');
    expect(out).toContain('第 1 轮');
    // Round 1 must NOT leak peer content into the prompt.
    expect(out).not.toContain('老王');
  });

  it('falls back when context empty', () => {
    expect(buildInitialPrompt({ question: 'q', context: '' })).toContain(
      '无上下文',
    );
  });
});

describe('buildCritiquePrompt', () => {
  it('includes own initial and every peer', () => {
    const out = buildCritiquePrompt({
      question: '要不要出海',
      ownInitial: '我支持出海',
      peers,
    });
    expect(out).toContain('第 2 轮');
    expect(out).toContain('我支持出海');
    expect(out).toContain('老王');
    expect(out).toContain('现金流撑不住');
    expect(out).toContain('小李');
  });
});

describe('buildRefinePrompt', () => {
  it('includes own history and peer critiques', () => {
    const out = buildRefinePrompt({
      question: '要不要出海',
      ownHistory: ['初判：支持', '质疑回应：部分让步'],
      peerCritiques: peers,
    });
    expect(out).toContain('第 3 轮');
    expect(out).toContain('初判：支持');
    expect(out).toContain('质疑回应：部分让步');
    expect(out).toContain('老王');
    expect(out).toContain('已被说服');
  });
});

describe('round metadata', () => {
  it('routes to sonnet', () => {
    expect(PANEL_ROUND_PROMPT_MODEL).toBe(MODELS.sonnet);
  });
});

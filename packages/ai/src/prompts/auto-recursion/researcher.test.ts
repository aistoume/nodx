import { describe, expect, it } from 'vitest';
import { MODELS } from '../../models.js';
import {
  RESEARCHER_PROMPT_MODEL,
  RESEARCH_VERDICT_PROMPT_MODEL,
  ResearchVerdictSchema,
  buildResearcherPrompt,
  buildResearchVerdictPrompt,
} from './researcher.js';

describe('buildResearcherPrompt', () => {
  it('routes to Sonnet (caller adds enableWebSearch) and embeds the gaps', () => {
    expect(RESEARCHER_PROMPT_MODEL).toBe(MODELS.sonnet);
    const p = buildResearcherPrompt({
      topicTitle: '要不要自建风控？',
      bestAnswer: '先买后建。',
      gaps: ['第三方风控报价区间', '内部历史交易量基线'],
    });
    expect(p).toContain('要不要自建风控？');
    expect(p).toContain('1. 第三方风控报价区间');
    expect(p).toContain('2. 内部历史交易量基线');
  });

  it('demands honesty: unanswerable gaps must be marked, never fabricated', () => {
    const p = buildResearcherPrompt({
      topicTitle: 't',
      bestAnswer: 'b',
      gaps: ['g'],
    });
    expect(p).toContain('公开渠道无法回答');
    expect(p).toContain('绝不编造数字');
  });

  it('truncates an over-long bestAnswer', () => {
    const p = buildResearcherPrompt({
      topicTitle: 't',
      bestAnswer: 'A'.repeat(5000),
      gaps: ['g'],
    });
    expect(p.length).toBeLessThan(2000);
  });
});

describe('buildResearchVerdictPrompt + schema', () => {
  it('routes to Haiku, numbers the gaps, and demands index-only output', () => {
    expect(RESEARCH_VERDICT_PROMPT_MODEL).toBe(MODELS.haiku);
    const p = buildResearchVerdictPrompt({
      gaps: ['报价区间', '内部交易量'],
      findingsMarkdown: '### 缺口 1：报价\nGartner 2026 报告显示…',
    });
    expect(p).toContain('1. 报价区间');
    expect(p).toContain('2. 内部交易量');
    expect(p).toContain('Gartner 2026');
    expect(p).toContain('宁可保守');
    expect(p).toContain('只填上面的缺口编号');
  });

  it('schema accepts numeric gap indexes + both verdicts, rejects unknown verdict', () => {
    expect(
      ResearchVerdictSchema.parse({
        resolvedGaps: [1],
        stillMissing: [2, 3],
        verdict: 'resolved_enough',
      }).resolvedGaps,
    ).toEqual([1]);
    expect(() =>
      ResearchVerdictSchema.parse({
        resolvedGaps: [],
        stillMissing: [1],
        verdict: 'maybe',
      }),
    ).toThrow();
  });

  it('schema rejects non-numeric / non-positive gap entries', () => {
    expect(() =>
      ResearchVerdictSchema.parse({
        resolvedGaps: ['报价区间'],
        stillMissing: [],
        verdict: 'still_blocked',
      }),
    ).toThrow();
    expect(() =>
      ResearchVerdictSchema.parse({
        resolvedGaps: [0],
        stillMissing: [],
        verdict: 'still_blocked',
      }),
    ).toThrow();
  });

  it('schema rejects extra keys (strict)', () => {
    expect(() =>
      ResearchVerdictSchema.parse({
        resolvedGaps: [],
        stillMissing: [],
        verdict: 'still_blocked',
        notes: 'x',
      }),
    ).toThrow();
  });
});

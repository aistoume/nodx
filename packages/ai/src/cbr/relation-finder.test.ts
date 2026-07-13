import { describe, expect, it } from 'vitest';
import { MODELS } from '../models.js';
import {
  RELATION_FINDER_PROMPT_MODEL,
  RelationFinderOutputSchema,
  buildRelationFinderPrompt,
} from './relation-finder.js';

describe('buildRelationFinderPrompt', () => {
  it('binds the new case and lists existing case ids', () => {
    const out = buildRelationFinderPrompt({
      newCase: {
        domain: '跨境电商战略',
        decisionType: 'go_no_go',
        frameworks: ['第一性原理'],
        signatureText: '出海东南亚 现金流紧张',
        solutionText: '分阶段试点',
      },
      existing: [
        {
          id: 'case_old',
          domain: '企业融资',
          decisionType: 'tradeoff',
          frameworks: ['DCF'],
          signatureText: '融资稀释',
        },
      ],
    });
    expect(out).toContain('跨境电商战略');
    expect(out).toContain('case_old');
    expect(out).toContain('融资稀释');
  });

  it('notes the empty-library case', () => {
    const out = buildRelationFinderPrompt({
      newCase: {
        domain: 'd',
        decisionType: 'go_no_go',
        frameworks: [],
        signatureText: 's',
        solutionText: 'x',
      },
      existing: [],
    });
    expect(out).toContain('案例库为空');
  });
});

describe('RelationFinderOutputSchema', () => {
  it('accepts an empty relation list', () => {
    expect(RelationFinderOutputSchema.parse({ relations: [] })).toEqual({
      relations: [],
    });
  });
  it('accepts valid relations', () => {
    const v = {
      relations: [
        { targetCaseId: 'c2', relationType: 'shares_domain', weight: 0.6 },
      ],
    };
    expect(RelationFinderOutputSchema.parse(v)).toEqual(v);
  });
  it('rejects an unknown relationType', () => {
    expect(() =>
      RelationFinderOutputSchema.parse({
        relations: [{ targetCaseId: 'c2', relationType: 'vibes', weight: 0.5 }],
      }),
    ).toThrow();
  });
  it('rejects weight out of range', () => {
    expect(() =>
      RelationFinderOutputSchema.parse({
        relations: [
          { targetCaseId: 'c2', relationType: 'contrasts', weight: 9 },
        ],
      }),
    ).toThrow();
  });
});

describe('relation-finder metadata', () => {
  it('routes to sonnet', () => {
    expect(RELATION_FINDER_PROMPT_MODEL).toBe(MODELS.sonnet);
  });
});

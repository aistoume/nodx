import { describe, expect, it } from 'vitest';
import {
  AbstractedCaseSchema,
  CaseVisibilitySchema,
  DecisionTypeSchema,
  EMBEDDING_DIM,
  EmbeddingSchema,
  ProblemSignatureSchema,
  SolutionPatternSchema,
  type AbstractedCase,
} from './abstracted-case.js';

const emb = () => Array.from({ length: EMBEDDING_DIM }, () => 0.01);

const valid: AbstractedCase = {
  id: 'case_1',
  sourceTopicId: 'topic_1',
  problemSignature: {
    domain: '跨境电商战略',
    decisionType: 'go_no_go',
    keyDimensions: ['现金流', '渠道'],
    constraints: ['6 个月窗口'],
  },
  reasoningPath: {
    frameworks: ['第一性原理'],
    keyQuestions: ['市场是否真实存在'],
    pivotalDecisions: ['先小规模试点'],
  },
  solutionPattern: {
    structure: '分阶段试点',
    keyLevers: ['本地化运营'],
    riskMitigations: ['Q3 复盘止损'],
  },
  outcome: { qualityScore: 0.8 },
  problemEmb: emb(),
  solutionEmb: emb(),
  visibility: 'private',
  freshnessDate: 1_700_000_000_000,
  createdAt: 1_700_000_000_000,
};

describe('EmbeddingSchema', () => {
  it('accepts a 768-dim vector', () => {
    expect(EmbeddingSchema.parse(emb())).toHaveLength(EMBEDDING_DIM);
  });
  it('rejects the wrong dimensionality', () => {
    expect(() => EmbeddingSchema.parse([0, 1, 2])).toThrow();
  });
});

describe('DecisionTypeSchema / CaseVisibilitySchema', () => {
  it('accepts documented values', () => {
    for (const d of ['go_no_go', 'allocation', 'sequencing', 'tradeoff'] as const) {
      expect(DecisionTypeSchema.parse(d)).toBe(d);
    }
    for (const v of ['private', 'team', 'public_anonymous'] as const) {
      expect(CaseVisibilitySchema.parse(v)).toBe(v);
    }
  });
  it('rejects unknown values', () => {
    expect(() => DecisionTypeSchema.parse('vibes')).toThrow();
    expect(() => CaseVisibilitySchema.parse('world')).toThrow();
  });
});

describe('sub-schemas', () => {
  it('reject empty required strings', () => {
    expect(() =>
      ProblemSignatureSchema.parse({
        domain: '',
        decisionType: 'go_no_go',
        keyDimensions: [],
        constraints: [],
      }),
    ).toThrow();
    expect(() =>
      SolutionPatternSchema.parse({
        structure: '',
        keyLevers: [],
        riskMitigations: [],
      }),
    ).toThrow();
  });
});

describe('AbstractedCaseSchema', () => {
  it('accepts a valid case', () => {
    expect(AbstractedCaseSchema.parse(valid)).toEqual(valid);
  });

  it('rejects qualityScore out of [0,1]', () => {
    expect(() =>
      AbstractedCaseSchema.parse({
        ...valid,
        outcome: { qualityScore: 1.4 },
      }),
    ).toThrow();
  });

  it('rejects a mis-sized embedding', () => {
    expect(() =>
      AbstractedCaseSchema.parse({ ...valid, problemEmb: [0, 1] }),
    ).toThrow();
  });

  it('rejects unknown extra fields (strict)', () => {
    expect(() =>
      AbstractedCaseSchema.parse({ ...valid, scratch: 1 }),
    ).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import {
  CaseRelationSchema,
  CaseRelationTypeSchema,
  type CaseRelation,
} from './case-relation.js';

const valid: CaseRelation = {
  id: 'rel_1',
  sourceCaseId: 'case_a',
  targetCaseId: 'case_b',
  relationType: 'shares_framework',
  weight: 0.7,
  createdAt: 1_700_000_000_000,
};

describe('CaseRelationTypeSchema', () => {
  it('accepts the five documented relation types', () => {
    for (const t of [
      'shares_framework',
      'shares_domain',
      'contrasts',
      'composed_from',
      'caused_by',
    ] as const) {
      expect(CaseRelationTypeSchema.parse(t)).toBe(t);
    }
  });
  it('rejects an unknown relation type', () => {
    expect(() => CaseRelationTypeSchema.parse('rhymes_with')).toThrow();
  });
});

describe('CaseRelationSchema', () => {
  it('accepts a valid relation', () => {
    expect(CaseRelationSchema.parse(valid)).toEqual(valid);
  });
  it('rejects weight out of [0,1]', () => {
    expect(() => CaseRelationSchema.parse({ ...valid, weight: 1.2 })).toThrow();
  });
  it('rejects a self-relation', () => {
    expect(() =>
      CaseRelationSchema.parse({ ...valid, targetCaseId: valid.sourceCaseId }),
    ).toThrow();
  });
  it('rejects unknown extra fields (strict)', () => {
    expect(() => CaseRelationSchema.parse({ ...valid, extra: 1 })).toThrow();
  });
});

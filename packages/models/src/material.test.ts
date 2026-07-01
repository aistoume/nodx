import { describe, expect, it } from 'vitest';
import {
  MATERIAL_KIND_META,
  MaterialKindSchema,
  MaterialRefSchema,
  type MaterialRef,
} from './material.js';

const validSolution: MaterialRef = {
  id: 'case_1',
  kind: 'solution',
  title: '战略：先买后建的风控路径',
  subtitle: '风控 · sequencing',
  body: '第一阶段用第三方…',
  createdAt: 1_700_000_000_000,
};

describe('MaterialKindSchema', () => {
  it('accepts the two documented kinds', () => {
    expect(MaterialKindSchema.parse('solution')).toBe('solution');
    expect(MaterialKindSchema.parse('inspiration')).toBe('inspiration');
  });

  it('rejects an unknown kind', () => {
    expect(() => MaterialKindSchema.parse('case')).toThrow();
  });
});

describe('MaterialRefSchema', () => {
  it('accepts a full solution ref', () => {
    expect(MaterialRefSchema.parse(validSolution)).toEqual(validSolution);
  });

  it('accepts an inspiration ref without subtitle/body', () => {
    const insp: MaterialRef = {
      id: 'att_1',
      kind: 'inspiration',
      title: '一段从网页存下来的话',
      createdAt: 1,
    };
    expect(MaterialRefSchema.parse(insp)).toEqual(insp);
  });

  it('rejects empty title', () => {
    expect(() =>
      MaterialRefSchema.parse({ ...validSolution, title: '' }),
    ).toThrow();
  });

  it('rejects missing id / kind', () => {
    const { id: _i, ...noId } = validSolution;
    expect(() => MaterialRefSchema.parse(noId)).toThrow();
    const { kind: _k, ...noKind } = validSolution;
    expect(() => MaterialRefSchema.parse(noKind)).toThrow();
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(() =>
      MaterialRefSchema.parse({ ...validSolution, score: 1 }),
    ).toThrow();
  });
});

describe('MATERIAL_KIND_META', () => {
  it('has an entry for every kind', () => {
    expect(MATERIAL_KIND_META.solution.label).toBe('方案');
    expect(MATERIAL_KIND_META.inspiration.label).toBe('灵感');
  });
});

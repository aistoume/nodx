import { describe, expect, it } from 'vitest';
import { EdgeSchema, type Edge } from './edge.js';

const parentEdge: Edge = {
  id: 'edge_1',
  sourceId: 'topic_1',
  targetId: 'topic_2',
  type: 'parent',
  isUserConfirmed: true,
};

describe('EdgeSchema', () => {
  it('accepts a parent edge without weight', () => {
    expect(EdgeSchema.parse(parentEdge)).toEqual(parentEdge);
  });

  it('accepts a semantic edge with weight in [0,1]', () => {
    const semantic: Edge = {
      ...parentEdge,
      id: 'edge_2',
      type: 'semantic',
      isUserConfirmed: false,
      weight: 0.82,
    };
    expect(EdgeSchema.parse(semantic)).toEqual(semantic);
  });

  it('rejects semantic edge without weight', () => {
    expect(() =>
      EdgeSchema.parse({
        ...parentEdge,
        id: 'edge_3',
        type: 'semantic',
        isUserConfirmed: false,
      }),
    ).toThrow(/semantic edges must include a weight/);
  });

  it('rejects self-loop', () => {
    expect(() =>
      EdgeSchema.parse({ ...parentEdge, targetId: parentEdge.sourceId }),
    ).toThrow(/sourceId and targetId must differ/);
  });

  it('rejects weight out of range', () => {
    expect(() =>
      EdgeSchema.parse({
        ...parentEdge,
        type: 'semantic',
        isUserConfirmed: false,
        weight: 1.5,
      }),
    ).toThrow();
  });
});

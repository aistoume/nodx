import { describe, expect, it } from 'vitest';
import {
  FRESHNESS_TAU_MS,
  RANKING_WEIGHTS,
  cosineSimilarity,
  freshnessDecay,
  maxSimByCase,
  rankCases,
} from './ranking.js';

describe('cosineSimilarity', () => {
  it('maps identical vectors to 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });
  it('maps opposite vectors to 0', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(0, 6);
  });
  it('maps orthogonal vectors to 0.5', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.5, 6);
  });
  it('returns 0 for a zero vector', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('freshnessDecay', () => {
  it('is 1 for a brand-new case', () => {
    expect(freshnessDecay(0)).toBe(1);
    expect(freshnessDecay(-100)).toBe(1);
  });
  it('decays toward 0 with age', () => {
    const young = freshnessDecay(FRESHNESS_TAU_MS / 10);
    const old = freshnessDecay(FRESHNESS_TAU_MS * 5);
    expect(young).toBeGreaterThan(old);
    expect(old).toBeLessThan(0.1);
  });
});

describe('maxSimByCase', () => {
  it('keeps the max similarity per case', () => {
    const m = maxSimByCase([
      { caseId: 'a', sim: 0.3 },
      { caseId: 'a', sim: 0.9 },
      { caseId: 'b', sim: 0.5 },
    ]);
    expect(m.get('a')).toBe(0.9);
    expect(m.get('b')).toBe(0.5);
  });
});

describe('rankCases', () => {
  const now = 1_000_000_000_000;
  it('applies the documented weights and sorts desc', () => {
    const ranked = rankCases(
      [
        { caseId: 'hi-sem', semanticSim: 1, keywordSim: 0, freshnessDate: now },
        { caseId: 'hi-kw', semanticSim: 0, keywordSim: 1, freshnessDate: now },
      ],
      { now },
    );
    // semantic weight (0.6) beats keyword (0.3) → hi-sem first
    expect(ranked[0]!.caseId).toBe('hi-sem');
    // hi-sem score = 0.6*1 + 0.3*0 + 0.1*1(fresh) = 0.7
    expect(ranked[0]!.score).toBeCloseTo(
      RANKING_WEIGHTS.semantic + RANKING_WEIGHTS.freshness,
      6,
    );
  });

  it('respects topK', () => {
    const cases = Array.from({ length: 10 }, (_, i) => ({
      caseId: `c${i}`,
      semanticSim: i / 10,
      keywordSim: 0,
      freshnessDate: now,
    }));
    expect(rankCases(cases, { now, topK: 3 })).toHaveLength(3);
  });

  it('exposes the score breakdown', () => {
    const [r] = rankCases(
      [{ caseId: 'a', semanticSim: 0.8, keywordSim: 0.4, freshnessDate: now }],
      { now },
    );
    expect(r!.breakdown.semantic).toBe(0.8);
    expect(r!.breakdown.keyword).toBe(0.4);
    expect(r!.breakdown.freshness).toBeCloseTo(1, 6);
  });
});

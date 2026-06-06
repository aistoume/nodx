/**
 * Heuristic recall ranking (PRD §3.16 ③). V1 replaces a reranker with a
 * weighted blend of the two recall paths plus a freshness term:
 *
 *   score = 0.60 × semantic_sim + 0.30 × keyword_sim + 0.10 × freshness_decay
 *
 * Pure functions (no AI, no DB) so the whole ranking is unit-testable.
 */

export const RANKING_WEIGHTS = {
  semantic: 0.6,
  keyword: 0.3,
  freshness: 0.1,
} as const;

/** Freshness half-life-ish constant: ~180 days in ms. */
export const FRESHNESS_TAU_MS = 180 * 24 * 60 * 60 * 1000;

/** Cosine similarity, mapped from [-1,1] to [0,1]. Returns 0 for a zero vector. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return (cos + 1) / 2;
}

/** Exponential freshness decay ∈ (0,1]: 1 when fresh, → 0 as the case ages. */
export function freshnessDecay(ageMs: number, tauMs: number = FRESHNESS_TAU_MS): number {
  if (ageMs <= 0) return 1;
  return Math.exp(-ageMs / tauMs);
}

export interface RankInputCase {
  caseId: string;
  /** Best semantic similarity for this case across sub-intents (0–1). */
  semanticSim: number;
  /** Best keyword similarity for this case across sub-intents (0–1). */
  keywordSim: number;
  /** When the case was created/refreshed (epoch-ms), for the decay term. */
  freshnessDate: number;
}

export interface RankedCase {
  caseId: string;
  score: number;
  breakdown: { semantic: number; keyword: number; freshness: number };
}

export interface RankOptions {
  /** Current time (epoch-ms) for the freshness term. */
  now: number;
  /** Top-K to keep. Default 5 (PRD §3.16 ③). */
  topK?: number;
  weights?: typeof RANKING_WEIGHTS;
  tauMs?: number;
}

/**
 * Blend the recall signals into a single score per case and return the
 * highest Top-K, descending. The caller is responsible for having merged
 * multi-sub-intent / multi-path hits into one `semanticSim` / `keywordSim`
 * per case (see `maxSimByCase`).
 */
export function rankCases(
  cases: RankInputCase[],
  opts: RankOptions,
): RankedCase[] {
  const weights = opts.weights ?? RANKING_WEIGHTS;
  const tauMs = opts.tauMs ?? FRESHNESS_TAU_MS;
  const topK = opts.topK ?? 5;

  return cases
    .map((c) => {
      const freshness = freshnessDecay(opts.now - c.freshnessDate, tauMs);
      const score =
        weights.semantic * c.semanticSim +
        weights.keyword * c.keywordSim +
        weights.freshness * freshness;
      return {
        caseId: c.caseId,
        score,
        breakdown: { semantic: c.semanticSim, keyword: c.keywordSim, freshness },
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Collapse many `{caseId, sim}` hits (e.g. one case matched by several
 * sub-intents) into the max similarity per case.
 */
export function maxSimByCase(
  hits: Array<{ caseId: string; sim: number }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const h of hits) {
    const prev = out.get(h.caseId);
    if (prev === undefined || h.sim > prev) out.set(h.caseId, h.sim);
  }
  return out;
}

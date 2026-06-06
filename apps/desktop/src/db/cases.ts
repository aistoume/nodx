import {
  AbstractedCaseSchema,
  CaseRelationSchema,
  type AbstractedCase,
  type CaseRelation,
  type ProblemSignature,
  type ReasoningPath,
  type SolutionPattern,
  type CaseOutcome,
} from '@nodx/models';
import { base64ToEmbedding, embeddingToBase64, type ExistingCaseSummary } from '@nodx/ai';
import { getDb } from './client.js';

// ──────────────────────────────────────────────────────────────────────
// CBR case persistence (PRD §3.16 / §3.18 — migration v6).
//
// Embeddings are stored as base64 of their Float32-LE bytes in the BLOB
// columns (see embeddingToBase64 in @nodx/ai) — a plain string round-trips
// reliably through the Tauri SQL plugin; the Supabase/pgvector port decodes
// it to a real vector. The FTS5 mirror is kept in sync by triggers, so the
// write path never touches it directly.
//
// Retrieval is NOT implemented here — only the write path.
// ──────────────────────────────────────────────────────────────────────

interface CaseRow {
  id: string;
  source_topic_id: string;
  problem_signature_json: string;
  reasoning_path_json: string;
  solution_pattern_json: string;
  outcome_json: string;
  signature_text: string;
  solution_text: string;
  problem_emb: string;
  solution_emb: string;
  domain: string;
  decision_type: string;
  quality_score: number;
  visibility: string;
  freshness_date: number;
  created_at: number;
}

const CASE_COLUMNS =
  'id, source_topic_id, problem_signature_json, reasoning_path_json, solution_pattern_json, outcome_json, signature_text, solution_text, problem_emb, solution_emb, domain, decision_type, quality_score, visibility, freshness_date, created_at';

function rowToCase(r: CaseRow): AbstractedCase {
  return AbstractedCaseSchema.parse({
    id: r.id,
    sourceTopicId: r.source_topic_id,
    problemSignature: JSON.parse(r.problem_signature_json) as ProblemSignature,
    reasoningPath: JSON.parse(r.reasoning_path_json) as ReasoningPath,
    solutionPattern: JSON.parse(r.solution_pattern_json) as SolutionPattern,
    outcome: JSON.parse(r.outcome_json) as CaseOutcome,
    problemEmb: base64ToEmbedding(r.problem_emb),
    solutionEmb: base64ToEmbedding(r.solution_emb),
    visibility: r.visibility,
    freshnessDate: r.freshness_date,
    createdAt: r.created_at,
  });
}

/**
 * Persist an abstracted case. `signatureText` / `solutionText` are the
 * text-ified blocks (also what was embedded) and feed the FTS5 mirror via the
 * insert trigger. domain / decision_type / quality_score / visibility are
 * denormalised from the case for B-tree filtering.
 */
export async function insertAbstractedCase(
  c: AbstractedCase,
  signatureText: string,
  solutionText: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO abstracted_cases
       (id, source_topic_id, problem_signature_json, reasoning_path_json,
        solution_pattern_json, outcome_json, signature_text, solution_text,
        problem_emb, solution_emb, domain, decision_type, quality_score,
        visibility, freshness_date, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      c.id,
      c.sourceTopicId,
      JSON.stringify(c.problemSignature),
      JSON.stringify(c.reasoningPath),
      JSON.stringify(c.solutionPattern),
      JSON.stringify(c.outcome),
      signatureText,
      solutionText,
      embeddingToBase64(c.problemEmb),
      embeddingToBase64(c.solutionEmb),
      c.problemSignature.domain,
      c.problemSignature.decisionType,
      c.outcome.qualityScore,
      c.visibility,
      c.freshnessDate,
      c.createdAt,
    ],
  );
}

/** Bulk-insert relation edges; the UNIQUE constraint dedupes via OR IGNORE. */
export async function insertCaseRelations(
  relations: CaseRelation[],
): Promise<void> {
  if (relations.length === 0) return;
  const db = await getDb();
  for (const r of relations) {
    await db.execute(
      `INSERT OR IGNORE INTO case_relations
         (id, source_case_id, target_case_id, relation_type, weight, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [r.id, r.sourceCaseId, r.targetCaseId, r.relationType, r.weight, r.createdAt],
    );
  }
}

/** Load one case by its own id (e.g. the one the user chose to adapt). */
export async function getCaseById(
  caseId: string,
): Promise<AbstractedCase | null> {
  const db = await getDb();
  const rows = await db.select<CaseRow[]>(
    `SELECT ${CASE_COLUMNS} FROM abstracted_cases WHERE id = $1 LIMIT 1`,
    [caseId],
  );
  const r = rows[0];
  return r ? rowToCase(r) : null;
}

/** Idempotency guard for ingest — one case per source Topic. */
export async function getCaseByTopic(
  topicId: string,
): Promise<AbstractedCase | null> {
  const db = await getDb();
  const rows = await db.select<CaseRow[]>(
    `SELECT ${CASE_COLUMNS} FROM abstracted_cases WHERE source_topic_id = $1 LIMIT 1`,
    [topicId],
  );
  const r = rows[0];
  return r ? rowToCase(r) : null;
}

export interface ListCaseSummariesOptions {
  /** Skip cases derived from this Topic (don't relate a case to itself). */
  excludeTopicId?: string;
  /** Cap to bound the relation-finder prompt. Default 50. */
  limit?: number;
}

/**
 * Compact view of existing cases for the relation-finder (PRD §3.18). Pulls
 * `frameworks` out of the stored reasoningPath so the finder can spot shared
 * frameworks without us shipping the whole case.
 */
export async function listCaseSummaries(
  opts: ListCaseSummariesOptions = {},
): Promise<ExistingCaseSummary[]> {
  const db = await getDb();
  const where = opts.excludeTopicId ? 'WHERE source_topic_id != $1' : '';
  const params = opts.excludeTopicId ? [opts.excludeTopicId] : [];
  const rows = await db.select<
    Array<Pick<CaseRow, 'id' | 'domain' | 'decision_type' | 'reasoning_path_json' | 'signature_text'>>
  >(
    `SELECT id, domain, decision_type, reasoning_path_json, signature_text
     FROM abstracted_cases ${where}
     ORDER BY created_at DESC LIMIT ${opts.limit ?? 50}`,
    params,
  );
  return rows.map((r) => {
    const reasoning = JSON.parse(r.reasoning_path_json) as ReasoningPath;
    return {
      id: r.id,
      domain: r.domain,
      decisionType: r.decision_type,
      frameworks: reasoning.frameworks,
      signatureText: r.signature_text,
    };
  });
}

export async function countCases(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<Array<{ n: number }>>(
    'SELECT count(*) AS n FROM abstracted_cases',
  );
  return rows[0]?.n ?? 0;
}

// ── Read path (PRD §3.16 ③ retrieval) ─────────────────────────────────────

/**
 * One case loaded for recall: the decoded problem embedding (for brute-force
 * cosine — no vector index on SQLite) plus everything the ranker + fusion
 * writer need, so a query needs just this one fetch.
 */
export interface CaseRecallRow {
  id: string;
  problemEmb: number[];
  domain: string;
  decisionType: string;
  signatureText: string;
  solutionText: string;
  qualityScore: number;
  freshnessDate: number;
}

interface RawRecallRow {
  id: string;
  problem_emb: string;
  domain: string;
  decision_type: string;
  signature_text: string;
  solution_text: string;
  quality_score: number;
  freshness_date: number;
}

/**
 * Load all cases for brute-force semantic recall + ranking. V1 decodes every
 * stored embedding per query (no HNSW locally) — fine while the library is
 * small; the Supabase/pgvector port (M3) replaces this with an index query.
 */
export async function listCasesForRecall(): Promise<CaseRecallRow[]> {
  const db = await getDb();
  const rows = await db.select<RawRecallRow[]>(
    `SELECT id, problem_emb, domain, decision_type, signature_text,
            solution_text, quality_score, freshness_date
     FROM abstracted_cases`,
  );
  return rows.map((r) => ({
    id: r.id,
    problemEmb: base64ToEmbedding(r.problem_emb),
    domain: r.domain,
    decisionType: r.decision_type,
    signatureText: r.signature_text,
    solutionText: r.solution_text,
    qualityScore: r.quality_score,
    freshnessDate: r.freshness_date,
  }));
}

export interface FtsHit {
  caseId: string;
  /** FTS5 bm25 rank (more negative = better match). */
  bm25: number;
}

/** Escape a string into an FTS5 string literal (double-quote, double internal quotes). */
function ftsLiteral(raw: string): string {
  return `"${raw.replace(/"/g, '""')}"`;
}

/**
 * Keyword recall via the FTS5 trigram mirror (Postgres FTS-GIN equivalent).
 * Returns the matching case ids with their bm25 rank; the caller normalises
 * to a 0–1 keyword similarity. Returns [] on no match (or an FTS syntax edge).
 */
export async function ftsRecall(query: string, limit = 30): Promise<FtsHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const db = await getDb();
  try {
    const rows = await db.select<Array<{ case_id: string; bm25: number }>>(
      `SELECT case_id, rank AS bm25
       FROM abstracted_cases_fts
       WHERE abstracted_cases_fts MATCH $1
       ORDER BY rank
       LIMIT $2`,
      [ftsLiteral(trimmed), limit],
    );
    return rows.map((r) => ({ caseId: r.case_id, bm25: r.bm25 }));
  } catch {
    // A short query (< 3 chars for trigram) or odd token can throw a no-match
    // FTS error — treat as "no keyword hits" rather than failing retrieval.
    return [];
  }
}

// Re-export the validator so callers can build relations with a single import.
export { CaseRelationSchema };

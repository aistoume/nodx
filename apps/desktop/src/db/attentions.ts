/**
 * Attention Inbox — CRUD over the `attentions` table (migration v11).
 *
 * Rows arrive from two paths:
 *   - Deep link nodx://capture?... (from Chrome Lens / macOS Lens) →
 *     parsed in Rust → invoked by frontend listener → upsertCaptured(...)
 *   - Manual paste inside nodx (future) → createAttention(...)
 *
 * "Promote to topic" hands off to topics.ts; we just stamp
 * promoted_to_topic_id back on the attention row so the inbox can dim it.
 */

import {
  AttentionSchema,
  type Attention,
  type AttentionKind,
  type AttentionSource,
} from '@nodx/models';
import { getDb } from './client.js';

interface AttentionRow {
  id: string;
  text: string;
  explanation: string | null;
  source_url: string;
  source_title: string;
  source_kind: string;
  kind: string;
  tags_json: string;
  promoted_to_topic_id: string | null;
  captured_at: number;
  ingested_at: number;
}

const SELECT_COLUMNS =
  'id, text, explanation, source_url, source_title, source_kind, kind, tags_json, promoted_to_topic_id, captured_at, ingested_at';

function rowToAttention(r: AttentionRow): Attention {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(r.tags_json);
    if (Array.isArray(parsed)) tags = parsed.filter((x) => typeof x === 'string');
  } catch {
    /* corrupted row — treat as no tags */
  }
  return AttentionSchema.parse({
    id: r.id,
    text: r.text,
    ...(r.explanation != null ? { explanation: r.explanation } : {}),
    sourceUrl: r.source_url,
    sourceTitle: r.source_title,
    sourceKind: r.source_kind,
    kind: r.kind,
    tags,
    ...(r.promoted_to_topic_id != null
      ? { promotedToTopicId: r.promoted_to_topic_id }
      : {}),
    capturedAt: r.captured_at,
    ingestedAt: r.ingested_at,
  });
}

// ============================================================================
// Read
// ============================================================================

export interface AttentionFilter {
  /** Hide rows that have been promoted to a topic already. */
  hidePromoted?: boolean;
  /** Substring matched (case-insensitive) against text + explanation. */
  search?: string;
  /** Restrict to specific source clients. */
  sourceKinds?: AttentionSource[];
  /** Pagination. */
  limit?: number;
  offset?: number;
}

export async function listAttentions(
  filter: AttentionFilter = {},
): Promise<Attention[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.hidePromoted) {
    where.push('promoted_to_topic_id IS NULL');
  }

  if (filter.search && filter.search.trim()) {
    where.push('(text LIKE ? OR explanation LIKE ?)');
    const q = `%${filter.search.trim()}%`;
    params.push(q, q);
  }

  if (filter.sourceKinds && filter.sourceKinds.length > 0) {
    where.push(
      `source_kind IN (${filter.sourceKinds.map(() => '?').join(',')})`,
    );
    params.push(...filter.sourceKinds);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
  const offset = Math.max(filter.offset ?? 0, 0);

  const rows = await db.select<AttentionRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM attentions
     ${whereSql}
     ORDER BY ingested_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return rows.map(rowToAttention);
}

export async function getAttention(id: string): Promise<Attention | null> {
  const db = await getDb();
  const rows = await db.select<AttentionRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM attentions WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows.length > 0 ? rowToAttention(rows[0]!) : null;
}

export async function countAttentions(
  filter: AttentionFilter = {},
): Promise<number> {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.hidePromoted) where.push('promoted_to_topic_id IS NULL');
  if (filter.sourceKinds && filter.sourceKinds.length > 0) {
    where.push(
      `source_kind IN (${filter.sourceKinds.map(() => '?').join(',')})`,
    );
    params.push(...filter.sourceKinds);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM attentions ${whereSql}`,
    params,
  );
  return rows[0]?.n ?? 0;
}

// ============================================================================
// Write
// ============================================================================

export interface CreateAttentionInput {
  /** If provided, used verbatim (so deep-link captures can preserve Lens's id). */
  id?: string;
  text: string;
  explanation?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceKind: AttentionSource;
  kind: AttentionKind;
  tags?: string[];
  capturedAt?: number;
}

export async function createAttention(
  input: CreateAttentionInput,
): Promise<Attention> {
  const db = await getDb();
  const now = Date.now();
  const id = input.id ?? crypto.randomUUID();

  await db.execute(
    `INSERT INTO attentions (
       id, text, explanation, source_url, source_title,
       source_kind, kind, tags_json, promoted_to_topic_id,
       captured_at, ingested_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      id,
      input.text,
      input.explanation ?? null,
      input.sourceUrl ?? '',
      input.sourceTitle ?? '',
      input.sourceKind,
      input.kind,
      JSON.stringify(input.tags ?? []),
      input.capturedAt ?? now,
      now,
    ],
  );

  const created = await getAttention(id);
  if (!created) throw new Error(`createAttention: row ${id} not found after insert`);
  return created;
}

/**
 * Idempotent capture: if an attention with the same id already exists,
 * leave it alone. This lets us retry deep-link processing without dups.
 */
export async function upsertCaptured(
  input: CreateAttentionInput & { id: string },
): Promise<Attention> {
  const existing = await getAttention(input.id);
  if (existing) return existing;
  return createAttention(input);
}

export async function updateTags(id: string, tags: string[]): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE attentions SET tags_json = ? WHERE id = ?', [
    JSON.stringify(tags),
    id,
  ]);
}

export async function setExplanation(
  id: string,
  explanation: string,
): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE attentions SET explanation = ? WHERE id = ?', [
    explanation,
    id,
  ]);
}

export async function markPromoted(
  attentionId: string,
  topicId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE attentions SET promoted_to_topic_id = ? WHERE id = ?',
    [topicId, attentionId],
  );
}

export async function deleteAttention(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM attentions WHERE id = ?', [id]);
}

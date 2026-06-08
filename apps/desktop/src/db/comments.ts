import {
  CommentSchema,
  type AtomicData,
  type Comment,
  type CommentType,
  type OpenQuestionData,
} from '@nodx/models';
import { getDb } from './client.js';
import { recomputeHasOpenQuestions } from './topics.js';

interface CommentRow {
  id: string;
  topic_id: string;
  anchor_id: string | null;
  type: string;
  content: string;
  atomic_data_json: string | null;
  open_question_data_json: string | null;
  created_at: number;
}

const SELECT_COLUMNS =
  'id, topic_id, anchor_id, type, content, atomic_data_json, open_question_data_json, created_at';

function rowToComment(r: CommentRow): Comment {
  const atomicData =
    r.atomic_data_json != null
      ? (JSON.parse(r.atomic_data_json) as AtomicData)
      : undefined;
  const openQuestionData =
    r.open_question_data_json != null
      ? (JSON.parse(r.open_question_data_json) as OpenQuestionData)
      : undefined;
  return CommentSchema.parse({
    id: r.id,
    topicId: r.topic_id,
    anchorId: r.anchor_id,
    type: r.type,
    content: r.content,
    ...(atomicData ? { atomicData } : {}),
    ...(openQuestionData ? { openQuestionData } : {}),
    createdAt: r.created_at,
  });
}

export async function listComments(topicId: string): Promise<Comment[]> {
  const db = await getDb();
  const rows = await db.select<CommentRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM comments WHERE topic_id = $1 ORDER BY created_at DESC`,
    [topicId],
  );
  return rows.map(rowToComment);
}

export interface CreateCommentInput {
  topicId: string;
  anchorId: string | null;
  type: CommentType;
  content: string;
  atomicData?: AtomicData;
  openQuestionData?: OpenQuestionData;
}

export async function createComment(
  input: CreateCommentInput,
): Promise<Comment> {
  const comment: Comment = CommentSchema.parse({
    id: crypto.randomUUID(),
    topicId: input.topicId,
    anchorId: input.anchorId,
    type: input.type,
    content: input.content,
    ...(input.atomicData ? { atomicData: input.atomicData } : {}),
    ...(input.openQuestionData
      ? { openQuestionData: input.openQuestionData }
      : {}),
    createdAt: Date.now(),
  });

  const db = await getDb();
  await db.execute(
    `INSERT INTO comments (id, topic_id, anchor_id, type, content, atomic_data_json, open_question_data_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      comment.id,
      comment.topicId,
      comment.anchorId,
      comment.type,
      comment.content,
      comment.atomicData ? JSON.stringify(comment.atomicData) : null,
      comment.openQuestionData
        ? JSON.stringify(comment.openQuestionData)
        : null,
      comment.createdAt,
    ],
  );

  if (comment.type === 'open_question') {
    await recomputeHasOpenQuestions(comment.topicId);
  }
  return comment;
}

/** Convenience for a 卡点 (PRD §3.12). */
export async function createOpenQuestion(input: {
  topicId: string;
  anchorId: string | null;
  question: string;
  blockedReason?: string;
}): Promise<Comment> {
  return createComment({
    topicId: input.topicId,
    anchorId: input.anchorId,
    type: 'open_question',
    content: input.question,
    openQuestionData: {
      question: input.question,
      ...(input.blockedReason ? { blockedReason: input.blockedReason } : {}),
    },
  });
}

export async function deleteComment(id: string): Promise<void> {
  const db = await getDb();
  // Capture topic before delete so we can recompute the open-question flag.
  const rows = await db.select<Array<{ topic_id: string; type: string }>>(
    'SELECT topic_id, type FROM comments WHERE id = $1',
    [id],
  );
  await db.execute('DELETE FROM comments WHERE id = $1', [id]);
  const r = rows[0];
  if (r?.type === 'open_question') {
    await recomputeHasOpenQuestions(r.topic_id);
  }
}

/** Mark a 卡点 resolved (sets resolvedAt in its JSON) + recompute the flag. */
export async function resolveOpenQuestion(id: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<
    Array<{ topic_id: string; open_question_data_json: string | null }>
  >(
    'SELECT topic_id, open_question_data_json FROM comments WHERE id = $1',
    [id],
  );
  const r = rows[0];
  if (!r || r.open_question_data_json == null) return;
  const data = JSON.parse(r.open_question_data_json) as OpenQuestionData;
  data.resolvedAt = Date.now();
  await db.execute(
    'UPDATE comments SET open_question_data_json = $1 WHERE id = $2',
    [JSON.stringify(data), id],
  );
  await recomputeHasOpenQuestions(r.topic_id);
}

/** Unresolved 卡点 for one topic. */
export async function listOpenQuestions(topicId: string): Promise<Comment[]> {
  const db = await getDb();
  const rows = await db.select<CommentRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM comments
     WHERE topic_id = $1 AND type = 'open_question'
       AND json_extract(open_question_data_json, '$.resolvedAt') IS NULL
     ORDER BY created_at DESC`,
    [topicId],
  );
  return rows.map(rowToComment);
}

export interface OpenQuestionRef {
  comment: Comment;
  topicTitle: string;
}

/** Global unresolved-卡点 list (Header badge + dropdown), with topic titles. */
export async function listAllOpenQuestions(): Promise<OpenQuestionRef[]> {
  const db = await getDb();
  const rows = await db.select<Array<CommentRow & { topic_title: string }>>(
    `SELECT c.id, c.topic_id, c.anchor_id, c.type, c.content,
            c.atomic_data_json, c.open_question_data_json, c.created_at,
            t.title AS topic_title
     FROM comments c JOIN topics t ON t.id = c.topic_id
     WHERE c.type = 'open_question'
       AND json_extract(c.open_question_data_json, '$.resolvedAt') IS NULL
     ORDER BY c.created_at DESC`,
  );
  return rows.map((r) => ({
    comment: rowToComment(r),
    topicTitle: r.topic_title,
  }));
}

/**
 * Convention used for selection-anchored comments (note, explanation):
 * the selected quote and the body share the same `content` column rather
 * than adding a dedicated migration. Format:
 *
 *     > {quote}
 *
 *     {body}
 *
 * Falls back gracefully when the format isn't matched (returns the whole
 * string as body, no quote).
 */
export function formatQuotedContent(quote: string, body: string): string {
  return `> ${quote.trim()}\n\n${body.trim()}`;
}

export function parseQuotedContent(
  content: string,
): { quote: string | null; body: string } {
  const m = content.match(/^>\s+([\s\S]+?)\n\n([\s\S]+)$/);
  if (!m) return { quote: null, body: content.trim() };
  return { quote: m[1]!.trim(), body: m[2]!.trim() };
}

// Back-compat aliases — older imports still work.
export const formatExplanationContent = formatQuotedContent;
export const parseExplanationContent = parseQuotedContent;

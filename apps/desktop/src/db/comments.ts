import {
  CommentSchema,
  type AtomicData,
  type Comment,
  type CommentType,
} from '@nodx/models';
import { getDb } from './client.js';

interface CommentRow {
  id: string;
  topic_id: string;
  anchor_id: string | null;
  type: string;
  content: string;
  atomic_data_json: string | null;
  created_at: number;
}

const SELECT_COLUMNS =
  'id, topic_id, anchor_id, type, content, atomic_data_json, created_at';

function rowToComment(r: CommentRow): Comment {
  const atomicData =
    r.atomic_data_json != null
      ? (JSON.parse(r.atomic_data_json) as AtomicData)
      : undefined;
  return CommentSchema.parse({
    id: r.id,
    topicId: r.topic_id,
    anchorId: r.anchor_id,
    type: r.type,
    content: r.content,
    ...(atomicData ? { atomicData } : {}),
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
    createdAt: Date.now(),
  });

  const db = await getDb();
  await db.execute(
    `INSERT INTO comments (id, topic_id, anchor_id, type, content, atomic_data_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      comment.id,
      comment.topicId,
      comment.anchorId,
      comment.type,
      comment.content,
      comment.atomicData ? JSON.stringify(comment.atomicData) : null,
      comment.createdAt,
    ],
  );

  return comment;
}

export async function deleteComment(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM comments WHERE id = $1', [id]);
}

/**
 * Convention used for type='explanation' comments — the selected quote and
 * the AI's explanation share the same `content` column rather than adding a
 * dedicated migration. Format:
 *
 *     > {quote}
 *
 *     {explanation}
 */
export function formatExplanationContent(
  quote: string,
  explanation: string,
): string {
  return `> ${quote.trim()}\n\n${explanation.trim()}`;
}

export function parseExplanationContent(
  content: string,
): { quote: string | null; body: string } {
  const m = content.match(/^>\s+([\s\S]+?)\n\n([\s\S]+)$/);
  if (!m) return { quote: null, body: content.trim() };
  return { quote: m[1]!.trim(), body: m[2]!.trim() };
}

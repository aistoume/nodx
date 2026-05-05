import {
  TopicSchema,
  TopicStatusSchema,
  type Topic,
  type TopicStatus,
} from '@nodx/models';
import { getDb } from './client.js';

interface TopicRow {
  id: string;
  parent_id: string | null;
  title: string;
  status: string;
  is_pinned: number;
  created_at: number;
  updated_at: number;
  message_count: number;
  child_count: number;
  last_activity: number;
  ai_summary: string | null;
}

const SELECT_COLUMNS =
  'id, parent_id, title, status, is_pinned, created_at, updated_at, message_count, child_count, last_activity, ai_summary';

function rowToTopic(r: TopicRow): Topic {
  return TopicSchema.parse({
    id: r.id,
    parentId: r.parent_id,
    title: r.title,
    status: r.status,
    isPinned: r.is_pinned === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    meta: {
      messageCount: r.message_count,
      childCount: r.child_count,
      lastActivity: r.last_activity,
    },
    ...(r.ai_summary != null ? { aiSummary: r.ai_summary } : {}),
  });
}

export async function listTopics(): Promise<Topic[]> {
  const db = await getDb();
  const rows = await db.select<TopicRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM topics ORDER BY created_at DESC`,
  );
  return rows.map(rowToTopic);
}

export interface CreateTopicInput {
  title: string;
  status?: TopicStatus;
  parentId?: string | null;
}

/**
 * Insert a new Topic. The row is validated through TopicSchema before INSERT,
 * so SQL CHECK constraints should never trip in practice — they exist as a
 * second line of defence in case data lands via another path (sync, import).
 */
export async function createTopic(input: CreateTopicInput): Promise<Topic> {
  const now = Date.now();
  const topic: Topic = TopicSchema.parse({
    id: crypto.randomUUID(),
    parentId: input.parentId ?? null,
    title: input.title.trim(),
    status: input.status ?? 'exploring',
    isPinned: false,
    createdAt: now,
    updatedAt: now,
    meta: { messageCount: 0, childCount: 0, lastActivity: now },
  });

  const db = await getDb();
  await db.execute(
    `INSERT INTO topics (id, parent_id, title, status, is_pinned, created_at, updated_at, message_count, child_count, last_activity, ai_summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      topic.id,
      topic.parentId,
      topic.title,
      topic.status,
      topic.isPinned ? 1 : 0,
      topic.createdAt,
      topic.updatedAt,
      topic.meta.messageCount,
      topic.meta.childCount,
      topic.meta.lastActivity,
      topic.aiSummary ?? null,
    ],
  );

  return topic;
}

export const ALL_TOPIC_STATUSES = TopicStatusSchema.options;

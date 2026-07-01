import {
  TopicSchema,
  TopicStatusSchema,
  type Topic,
  type TopicNodeKind,
  type TopicStatus,
} from '@nodx/models';
import { getDb } from './client.js';

interface TopicRow {
  id: string;
  parent_id: string | null;
  title: string;
  status: string;
  is_pinned: number;
  is_archived: number;
  created_at: number;
  updated_at: number;
  message_count: number;
  child_count: number;
  last_activity: number;
  ai_summary: string | null;
  reasoning_trace: string | null;
  has_open_questions: number;
  generated_by_auto_recursion_run_id: string | null;
  auto_recursion_depth: number | null;
  parent_next_move_plan_id: string | null;
  node_kind: string | null;
}

const SELECT_COLUMNS =
  'id, parent_id, title, status, is_pinned, is_archived, created_at, updated_at, message_count, child_count, last_activity, ai_summary, reasoning_trace, has_open_questions, generated_by_auto_recursion_run_id, auto_recursion_depth, parent_next_move_plan_id, node_kind';

function rowToTopic(r: TopicRow): Topic {
  return TopicSchema.parse({
    id: r.id,
    parentId: r.parent_id,
    title: r.title,
    status: r.status,
    isPinned: r.is_pinned === 1,
    isArchived: r.is_archived === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    meta: {
      messageCount: r.message_count,
      childCount: r.child_count,
      lastActivity: r.last_activity,
    },
    ...(r.ai_summary != null ? { aiSummary: r.ai_summary } : {}),
    ...(r.reasoning_trace != null ? { reasoningTrace: r.reasoning_trace } : {}),
    hasOpenQuestions: r.has_open_questions === 1,
    ...(r.generated_by_auto_recursion_run_id != null
      ? { generatedByAutoRecursionRunId: r.generated_by_auto_recursion_run_id }
      : {}),
    ...(r.auto_recursion_depth != null
      ? { autoRecursionDepth: r.auto_recursion_depth }
      : {}),
    ...(r.parent_next_move_plan_id != null
      ? { parentNextMovePlanId: r.parent_next_move_plan_id }
      : {}),
    nodeKind: r.node_kind === 'execution' ? 'execution' : 'thinking',
  });
}

export interface ListTopicsOptions {
  /** Default: false — keeps the main list lean. */
  includeArchived?: boolean;
}

export async function listTopics(
  opts: ListTopicsOptions = {},
): Promise<Topic[]> {
  const where = opts.includeArchived ? '' : 'WHERE is_archived = 0';
  const db = await getDb();
  const rows = await db.select<TopicRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM topics ${where} ORDER BY last_activity DESC, created_at DESC`,
  );
  return rows.map(rowToTopic);
}

export async function listArchivedTopics(): Promise<Topic[]> {
  const db = await getDb();
  const rows = await db.select<TopicRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM topics WHERE is_archived = 1 ORDER BY updated_at DESC`,
  );
  return rows.map(rowToTopic);
}

export interface CreateTopicInput {
  title: string;
  status?: TopicStatus;
  parentId?: string | null;
  /** 'thinking' (default) or 'execution' (a split-out action plan). */
  nodeKind?: TopicNodeKind;
}

export async function createTopic(input: CreateTopicInput): Promise<Topic> {
  const now = Date.now();
  const topic: Topic = TopicSchema.parse({
    id: crypto.randomUUID(),
    parentId: input.parentId ?? null,
    title: input.title.trim(),
    status: input.status ?? 'exploring',
    isPinned: false,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    meta: { messageCount: 0, childCount: 0, lastActivity: now },
    nodeKind: input.nodeKind ?? 'thinking',
  });

  const db = await getDb();
  await db.execute(
    `INSERT INTO topics (id, parent_id, title, status, is_pinned, created_at, updated_at, message_count, child_count, last_activity, ai_summary, node_kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
      topic.nodeKind,
    ],
  );

  // Bump parent's child_count + last_activity. Done in client code rather
  // than a SQL trigger so we keep migrations minimal until M3.
  if (topic.parentId) {
    await db.execute(
      `UPDATE topics
       SET child_count = child_count + 1,
           last_activity = $1,
           updated_at = $1
       WHERE id = $2`,
      [topic.createdAt, topic.parentId],
    );
  }

  return topic;
}

/** Flip a topic between 思考 / 执行 node kinds. */
export async function setTopicNodeKind(
  id: string,
  nodeKind: TopicNodeKind,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE topics SET node_kind = $1, updated_at = $2 WHERE id = $3',
    [nodeKind, Date.now(), id],
  );
}

/** Persist the AI-maintained reasoning path (思路复现 core, PRD §8.8). */
export async function setReasoningTrace(
  id: string,
  trace: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE topics SET reasoning_trace = $1, updated_at = $2 WHERE id = $3',
    [trace, Date.now(), id],
  );
}

/**
 * Append one line to the reasoning trace without clobbering what the 思路复现
 * maintainer has written. Used by 自动递进 to leave a per-layer PM record on
 * the node (PRD §3.19 改进: 卡点前的推理不丢失).
 */
export async function appendReasoningTrace(
  id: string,
  line: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE topics
     SET reasoning_trace = CASE
           WHEN reasoning_trace IS NULL OR reasoning_trace = '' THEN $1
           ELSE reasoning_trace || char(10) || $1
         END,
         updated_at = $2
     WHERE id = $3`,
    [line, Date.now(), id],
  );
}

/**
 * Recompute `has_open_questions` from the comments table: 1 iff the topic has
 * at least one unresolved open_question (卡点). Call after a 卡点 is created or
 * resolved.
 */
export async function recomputeHasOpenQuestions(
  topicId: string,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<Array<{ n: number }>>(
    `SELECT count(*) AS n FROM comments
     WHERE topic_id = $1 AND type = 'open_question'
       AND (open_question_data_json IS NULL
            OR json_extract(open_question_data_json, '$.resolvedAt') IS NULL)`,
    [topicId],
  );
  const has = (rows[0]?.n ?? 0) > 0;
  await db.execute('UPDATE topics SET has_open_questions = $1 WHERE id = $2', [
    has ? 1 : 0,
    topicId,
  ]);
  return has;
}

export async function archiveTopic(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE topics SET is_archived = 1, updated_at = $1 WHERE id = $2',
    [Date.now(), id],
  );
}

export async function unarchiveTopic(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE topics SET is_archived = 0, updated_at = $1 WHERE id = $2',
    [Date.now(), id],
  );
}

/**
 * Hard delete. Cascades to messages / comments / draft_items via the FK
 * relationships defined in migrations v1.
 */
export async function deleteTopic(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM topics WHERE id = $1', [id]);
}

export const ALL_TOPIC_STATUSES = TopicStatusSchema.options;

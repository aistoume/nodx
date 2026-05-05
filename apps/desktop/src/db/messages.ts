import { MessageSchema, type Message } from '@nodx/models';
import { getDb } from './client.js';

interface MessageRow {
  id: string;
  topic_id: string;
  role: string;
  type: string;
  content: string;
  anchors_json: string;
  mentions_json: string;
  created_at: number;
}

const SELECT_COLUMNS =
  'id, topic_id, role, type, content, anchors_json, mentions_json, created_at';

function rowToMessage(r: MessageRow): Message {
  const anchors = JSON.parse(r.anchors_json) as string[];
  const mentions = JSON.parse(r.mentions_json) as string[];
  return MessageSchema.parse({
    id: r.id,
    topicId: r.topic_id,
    role: r.role,
    type: r.type,
    content: r.content,
    ...(anchors.length > 0 ? { anchors } : {}),
    ...(mentions.length > 0 ? { mentions } : {}),
    createdAt: r.created_at,
  });
}

export async function listMessages(topicId: string): Promise<Message[]> {
  const db = await getDb();
  const rows = await db.select<MessageRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM messages WHERE topic_id = $1 ORDER BY created_at ASC`,
    [topicId],
  );
  return rows.map(rowToMessage);
}

/**
 * Insert a user-typed text message. The AFTER INSERT trigger on `messages`
 * (migration v2) bumps topics.message_count / last_activity / updated_at,
 * so the caller doesn't have to.
 */
export async function createUserMessage(
  topicId: string,
  content: string,
): Promise<Message> {
  return insertMessage(topicId, 'user', 'text', content);
}

/** Insert an AI-authored reply. Same trigger semantics as createUserMessage. */
export async function createAiMessage(
  topicId: string,
  content: string,
): Promise<Message> {
  return insertMessage(topicId, 'ai', 'text', content);
}

async function insertMessage(
  topicId: string,
  role: 'user' | 'ai',
  type: 'text' | 'survey' | 'factor_list' | 'explanation',
  content: string,
): Promise<Message> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('message content is empty');
  const message: Message = MessageSchema.parse({
    id: crypto.randomUUID(),
    topicId,
    role,
    type,
    content: trimmed,
    createdAt: Date.now(),
  });

  const db = await getDb();
  await db.execute(
    `INSERT INTO messages (id, topic_id, role, type, content, anchors_json, mentions_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      message.id,
      message.topicId,
      message.role,
      message.type,
      message.content,
      '[]',
      '[]',
      message.createdAt,
    ],
  );

  return message;
}

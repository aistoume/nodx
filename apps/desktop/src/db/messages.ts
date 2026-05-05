import { MessageSchema, type Message } from '@nodx/models';
import type {
  DecomposedFactor,
  SurveyFactor,
} from '@nodx/ai';
import { getDb } from './client.js';

/**
 * Payload stored in Message.content for type='survey'.
 * `selectedIds` is null until the user clicks "继续" — once set, the card
 * renders in read-only mode.
 */
export interface SurveyMessageContent {
  factors: SurveyFactor[];
  selectedIds: string[] | null;
}

/** Payload stored in Message.content for type='factor_list'. */
export interface FactorListMessageContent {
  selectedFactorTitles: string[];
  factors: DecomposedFactor[];
  /** Map of "{factorIdx}_{questionIdx}" → spawned child topic id. */
  spawned: Record<string, string>;
}

export function parseSurveyContent(raw: string): SurveyMessageContent {
  return JSON.parse(raw) as SurveyMessageContent;
}

export function parseFactorListContent(raw: string): FactorListMessageContent {
  return JSON.parse(raw) as FactorListMessageContent;
}

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

/**
 * Insert a Survey card as a Message. The card lives inline in the conversation
 * so users can scroll back and see what they picked.
 */
export async function createSurveyMessage(
  topicId: string,
  factors: SurveyFactor[],
): Promise<Message> {
  const payload: SurveyMessageContent = { factors, selectedIds: null };
  return insertMessage(topicId, 'ai', 'survey', JSON.stringify(payload));
}

/** Insert the decomposed factor list (essence + sub-questions, PRD §7.2). */
export async function createFactorListMessage(
  topicId: string,
  selectedFactorTitles: string[],
  factors: DecomposedFactor[],
): Promise<Message> {
  const payload: FactorListMessageContent = {
    selectedFactorTitles,
    factors,
    spawned: {},
  };
  return insertMessage(topicId, 'ai', 'factor_list', JSON.stringify(payload));
}

/**
 * Replace a message's `content`. Used to mark a Survey as picked or to record
 * the spawned child-topic id on a factor_list. Doesn't touch the AFTER INSERT
 * trigger because we're updating, not inserting.
 */
export async function updateMessageContent(
  id: string,
  content: string,
): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE messages SET content = $1 WHERE id = $2', [
    content,
    id,
  ]);
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

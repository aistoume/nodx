import { ThinkingSessionSchema, type ThinkingSession } from '@nodx/models';
import { getDb } from './client.js';

// ──────────────────────────────────────────────────────────────────────
// ThinkingSession persistence (PRD §3.13 / §8.8, migration v8).
//
// Lifecycle (lazy, no live timer): a session is OPEN while `ai_recap IS NULL`.
// `ensureActiveSession` reuses the latest open session if it was active within
// the idle window, else starts a new one. Sessions that go idle past the
// window are finalised lazily (`listStaleSessions` → AI recap/trace →
// `finalizeSession`) — typically on the next time the topic is opened.
// ──────────────────────────────────────────────────────────────────────

/** Idle gap that ends a session (PRD §8.8 — "连续 10min 无输入"). */
export const SESSION_IDLE_MS = 10 * 60 * 1000;

interface SessionRow {
  id: string;
  topic_id: string;
  started_at: number;
  ended_at: number;
  message_count: number;
  ai_recap: string | null;
}

const COLS = 'id, topic_id, started_at, ended_at, message_count, ai_recap';

function rowToSession(r: SessionRow): ThinkingSession {
  return ThinkingSessionSchema.parse({
    id: r.id,
    topicId: r.topic_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    messageCount: r.message_count,
    ...(r.ai_recap != null ? { aiRecap: r.ai_recap } : {}),
  });
}

/**
 * Return the active session id for a topic — reuse the latest open session if
 * it was active within the idle window, otherwise start a new one. Called from
 * message insertion so callers never deal with sessions directly.
 */
export async function ensureActiveSession(topicId: string): Promise<string> {
  const now = Date.now();
  const db = await getDb();
  const rows = await db.select<SessionRow[]>(
    `SELECT ${COLS} FROM thinking_sessions
     WHERE topic_id = $1 AND ai_recap IS NULL
     ORDER BY started_at DESC LIMIT 1`,
    [topicId],
  );
  const open = rows[0];
  if (open && now - open.ended_at <= SESSION_IDLE_MS) return open.id;

  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO thinking_sessions (id, topic_id, started_at, ended_at, message_count)
     VALUES ($1, $2, $3, $3, 0)`,
    [id, topicId, now],
  );
  return id;
}

/** Bump a session's last-activity time + message count (after a message lands). */
export async function bumpSession(
  sessionId: string,
  now = Date.now(),
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE thinking_sessions
     SET ended_at = $1, message_count = message_count + 1
     WHERE id = $2`,
    [now, sessionId],
  );
}

/**
 * Open sessions with messages that have gone idle past the window — ready to
 * be closed (recap + trace) by the replay layer.
 */
export async function listStaleSessions(
  topicId: string,
): Promise<ThinkingSession[]> {
  const db = await getDb();
  const cutoff = Date.now() - SESSION_IDLE_MS;
  const rows = await db.select<SessionRow[]>(
    `SELECT ${COLS} FROM thinking_sessions
     WHERE topic_id = $1 AND ai_recap IS NULL AND message_count > 0 AND ended_at < $2
     ORDER BY started_at ASC`,
    [topicId, cutoff],
  );
  return rows.map(rowToSession);
}

/** Close a session by writing its AI recap (open → closed). */
export async function finalizeSession(
  sessionId: string,
  aiRecap: string,
): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE thinking_sessions SET ai_recap = $1 WHERE id = $2', [
    aiRecap,
    sessionId,
  ]);
}

/** All sessions for a topic, newest first (for the replay-card input). */
export async function listSessions(
  topicId: string,
): Promise<ThinkingSession[]> {
  const db = await getDb();
  const rows = await db.select<SessionRow[]>(
    `SELECT ${COLS} FROM thinking_sessions WHERE topic_id = $1 ORDER BY started_at DESC`,
    [topicId],
  );
  return rows.map(rowToSession);
}

import {
  TopicDocumentSchema,
  type TopicDocument,
} from '@nodx/models';
import { getDb } from './client.js';

interface DocumentRow {
  topic_id: string;
  content: string;
  format: string;
  updated_at: number;
}

function rowToDocument(r: DocumentRow): TopicDocument {
  return TopicDocumentSchema.parse({
    topicId: r.topic_id,
    content: r.content,
    format: r.format,
    updatedAt: r.updated_at,
  });
}

export async function getDocument(
  topicId: string,
): Promise<TopicDocument | null> {
  const db = await getDb();
  const rows = await db.select<DocumentRow[]>(
    'SELECT topic_id, content, format, updated_at FROM topic_documents WHERE topic_id = $1',
    [topicId],
  );
  const row = rows[0];
  return row ? rowToDocument(row) : null;
}

/**
 * INSERT-OR-REPLACE so callers don't need to track existence. Kept as a
 * single statement (not BEGIN/COMMIT) because plugin-sql exposes one
 * statement per execute and INSERT OR REPLACE is atomic on its own.
 */
export async function upsertDocument(
  topicId: string,
  content: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO topic_documents (topic_id, content, format, updated_at)
     VALUES ($1, $2, 'html', $3)
     ON CONFLICT(topic_id) DO UPDATE SET
       content = excluded.content,
       updated_at = excluded.updated_at`,
    [topicId, content, Date.now()],
  );
}

export async function deleteDocument(topicId: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM topic_documents WHERE topic_id = $1', [
    topicId,
  ]);
}

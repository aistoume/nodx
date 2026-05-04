import { useEffect, useState } from 'react';
import { TopicSchema, type Topic } from '@nodx/models';
import { getDb } from './db/client.js';

type DbStatus =
  | { kind: 'loading' }
  | { kind: 'ready'; topics: Topic[] }
  | { kind: 'error'; message: string };

export function App() {
  const [status, setStatus] = useState<DbStatus>({ kind: 'loading' });

  useEffect(() => {
    void (async () => {
      try {
        const db = await getDb();
        const rows = await db.select<unknown[]>(
          'SELECT id, parent_id, title, status, is_pinned, created_at, updated_at, message_count, child_count, last_activity, ai_summary FROM topics ORDER BY created_at DESC',
        );
        const topics = rows.map((row) =>
          TopicSchema.parse(rowToTopic(row as TopicRow)),
        );
        setStatus({ kind: 'ready', topics });
      } catch (err) {
        setStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, []);

  return (
    <main style={styles.main}>
      <h1 style={styles.h1}>nodx</h1>
      <p style={styles.subtitle}>M1 Week 1 — desktop shell + SQLite plumbing</p>
      <section style={styles.section}>
        <h2 style={styles.h2}>topics</h2>
        {status.kind === 'loading' && <p>loading…</p>}
        {status.kind === 'error' && (
          <pre style={styles.error}>db error: {status.message}</pre>
        )}
        {status.kind === 'ready' && status.topics.length === 0 && (
          <p style={styles.empty}>
            no topics yet — schema is live, models validate, ready to wire UI
          </p>
        )}
        {status.kind === 'ready' && status.topics.length > 0 && (
          <ul>
            {status.topics.map((t) => (
              <li key={t.id}>
                <strong>{t.title}</strong> — {t.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

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

function rowToTopic(r: TopicRow): unknown {
  return {
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
  };
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    padding: '32px 40px',
    maxWidth: 880,
    margin: '0 auto',
    color: '#1a1a1a',
  },
  h1: { fontSize: 32, marginBottom: 4 },
  subtitle: { color: '#666', marginTop: 0, marginBottom: 28 },
  section: {
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    padding: '16px 20px',
  },
  h2: { fontSize: 16, marginTop: 0, marginBottom: 12, color: '#444' },
  empty: { color: '#888', fontStyle: 'italic' },
  error: {
    color: '#b00020',
    background: '#fff4f4',
    padding: 12,
    borderRadius: 4,
    whiteSpace: 'pre-wrap',
  },
};

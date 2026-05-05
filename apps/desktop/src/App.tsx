import { useCallback, useEffect, useState } from 'react';
import type { Topic, TopicStatus } from '@nodx/models';
import {
  ALL_TOPIC_STATUSES,
  createTopic,
  listTopics,
} from './db/topics.js';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; topics: Topic[] }
  | { kind: 'error'; message: string };

export function App() {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<TopicStatus>('exploring');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const topics = await listTopics();
      setLoad({ kind: 'ready', topics });
    } catch (err) {
      setLoad({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError('title is required');
      return;
    }
    setSubmitting(true);
    try {
      await createTopic({ title, status });
      setTitle('');
      setStatus('exploring');
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={styles.main}>
      <h1 style={styles.h1}>nodx</h1>
      <p style={styles.subtitle}>M1 Week 2 — topic create / list</p>

      <section style={styles.section}>
        <h2 style={styles.h2}>create topic</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="问题（=对话标题）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={styles.input}
            disabled={submitting}
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TopicStatus)}
            style={styles.select}
            disabled={submitting}
          >
            {ALL_TOPIC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="submit" disabled={submitting} style={styles.button}>
            {submitting ? '创建中…' : '+ 新建'}
          </button>
        </form>
        {formError && <p style={styles.error}>{formError}</p>}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>topics</h2>
        {load.kind === 'loading' && <p>loading…</p>}
        {load.kind === 'error' && (
          <pre style={styles.errorPre}>db error: {load.message}</pre>
        )}
        {load.kind === 'ready' && load.topics.length === 0 && (
          <p style={styles.empty}>
            no topics yet — schema is live, models validate, ready to wire UI
          </p>
        )}
        {load.kind === 'ready' && load.topics.length > 0 && (
          <ul style={styles.list}>
            {load.topics.map((t) => (
              <li key={t.id} style={styles.listItem}>
                <div style={styles.itemTitle}>{t.title}</div>
                <div style={styles.itemMeta}>
                  <span style={styles.statusBadge(t.status)}>{t.status}</span>
                  <span style={styles.meta}>
                    {new Date(t.createdAt).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const STATUS_COLORS: Record<TopicStatus, string> = {
  exploring: '#3b82f6',
  summarized: '#22c55e',
  atomic: '#a855f7',
  ghost: '#9ca3af',
};

const styles = {
  main: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    padding: '32px 40px',
    maxWidth: 880,
    margin: '0 auto',
    color: '#1a1a1a',
  } as React.CSSProperties,
  h1: { fontSize: 32, marginBottom: 4 } as React.CSSProperties,
  subtitle: { color: '#666', marginTop: 0, marginBottom: 28 } as React.CSSProperties,
  section: {
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    padding: '16px 20px',
    marginBottom: 16,
    background: '#fff',
  } as React.CSSProperties,
  h2: {
    fontSize: 14,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginTop: 0,
    marginBottom: 12,
    color: '#666',
  } as React.CSSProperties,
  form: { display: 'flex', gap: 8, alignItems: 'stretch' } as React.CSSProperties,
  input: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid #d4d4d4',
    borderRadius: 6,
    fontSize: 14,
    fontFamily: 'inherit',
  } as React.CSSProperties,
  select: {
    padding: '8px 12px',
    border: '1px solid #d4d4d4',
    borderRadius: 6,
    fontSize: 14,
    fontFamily: 'inherit',
    background: '#fff',
  } as React.CSSProperties,
  button: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    background: '#1a1a1a',
    color: '#fff',
    cursor: 'pointer',
  } as React.CSSProperties,
  error: {
    color: '#b00020',
    marginTop: 8,
    marginBottom: 0,
    fontSize: 13,
  } as React.CSSProperties,
  errorPre: {
    color: '#b00020',
    background: '#fff4f4',
    padding: 12,
    borderRadius: 4,
    whiteSpace: 'pre-wrap' as const,
  } as React.CSSProperties,
  empty: { color: '#888', fontStyle: 'italic' as const } as React.CSSProperties,
  list: { listStyle: 'none', padding: 0, margin: 0 } as React.CSSProperties,
  listItem: {
    padding: '12px 0',
    borderBottom: '1px solid #f0f0f0',
  } as React.CSSProperties,
  itemTitle: { fontSize: 15, fontWeight: 500 } as React.CSSProperties,
  itemMeta: {
    marginTop: 4,
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    fontSize: 12,
  } as React.CSSProperties,
  meta: { color: '#999' } as React.CSSProperties,
  statusBadge: (s: TopicStatus): React.CSSProperties => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    background: STATUS_COLORS[s] + '20',
    color: STATUS_COLORS[s],
    fontWeight: 500,
    fontSize: 11,
  }),
};

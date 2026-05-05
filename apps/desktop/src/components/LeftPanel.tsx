import { useState } from 'react';
import type { Topic, TopicStatus } from '@nodx/models';
import { ALL_TOPIC_STATUSES, createTopic } from '../db/topics.js';

interface LeftPanelProps {
  topics: Topic[];
  loading: boolean;
  loadError: string | null;
  selectedTopicId: string | null;
  onSelectTopic: (id: string) => void;
  onCreated: () => void;
}

export function LeftPanel({
  topics,
  loading,
  loadError,
  selectedTopicId,
  onSelectTopic,
  onCreated,
}: LeftPanelProps) {
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<TopicStatus>('exploring');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError('请输入对话标题');
      return;
    }
    setSubmitting(true);
    try {
      await createTopic({ title, status });
      setTitle('');
      setStatus('exploring');
      onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside className="border-r border-border bg-surface overflow-y-auto p-4 flex flex-col gap-4">
      <SectionTitle>新建</SectionTitle>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input
          type="text"
          placeholder="问题或决策标题…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={submitting}
          className="px-3 py-2 text-sm border border-border rounded-md bg-canvas focus:outline-none focus:border-accent focus:bg-surface transition"
        />
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TopicStatus)}
            disabled={submitting}
            className="flex-1 px-2 py-1.5 text-xs border border-border rounded-md bg-surface"
          >
            {ALL_TOPIC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 transition"
          >
            {submitting ? '…' : '+ 新建'}
          </button>
        </div>
        {formError && <p className="text-xs text-red-600">{formError}</p>}
      </form>

      <div className="border-t border-border -mx-4" />

      <SectionTitle>对话列表 ({topics.length})</SectionTitle>
      {loading && <p className="text-xs text-ink-muted">loading…</p>}
      {loadError && (
        <pre className="text-xs text-red-600 bg-red-50 p-2 rounded whitespace-pre-wrap">
          {loadError}
        </pre>
      )}
      {!loading && !loadError && topics.length === 0 && (
        <p className="text-xs text-ink-muted italic">
          还没有对话。先建一个吧。
        </p>
      )}
      <ul className="flex flex-col gap-0.5">
        {topics.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelectTopic(t.id)}
              className={
                'w-full text-left px-2.5 py-2 rounded-md text-sm transition ' +
                (t.id === selectedTopicId
                  ? 'bg-accent-tint text-accent font-medium'
                  : 'hover:bg-canvas text-ink')
              }
            >
              <div className="truncate">{t.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                <StatusBadge status={t.status} />
                <span className="text-ink-muted">
                  {t.meta.messageCount} msg
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] uppercase tracking-wider text-ink-muted font-medium">
      {children}
    </h3>
  );
}

const STATUS_STYLES: Record<TopicStatus, string> = {
  exploring: 'bg-blue-100 text-blue-700',
  summarized: 'bg-green-100 text-green-700',
  atomic: 'bg-purple-100 text-purple-700',
  ghost: 'bg-gray-100 text-gray-500',
};

function StatusBadge({ status }: { status: TopicStatus }) {
  return (
    <span
      className={
        'inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ' +
        STATUS_STYLES[status]
      }
    >
      {status}
    </span>
  );
}

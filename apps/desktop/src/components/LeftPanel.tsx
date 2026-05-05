import { useEffect, useRef, useState } from 'react';
import type { Topic, TopicStatus } from '@nodx/models';
import {
  ALL_TOPIC_STATUSES,
  archiveTopic,
  createTopic,
  deleteTopic,
  unarchiveTopic,
} from '../db/topics.js';

interface LeftPanelProps {
  topics: Topic[];
  archivedTopics: Topic[];
  loading: boolean;
  loadError: string | null;
  selectedTopicId: string | null;
  onSelectTopic: (id: string | null) => void;
  onMutated: () => void;
}

export function LeftPanel({
  topics,
  archivedTopics,
  loading,
  loadError,
  selectedTopicId,
  onSelectTopic,
  onMutated,
}: LeftPanelProps) {
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<TopicStatus>('exploring');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError('请输入对话标题');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createTopic({ title, status });
      setTitle('');
      setStatus('exploring');
      // Auto-select so CenterPanel can auto-fire Survey on the new topic.
      onSelectTopic(created.id);
      onMutated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
      onMutated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleArchive = (id: string) =>
    runAction(async () => {
      await archiveTopic(id);
      if (id === selectedTopicId) onSelectTopic(null);
    });

  const handleUnarchive = (id: string) =>
    runAction(async () => {
      await unarchiveTopic(id);
    });

  const handleDelete = (id: string) =>
    runAction(async () => {
      await deleteTopic(id);
      if (id === selectedTopicId) onSelectTopic(null);
    });

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

      {actionError && (
        <pre className="text-xs text-red-600 bg-red-50 p-2 rounded whitespace-pre-wrap">
          {actionError}
        </pre>
      )}

      <div className="border-t border-border -mx-4" />

      <SectionTitle>对话列表 ({topics.length})</SectionTitle>
      {loading && <p className="text-xs text-ink-muted">loading…</p>}
      {loadError && (
        <pre className="text-xs text-red-600 bg-red-50 p-2 rounded whitespace-pre-wrap">
          {loadError}
        </pre>
      )}
      {!loading && !loadError && topics.length === 0 && (
        <p className="text-xs text-ink-muted italic">还没有对话。先建一个吧。</p>
      )}
      <ul className="flex flex-col gap-0.5">
        {topics.map((t) => (
          <TopicRow
            key={t.id}
            topic={t}
            selected={t.id === selectedTopicId}
            onSelect={() => onSelectTopic(t.id)}
            onArchive={() => handleArchive(t.id)}
            onDelete={() => handleDelete(t.id)}
          />
        ))}
      </ul>

      {archivedTopics.length > 0 && (
        <>
          <div className="border-t border-border -mx-4" />
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center justify-between text-[11px] uppercase tracking-wider text-ink-muted font-medium hover:text-ink transition"
          >
            <span>已归档 ({archivedTopics.length})</span>
            <span className="text-sm">{showArchived ? '−' : '+'}</span>
          </button>
          {showArchived && (
            <ul className="flex flex-col gap-0.5 opacity-70">
              {archivedTopics.map((t) => (
                <ArchivedRow
                  key={t.id}
                  topic={t}
                  onUnarchive={() => handleUnarchive(t.id)}
                  onDelete={() => handleDelete(t.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}

function TopicRow({
  topic,
  selected,
  onSelect,
  onArchive,
  onDelete,
}: {
  topic: Topic;
  selected: boolean;
  onSelect: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group relative rounded-md hover:bg-canvas">
      <button
        type="button"
        onClick={onSelect}
        className={
          'w-full text-left px-2.5 py-2 pr-20 rounded-md text-sm transition ' +
          (selected ? 'bg-accent-tint text-accent font-medium' : 'text-ink')
        }
      >
        <div className="truncate">{topic.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px]">
          <StatusBadge status={topic.status} />
          <span className={selected ? 'text-accent/70' : 'text-ink-muted'}>
            {topic.meta.messageCount} 条
          </span>
        </div>
      </button>
      <div className="absolute right-1 top-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
        <PrimaryAction
          label="归档"
          title="归档（隐藏到底部抽屉）"
          onClick={onArchive}
        />
        <DeleteAction onConfirm={onDelete} />
      </div>
    </li>
  );
}

function ArchivedRow({
  topic,
  onUnarchive,
  onDelete,
}: {
  topic: Topic;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group relative rounded-md hover:bg-canvas px-2.5 py-1.5 text-xs flex items-center justify-between">
      <span className="truncate">{topic.title}</span>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition shrink-0 ml-2">
        <PrimaryAction label="恢复" title="移回主列表" onClick={onUnarchive} />
        <DeleteAction onConfirm={onDelete} />
      </div>
    </li>
  );
}

function PrimaryAction({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="px-1.5 py-0.5 text-[10px] rounded font-medium transition text-ink-muted hover:bg-surface hover:text-ink border border-border"
    >
      {label}
    </button>
  );
}

/**
 * Two-step delete: first click stages, second click within 3s commits.
 * Avoids window.confirm() because the Tauri 2 webview's behaviour for it
 * is unreliable on macOS, and a noisy native dialog isn't great UX anyway.
 */
function DeleteAction({ onConfirm }: { onConfirm: () => void }) {
  const [pending, setPending] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pending) {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      setPending(false);
      onConfirm();
    } else {
      setPending(true);
      timerRef.current = window.setTimeout(() => {
        setPending(false);
        timerRef.current = null;
      }, 3000);
    }
  };

  return (
    <button
      type="button"
      title={pending ? '再点一次确认删除' : '删除（不可撤销）'}
      onClick={handleClick}
      className={
        'px-1.5 py-0.5 text-[10px] rounded font-medium transition border ' +
        (pending
          ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
          : 'text-red-600 border-red-200 hover:bg-red-50')
      }
    >
      {pending ? '确认删除' : '删除'}
    </button>
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

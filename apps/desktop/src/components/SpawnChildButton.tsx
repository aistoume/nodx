import { useState } from 'react';
import { createTopic } from '../db/topics.js';

interface SpawnChildButtonProps {
  parentTopicId: string;
  onCreated: (childTopicId: string) => void;
  disabled?: boolean;
}

/**
 * Inline "派生子话题" button. Click expands into a small title input;
 * Enter creates a child topic with parentId = parentTopicId and calls
 * onCreated with the new id (caller usually navigates there). Esc cancels.
 */
export function SpawnChildButton({
  parentTopicId,
  onCreated,
  disabled,
}: SpawnChildButtonProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setTitle('');
    setError(null);
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const child = await createTopic({
        title: trimmed,
        parentId: parentTopicId,
      });
      close();
      onCreated(child.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="self-start text-xs text-ink-muted hover:text-accent transition disabled:opacity-50 inline-flex items-center gap-1"
        title="基于这个话题派生一个更深入的子话题"
      >
        <span className="text-[14px] leading-none">↳</span>
        <span>派生子话题</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-canvas border border-border rounded-md px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-ink-muted shrink-0">
        子话题
      </span>
      <input
        autoFocus
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        }}
        disabled={submitting}
        placeholder="深入哪个角度？"
        maxLength={80}
        className="flex-1 min-w-0 px-2 py-1 text-sm border border-transparent rounded focus:outline-none focus:border-accent bg-surface"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!title.trim() || submitting}
        className="px-2.5 py-1 text-xs font-medium rounded bg-accent text-white hover:opacity-90 disabled:opacity-40 transition shrink-0"
      >
        {submitting ? '创建中…' : '创建'}
      </button>
      <button
        type="button"
        onClick={close}
        disabled={submitting}
        className="text-xs text-ink-muted hover:text-ink shrink-0"
      >
        取消
      </button>
      {error && (
        <span className="text-xs text-red-600 shrink-0 ml-1" title={error}>
          失败
        </span>
      )}
    </div>
  );
}

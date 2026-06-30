/**
 * TopicTabsBar — ComfyUI-style horizontal tab strip showing the currently
 * "open" topics. Sits directly below Header.
 *
 * Behaviour mirrors a code editor's tab bar:
 *   - Each tab shows topic title + small status dot
 *   - Active tab is highlighted
 *   - × button closes the tab (does NOT delete the topic)
 *   - + button opens a picker with two flows:
 *       (a) "+ 新建话题…" — inline input, Enter creates + opens
 *       (b) Pick from existing active topics
 *   - Selecting a topic via LeftPanel adds it to this strip and marks it active
 *
 * State is owned by App.tsx (openTopicIds[], activeTopicId) so refreshing
 * topics doesn't drop the strip. localStorage persists across reloads.
 */

import { useEffect, useRef, useState } from 'react';
import type { Topic, TopicStatus } from '@nodx/models';

const STATUS_DOT: Record<TopicStatus, string> = {
  exploring: 'bg-blue-400',
  summarized: 'bg-purple-400',
  atomic: 'bg-emerald-400',
  ghost: 'bg-zinc-500',
};

interface Props {
  topics: Topic[];
  openTopicIds: string[];
  activeTopicId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  /** Add an existing topic to the tab strip (used by the picker list). */
  onOpenPicker: (id: string) => void;
  /**
   * Create a brand-new topic with the given title. App.tsx wraps
   * createTopic + openTopicInTab; here we just call and trust the parent
   * to handle errors.
   */
  onCreate: (title: string) => Promise<void>;
}

export function TopicTabsBar({
  topics,
  openTopicIds,
  activeTopicId,
  onSelect,
  onClose,
  onOpenPicker,
  onCreate,
}: Props) {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const openTopics = openTopicIds
    .map((id) => byId.get(id))
    .filter((t): t is Topic => !!t);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setCreating(false);
        setNewTitle('');
        setCreateError(null);
      }
    };
    window.addEventListener('mousedown', onDoc);
    return () => window.removeEventListener('mousedown', onDoc);
  }, [pickerOpen]);

  // Auto-focus the input when entering "create" mode.
  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const availableForPicker = topics.filter(
    (t) => !openTopicIds.includes(t.id) && !t.isArchived,
  );

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) {
      setCreateError('请先填写标题');
      return;
    }
    setSubmitting(true);
    setCreateError(null);
    try {
      await onCreate(title);
      // Reset UI state on success
      setNewTitle('');
      setCreating(false);
      setPickerOpen(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-9 bg-canvas border-b border-border flex items-stretch shrink-0 overflow-hidden">
      <div className="flex items-stretch overflow-x-auto scrollbar-thin">
        {openTopics.length === 0 && (
          <div className="px-4 flex items-center text-xs text-ink-muted italic">
            从左栏选一个话题，或点 + 打开
          </div>
        )}
        {openTopics.map((t) => {
          const active = t.id === activeTopicId;
          return (
            <div
              key={t.id}
              className={
                'group flex items-center gap-1.5 pl-3 pr-1.5 border-r border-border ' +
                'text-xs transition-colors cursor-pointer max-w-[200px] ' +
                (active
                  ? 'bg-surface text-ink border-t-2 border-t-accent -mt-px'
                  : 'text-ink-muted hover:bg-surface/50 hover:text-ink')
              }
              onClick={() => onSelect(t.id)}
              title={t.title}
            >
              <span
                className={'w-1.5 h-1.5 rounded-full ' + STATUS_DOT[t.status]}
              />
              <span className="truncate flex-1 min-w-0">{t.title}</span>
              <button
                type="button"
                className={
                  'w-5 h-5 flex items-center justify-center rounded ' +
                  'hover:bg-canvas hover:text-ink transition ' +
                  (active ? 'opacity-70' : 'opacity-0 group-hover:opacity-100')
                }
                title="关闭"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* + picker */}
      <div ref={pickerRef} className="relative flex items-stretch">
        <button
          type="button"
          className="px-3 text-ink-muted hover:bg-surface hover:text-ink text-base"
          title="新建或打开话题"
          onClick={() => {
            setPickerOpen((v) => !v);
            setCreating(false);
            setCreateError(null);
          }}
        >
          +
        </button>
        {pickerOpen && (
          <div className="absolute top-full left-0 mt-1 w-80 bg-surface border border-border rounded-md shadow-lg z-30 max-h-[420px] overflow-hidden flex flex-col">
            {/* ── Section 1: 新建话题 ─────────────────────────── */}
            <div className="border-b border-border">
              {creating ? (
                <div className="p-3 bg-canvas">
                  <label className="block text-[10px] uppercase tracking-wide text-ink-muted mb-1.5">
                    新话题标题
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={newTitle}
                    placeholder="问题或决策标题…"
                    disabled={submitting}
                    onChange={(e) => {
                      setNewTitle(e.currentTarget.value);
                      if (createError) setCreateError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleCreate();
                      } else if (e.key === 'Escape') {
                        setCreating(false);
                        setNewTitle('');
                        setCreateError(null);
                      }
                    }}
                    className="w-full px-2.5 py-1.5 text-sm border border-border rounded-md bg-surface focus:outline-none focus:border-accent"
                  />
                  {createError && (
                    <p className="text-[11px] text-red-600 mt-1.5">{createError}</p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleCreate()}
                      className="px-3 py-1 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {submitting ? '创建中…' : '✓ 创建并打开'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        setNewTitle('');
                        setCreateError(null);
                      }}
                      className="px-3 py-1 text-xs text-ink-muted hover:text-ink"
                    >
                      取消
                    </button>
                    <span className="ml-auto self-center text-[10px] text-ink-muted">
                      Enter 提交 · Esc 取消
                    </span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 hover:bg-canvas text-accent font-medium"
                >
                  <span className="text-base leading-none">+</span>
                  <span>新建话题…</span>
                </button>
              )}
            </div>

            {/* ── Section 2: 添加已有 ─────────────────────────── */}
            <div className="overflow-y-auto flex-1">
              <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-ink-muted border-b border-border bg-canvas/50">
                或添加已有话题
              </div>
              {availableForPicker.length === 0 ? (
                <div className="px-3 py-4 text-xs text-ink-muted italic text-center">
                  所有活跃话题都已在 tab 中
                </div>
              ) : (
                availableForPicker.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-canvas"
                    onClick={() => {
                      onOpenPicker(t.id);
                      setPickerOpen(false);
                    }}
                  >
                    <span
                      className={
                        'w-1.5 h-1.5 rounded-full ' + STATUS_DOT[t.status]
                      }
                    />
                    <span className="truncate flex-1">{t.title}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Topic, TopicStatus } from '@nodx/models';
import {
  ALL_TOPIC_STATUSES,
  archiveTopic,
  createTopic,
  deleteTopic,
  unarchiveTopic,
} from '../db/topics.js';
import { importTopicBundle } from '../db/bundle.js';
import { openBundleFile } from '../lib/bundle-file.js';
import { useT, type StringKey } from '../i18n/index.js';

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
  const { t } = useT();
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<TopicStatus>('exploring');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const handleImport = async () => {
    setImportMsg(null);
    const file = await openBundleFile();
    if (!file) return;
    setImporting(true);
    try {
      const res = await importTopicBundle(file.text);
      setImportMsg(`✓ ${res.topicCount}`);
      onSelectTopic(res.rootTopicId);
      onMutated();
      window.setTimeout(() => setImportMsg(null), 3000);
    } catch (err) {
      setImportMsg(`${t('common.error')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError(t('tabs.picker.needTitle'));
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
      <SectionTitle>{t('left.section.new')}</SectionTitle>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input
          type="text"
          placeholder={t('left.newTopic.placeholder')}
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
            {submitting ? t('left.newTopic.submitting') : t('left.newTopic.submit')}
          </button>
        </div>
        {formError && <p className="text-xs text-red-600">{formError}</p>}
      </form>

      <button
        type="button"
        onClick={handleImport}
        disabled={importing}
        title={t('left.import')}
        className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-ink-muted hover:border-accent hover:text-accent disabled:opacity-50 transition"
      >
        {importing ? t('left.importing') : t('left.import')}
      </button>
      {importMsg && <p className="text-xs text-accent">{importMsg}</p>}

      {actionError && (
        <pre className="text-xs text-red-600 bg-red-50 p-2 rounded whitespace-pre-wrap">
          {actionError}
        </pre>
      )}

      <div className="border-t border-border -mx-4" />

      <SectionTitle>{t('left.section.list', { count: topics.length })}</SectionTitle>
      {loading && <p className="text-xs text-ink-muted">{t('left.loading')}</p>}
      {loadError && (
        <pre className="text-xs text-red-600 bg-red-50 p-2 rounded whitespace-pre-wrap">
          {loadError}
        </pre>
      )}
      {!loading && !loadError && topics.length === 0 && (
        <p className="text-xs text-ink-muted italic">{t('left.empty')}</p>
      )}
      <TopicTree
        topics={topics}
        selectedTopicId={selectedTopicId}
        onSelect={onSelectTopic}
        onArchive={handleArchive}
        onDelete={handleDelete}
      />

      {archivedTopics.length > 0 && (
        <>
          <div className="border-t border-border -mx-4" />
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center justify-between text-[11px] uppercase tracking-wider text-ink-muted font-medium hover:text-ink transition"
          >
            <span>{t('left.section.archived', { count: archivedTopics.length })}</span>
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

/* ── Tree ────────────────────────────────────────────── */

interface TreeNode {
  topic: Topic;
  depth: number;
  children: TreeNode[];
}

function buildTopicTree(topics: Topic[]): TreeNode[] {
  // Topics whose parentId points outside the active list (parent archived /
  // deleted) are hoisted to top-level so they don't disappear from the UI.
  const validIds = new Set(topics.map((t) => t.id));
  const byParent = new Map<string | null, Topic[]>();
  for (const t of topics) {
    const effective =
      t.parentId && validIds.has(t.parentId) ? t.parentId : null;
    const list = byParent.get(effective) ?? [];
    list.push(t);
    byParent.set(effective, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => b.meta.lastActivity - a.meta.lastActivity);
  }
  function buildLevel(
    parentId: string | null,
    depth: number,
  ): TreeNode[] {
    return (byParent.get(parentId) ?? []).map((t) => ({
      topic: t,
      depth,
      children: buildLevel(t.id, depth + 1),
    }));
  }
  return buildLevel(null, 0);
}

function TopicTree({
  topics,
  selectedTopicId,
  onSelect,
  onArchive,
  onDelete,
}: {
  topics: Topic[];
  selectedTopicId: string | null;
  onSelect: (id: string) => void;
  onArchive: (id: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  useT(); // subscribe so localised inner labels re-render on switch
  const tree = useMemo(() => buildTopicTree(topics), [topics]);

  // child id → effective parent id (parent must still be in the active list).
  const parentOf = useMemo(() => {
    const validIds = new Set(topics.map((t) => t.id));
    const m = new Map<string, string>();
    for (const t of topics) {
      if (t.parentId && validIds.has(t.parentId)) m.set(t.id, t.parentId);
    }
    return m;
  }, [topics]);

  // The set of topics that actually have children (i.e. are collapsible).
  const collapsibleIds = useMemo(
    () => new Set(parentOf.values()),
    [parentOf],
  );

  // Collapsed parents. Default: everything expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Keep a selected topic visible: expand all of its ancestors.
  useEffect(() => {
    if (!selectedTopicId) return;
    setCollapsed((prev) => {
      if (prev.size === 0) return prev;
      const ancestors: string[] = [];
      let cur = selectedTopicId;
      while (parentOf.has(cur)) {
        cur = parentOf.get(cur)!;
        ancestors.push(cur);
      }
      if (!ancestors.some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of ancestors) next.delete(id);
      return next;
    });
  }, [selectedTopicId, parentOf]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allCollapsed =
    collapsibleIds.size > 0 &&
    [...collapsibleIds].every((id) => collapsed.has(id));

  return (
    <div className="flex flex-col gap-0.5">
      {collapsibleIds.size > 0 && (
        <button
          type="button"
          onClick={() =>
            setCollapsed(allCollapsed ? new Set() : new Set(collapsibleIds))
          }
          className="self-end text-[10px] text-ink-muted hover:text-accent transition mb-0.5"
        >
          {allCollapsed ? '＋' : '－'}
        </button>
      )}
      <ul className="flex flex-col gap-0.5">
        {tree.map((n) => (
          <TopicTreeNode
            key={n.topic.id}
            node={n}
            collapsed={collapsed}
            onToggle={toggle}
            selectedTopicId={selectedTopicId}
            onSelect={onSelect}
            onArchive={onArchive}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  );
}

function TopicTreeNode({
  node,
  collapsed,
  onToggle,
  selectedTopicId,
  onSelect,
  onArchive,
  onDelete,
}: {
  node: TreeNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  selectedTopicId: string | null;
  onSelect: (id: string) => void;
  onArchive: (id: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.topic.id);
  return (
    <>
      <TopicRow
        topic={node.topic}
        depth={node.depth}
        hasChildren={hasChildren}
        collapsed={isCollapsed}
        onToggle={() => onToggle(node.topic.id)}
        selected={node.topic.id === selectedTopicId}
        onSelect={() => onSelect(node.topic.id)}
        onArchive={() => onArchive(node.topic.id)}
        onDelete={() => onDelete(node.topic.id)}
      />
      {hasChildren &&
        !isCollapsed &&
        node.children.map((child) => (
          <TopicTreeNode
            key={child.topic.id}
            node={child}
            collapsed={collapsed}
            onToggle={onToggle}
            selectedTopicId={selectedTopicId}
            onSelect={onSelect}
            onArchive={onArchive}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}

function TopicRow({
  topic,
  depth,
  hasChildren,
  collapsed,
  onToggle,
  selected,
  onSelect,
  onArchive,
  onDelete,
}: {
  topic: Topic;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  // Indent per nesting level. The chevron (or leaf marker) lives in its own
  // 16px column so the toggle is a real sibling button, not nested inside the
  // row's select button.
  const isChild = depth > 0;
  const indent = depth * 14;
  return (
    <li
      className={
        'group relative rounded-md ' +
        (selected ? 'bg-accent-tint' : 'hover:bg-canvas')
      }
    >
      {isChild && (
        <span
          aria-hidden
          className="absolute top-0 bottom-0 w-px bg-border/70"
          style={{ left: indent + 4 }}
        />
      )}
      <div className="flex items-stretch">
        <span style={{ width: indent }} className="shrink-0" aria-hidden />
        <div className="w-5 shrink-0 flex items-center justify-center">
          {hasChildren ? (
            <button
              type="button"
              title={collapsed ? /*i18n*/ 'Expand' : /*i18n*/ 'Collapse'}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className={
                'w-5 h-6 flex items-center justify-center rounded hover:bg-border/60 hover:text-accent transition ' +
                (selected ? 'text-accent' : 'text-ink-muted/70')
              }
            >
              <ChevronIcon collapsed={collapsed} />
            </button>
          ) : isChild ? (
            <span
              aria-hidden
              className={
                'w-1 h-1 rounded-full ' +
                (selected ? 'bg-accent/60' : 'bg-ink-muted/30')
              }
            />
          ) : null}
        </div>
        <button
          type="button"
          onClick={onSelect}
          className={
            'flex-1 min-w-0 text-left py-1.5 pr-20 pl-1.5 rounded-md text-[13px] leading-tight transition flex flex-col gap-1 ' +
            (selected ? 'text-accent font-medium' : 'text-ink')
          }
        >
          <span className="truncate">{topic.title}</span>
          <div className="flex items-center gap-1.5 text-[10px] leading-none">
            <StatusBadge status={topic.status} />
            <span className={selected ? 'text-accent/60' : 'text-ink-muted/80'}>
              {topic.meta.messageCount}
              <span className="opacity-60"> {/*i18n*/ 'msg'}</span>
            </span>
            {topic.meta.childCount > 0 && (
              <span
                className={
                  (selected ? 'text-accent/60' : 'text-ink-muted/80') +
                  (collapsed ? ' font-medium' : '')
                }
                title={`${topic.meta.childCount}${collapsed ? ' · collapsed' : ''}`}
              >
                {topic.meta.childCount}
                <span className="opacity-60"> {/*i18n*/ 'sub'}</span>
              </span>
            )}
          </div>
        </button>
      </div>
      <div className="absolute right-1 top-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
        <PrimaryAction
          label="⊘"
          title="Archive"
          onClick={onArchive}
        />
        <DeleteAction onConfirm={onDelete} />
      </div>
    </li>
  );
}

/**
 * Crisp collapse/expand chevron. Replaces the Unicode ▸/▾ characters which
 * rendered with inconsistent baselines and made the topic-tree rows feel
 * misaligned. SVG width/height are fixed, stroke-linecap round for softness.
 */
function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
        transition: 'transform 140ms ease',
      }}
      aria-hidden
    >
      <path d="M3 1.5 L7 5 L3 8.5" />
    </svg>
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
        <PrimaryAction label="↺" title="Restore" onClick={onUnarchive} />
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
      title={pending ? 'Click again to confirm' : 'Delete (irreversible)'}
      onClick={handleClick}
      className={
        'px-1.5 py-0.5 text-[10px] rounded font-medium transition border ' +
        (pending
          ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
          : 'text-red-600 border-red-200 hover:bg-red-50')
      }
    >
      {pending ? '✓' : '×'}
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

/**
 * Compact status indicator: a coloured dot + short label (localised).
 * The old badge showed the full English word ("exploring") which took ~60px
 * per row and made the meta-line feel loose. This variant is 22-28px and
 * still readable at a glance thanks to the colour code.
 */
const STATUS_DOT: Record<TopicStatus, string> = {
  exploring: 'bg-blue-400',
  summarized: 'bg-emerald-400',
  atomic: 'bg-violet-500',
  ghost: 'bg-zinc-400',
};

const STATUS_SHORT_KEY: Record<TopicStatus, StringKey> = {
  exploring: 'left.status.exploring',
  summarized: 'left.status.summarized',
  atomic: 'left.status.atomic',
  ghost: 'left.status.ghost',
};

const STATUS_FULL_KEY: Record<TopicStatus, StringKey> = {
  exploring: 'left.status.exploring.full',
  summarized: 'left.status.summarized.full',
  atomic: 'left.status.atomic.full',
  ghost: 'left.status.ghost.full',
};

function StatusBadge({ status }: { status: TopicStatus }) {
  const { t } = useT();
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] leading-none text-ink-muted"
      title={t(STATUS_FULL_KEY[status])}
    >
      <span className={'w-1.5 h-1.5 rounded-full ' + STATUS_DOT[status]} />
      <span>{t(STATUS_SHORT_KEY[status])}</span>
    </span>
  );
}

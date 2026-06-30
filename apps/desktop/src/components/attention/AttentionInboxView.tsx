/**
 * 灵感池 (InspirationPool) — the "💡 灵感池" view.
 *
 * The visual surface for everything captured from outside nodx — Chrome
 * Lens snippets, macOS Lens captures, manual pastes. Internally still
 * called "attentions" in the data model (Attention type, attentions table)
 * because that's the technical concept (the "attention token" PRD §3.x).
 * 灵感池 is the user-facing name: a pool of raw thinking material that
 * waits to be promoted into proper Topics.
 *
 * Lists all entries grouped by time, filterable by source / tags / search.
 * Each card supports:
 *   - ✨ AI 解释   — let Haiku gloss a bare snippet
 *   - 🎯 升级为话题 — create a Topic from this snippet (kicks off Survey)
 *   - ✏️ 改解释 / 🏷 标签 / 🗑 删除
 *
 * Deep-link captures arrive via the App-level listener on 'nodx://capture'
 * events; this component just re-queries when `refreshTick` changes.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Attention, AttentionSource } from '@nodx/models';
import {
  deleteAttention,
  listAttentions,
  setExplanation,
  updateTags,
} from '../../db/attentions.js';
import { explainSelection } from '../../ai/explain.js';

interface Props {
  /** Bumped by parent whenever a new capture arrives, to force a re-query. */
  refreshTick: number;
  /** Hand back to App so it can create a Topic + flip view. */
  onPromote: (attention: Attention) => void;
}

const SOURCE_CHIPS: Array<{ key: AttentionSource; label: string; emoji: string }> = [
  { key: 'lens-chrome', label: 'Lens (Chrome)', emoji: '🌐' },
  { key: 'lens-mac', label: 'Lens (Mac)', emoji: '🍎' },
  { key: 'manual', label: '手动粘贴', emoji: '✍️' },
];

export function AttentionInboxView({ refreshTick, onPromote }: Props) {
  const [items, setItems] = useState<Attention[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [hidePromoted, setHidePromoted] = useState(true);
  const [selectedSources, setSelectedSources] = useState<Set<AttentionSource>>(
    new Set(['lens-chrome', 'lens-mac', 'manual']),
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const list = await listAttentions({
          hidePromoted,
          search: search.trim() || undefined,
          sourceKinds: Array.from(selectedSources),
        });
        if (!cancelled) setItems(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick, search, hidePromoted, selectedSources]);

  const groups = useMemo(() => groupByTime(items), [items]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-border bg-surface flex items-center gap-3 flex-wrap">
        <div className="font-bold text-lg">💡 灵感池</div>
        <div className="text-xs text-ink-muted ml-2">
          {items.length > 0 && <>共 {items.length} 条灵感</>}
        </div>
        <input
          type="search"
          placeholder="搜索文本 / 解释…"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          className="ml-auto px-3 py-1.5 text-sm rounded-md border border-border bg-canvas focus:outline-none focus:border-accent w-56"
        />
        <label className="flex items-center gap-1 text-xs text-ink-muted cursor-pointer">
          <input
            type="checkbox"
            checked={hidePromoted}
            onChange={(e) => setHidePromoted(e.currentTarget.checked)}
          />
          隐藏已升级的
        </label>
      </div>

      {/* Source chips */}
      <div className="px-6 py-2 border-b border-border flex items-center gap-2 text-xs">
        <span className="text-ink-muted mr-1">来源:</span>
        {SOURCE_CHIPS.map((chip) => {
          const active = selectedSources.has(chip.key);
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                const next = new Set(selectedSources);
                if (active) next.delete(chip.key);
                else next.add(chip.key);
                if (next.size === 0) next.add(chip.key); // never empty
                setSelectedSources(next);
              }}
              className={
                'px-2.5 py-1 rounded-full border transition ' +
                (active
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface text-ink-muted border-border hover:border-accent')
              }
            >
              {chip.emoji} {chip.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && items.length === 0 ? (
          <div className="text-center text-ink-muted text-sm py-10">加载中…</div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          groups.map(({ label, rows }) => (
            <div key={label} className="mb-6">
              <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
                {label}
              </div>
              <div className="space-y-3">
                {rows.map((a) => (
                  <AttentionCard
                    key={a.id}
                    attention={a}
                    onChanged={() => {
                      // soft refresh via state update — call list again
                      void (async () => {
                        const list = await listAttentions({
                          hidePromoted,
                          search: search.trim() || undefined,
                          sourceKinds: Array.from(selectedSources),
                        });
                        setItems(list);
                      })();
                    }}
                    onPromote={() => onPromote(a)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center text-ink-muted py-12 max-w-md mx-auto">
      <div className="text-4xl mb-3">💡</div>
      <div className="font-semibold mb-2">灵感池还空着</div>
      <div className="text-sm leading-relaxed">
        在浏览器里用 nodx Lens 划词 → 点 <strong>🔍 解释</strong> 或 <strong>💾 收</strong>，
        这里会自动出现新条目。
        <br />
        每条灵感都是"思考的原料"，可以一键升级为话题，进入 nodx 的完整思考流程。
      </div>
    </div>
  );
}

interface CardProps {
  attention: Attention;
  onChanged: () => void;
  onPromote: () => void;
}

function AttentionCard({ attention, onChanged, onPromote }: CardProps) {
  const [editingTags, setEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState(attention.tags.join(', '));
  const [editingExpl, setEditingExpl] = useState(false);
  const [explInput, setExplInput] = useState(attention.explanation ?? '');
  const [hovering, setHovering] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const promoted = !!attention.promotedToTopicId;

  const askAiExplain = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      // Pass sourceTitle as context so the model knows roughly where the
      // snippet came from (helps disambiguate jargon between domains).
      const r = await explainSelection(
        attention.text,
        attention.sourceTitle || undefined,
      );
      await setExplanation(attention.id, r.explanation);
      onChanged();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiLoading(false);
    }
  };

  const hostname = attention.sourceUrl
    ? safeHostname(attention.sourceUrl)
    : null;
  const faviconUrl = hostname
    ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
    : null;

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={
        'group border rounded-xl bg-surface px-5 py-4 transition-all ' +
        (promoted
          ? 'opacity-50 border-border'
          : 'border-border hover:border-accent/60 hover:shadow-sm')
      }
    >
      {/* ── Header: favicon + title + chips ─────────────────────── */}
      <div className="flex items-start gap-3 mb-3">
        {faviconUrl ? (
          <img
            src={faviconUrl}
            alt=""
            width={16}
            height={16}
            className="mt-1 rounded-sm flex-shrink-0"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span className="mt-1 text-sm">✍️</span>
        )}
        <div className="flex-1 min-w-0">
          {/* Title: prefer sourceTitle, fall back to hostname */}
          {attention.sourceUrl ? (
            <a
              href={attention.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={attention.sourceUrl}
              className="text-sm font-semibold text-ink hover:text-accent truncate block leading-tight"
            >
              {attention.sourceTitle || hostname || '(无标题)'}
            </a>
          ) : (
            <div className="text-sm font-semibold text-ink truncate leading-tight">
              {attention.sourceTitle || '(手动录入)'}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[11px] text-ink-muted mt-0.5">
            {hostname && <span className="truncate">{hostname}</span>}
            {hostname && <span>·</span>}
            <span>{formatRelative(attention.capturedAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {attention.kind === 'quick' && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
              title="未调用 AI · 直接收藏"
            >
              裸卡
            </span>
          )}
          {promoted && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
              已升级
            </span>
          )}
        </div>
      </div>

      {/* ── Snippet ─────────────────────────────────────────────── */}
      <blockquote className="border-l-[3px] border-accent/30 pl-3 pr-1 py-0.5 text-[14px] text-ink leading-relaxed whitespace-pre-wrap mb-3">
        {attention.text}
      </blockquote>

      {/* ── Explanation ─────────────────────────────────────────── */}
      {editingExpl ? (
        <div className="mb-3 bg-canvas rounded-md p-2">
          <textarea
            value={explInput}
            onChange={(e) => setExplInput(e.currentTarget.value)}
            placeholder="写下你的解释 / 笔记…"
            className="w-full text-[13px] bg-transparent focus:outline-none min-h-[80px] resize-y leading-relaxed"
            autoFocus
          />
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              className="text-xs px-3 py-1 rounded-md bg-accent text-white hover:opacity-90"
              onClick={async () => {
                await setExplanation(attention.id, explInput.trim());
                setEditingExpl(false);
                onChanged();
              }}
            >
              保存
            </button>
            <button
              type="button"
              className="text-xs px-3 py-1 rounded-md text-ink-muted hover:text-ink"
              onClick={() => {
                setEditingExpl(false);
                setExplInput(attention.explanation ?? '');
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : attention.explanation ? (
        <div className="text-[13px] text-ink-muted leading-relaxed mb-3 whitespace-pre-wrap">
          {attention.explanation}
        </div>
      ) : aiLoading ? (
        <div className="mb-3 flex items-center gap-2 text-[12px] text-ink-muted bg-canvas rounded-md px-3 py-2">
          <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          AI 正在解释这段「{truncate(attention.text, 40)}」…
        </div>
      ) : aiError ? (
        <div className="mb-3 text-[12px] text-red-600 bg-red-50 rounded-md px-3 py-2 flex items-start gap-2">
          <span>⚠️</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium">AI 解释失败</div>
            <div className="text-red-500 break-words">{aiError}</div>
          </div>
          <button
            type="button"
            className="text-red-700 hover:text-red-900 font-medium underline shrink-0"
            onClick={() => void askAiExplain()}
          >
            重试
          </button>
        </div>
      ) : (
        <div className="mb-3 flex items-center gap-2 text-[12px]">
          <button
            type="button"
            onClick={() => void askAiExplain()}
            className="px-2.5 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 font-medium transition"
          >
            ✨ 让 AI 解释
          </button>
          <span className="text-ink-muted">
            或
          </span>
          <button
            type="button"
            onClick={() => setEditingExpl(true)}
            className="px-2 py-1 rounded-md text-ink-muted hover:text-ink hover:bg-canvas"
          >
            手动写解释
          </button>
        </div>
      )}

      {/* ── Tags ────────────────────────────────────────────────── */}
      {editingTags ? (
        <div className="mb-3">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.currentTarget.value)}
            placeholder="逗号分隔，如：AI 产品, 竞品调研"
            className="w-full text-xs border border-border rounded-md p-1.5 focus:outline-none focus:border-accent"
            autoFocus
          />
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              className="text-xs px-3 py-1 rounded-md bg-accent text-white"
              onClick={async () => {
                const tags = tagInput
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean);
                await updateTags(attention.id, tags);
                setEditingTags(false);
                onChanged();
              }}
            >
              保存
            </button>
            <button
              type="button"
              className="text-xs px-3 py-1 rounded-md text-ink-muted"
              onClick={() => {
                setEditingTags(false);
                setTagInput(attention.tags.join(', '));
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : attention.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {attention.tags.map((t) => (
            <span
              key={t}
              className="text-[11px] bg-canvas text-ink-muted rounded-full px-2 py-0.5"
            >
              #{t}
            </span>
          ))}
        </div>
      ) : null}

      {/* ── Actions (revealed on hover, primary always shown) ──── */}
      <div className="flex items-center gap-1.5 text-xs -ml-1.5">
        {!promoted && (
          <button
            type="button"
            className="px-2.5 py-1 rounded-md text-accent hover:bg-accent/10 font-medium"
            onClick={onPromote}
          >
            🎯 升级为话题
          </button>
        )}
        <div
          className={
            'flex items-center gap-1.5 transition-opacity ' +
            (hovering || editingTags || editingExpl ? 'opacity-100' : 'opacity-50')
          }
        >
          {!editingExpl && attention.explanation && (
            <button
              type="button"
              className="px-2 py-1 rounded-md text-ink-muted hover:bg-canvas hover:text-ink"
              onClick={() => setEditingExpl(true)}
            >
              ✏️ 改解释
            </button>
          )}
          {!editingExpl && !attention.explanation && (
            <button
              type="button"
              disabled={aiLoading}
              className="px-2 py-1 rounded-md text-accent hover:bg-accent/10 disabled:opacity-50"
              onClick={() => void askAiExplain()}
              title="让 Haiku 模型补一段 50–150 字的解释"
            >
              {aiLoading ? '✨ AI 中…' : '✨ AI 解释'}
            </button>
          )}
          {!editingTags && (
            <button
              type="button"
              className="px-2 py-1 rounded-md text-ink-muted hover:bg-canvas hover:text-ink"
              onClick={() => setEditingTags(true)}
            >
              🏷 标签
            </button>
          )}
        </div>
        <button
          type="button"
          className={
            'ml-auto px-2 py-1 rounded-md text-ink-muted hover:bg-red-50 hover:text-red-600 transition ' +
            (hovering ? 'opacity-100' : 'opacity-0')
          }
          title="删除"
          onClick={async () => {
            if (confirm('删除这条 attention？')) {
              await deleteAttention(attention.id);
              onChanged();
            }
          }}
        >
          🗑
        </button>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
}

// ============================================================================
// Time grouping
// ============================================================================

function groupByTime(items: Attention[]): Array<{ label: string; rows: Attention[] }> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 3600 * 1000;
  const startOfThisWeek = startOfToday - now.getDay() * 24 * 3600 * 1000;

  const buckets: Record<string, Attention[]> = {
    今天: [],
    昨天: [],
    本周: [],
    更早: [],
  };

  for (const a of items) {
    if (a.capturedAt >= startOfToday) buckets['今天']!.push(a);
    else if (a.capturedAt >= startOfYesterday) buckets['昨天']!.push(a);
    else if (a.capturedAt >= startOfThisWeek) buckets['本周']!.push(a);
    else buckets['更早']!.push(a);
  }

  return Object.entries(buckets)
    .filter(([, rows]) => rows.length > 0)
    .map(([label, rows]) => ({ label, rows }));
}

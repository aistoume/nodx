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
import { isImageAttention } from '@nodx/models';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  deleteAttention,
  listAttentions,
  setExplanation,
  updateTags,
} from '../../db/attentions.js';
import { explainImage, explainSelection } from '../../ai/explain.js';
import { useT } from '../../i18n/index.js';

interface Props {
  /** Bumped by parent whenever a new capture arrives, to force a re-query. */
  refreshTick: number;
  /** Hand back to App so it can create a Topic + flip view. */
  onPromote: (attention: Attention) => void;
  /** Deep-link from a 素材 graph node: scroll to + highlight this attention id. */
  focusId?: string;
  onFocusConsumed?: () => void;
}

const SOURCE_CHIPS: Array<{ key: AttentionSource; emoji: string }> = [
  { key: 'lens-chrome', emoji: '🌐' },
  { key: 'lens-mac', emoji: '🍎' },
  { key: 'manual', emoji: '✍️' },
];

export function AttentionInboxView({
  refreshTick,
  onPromote,
  focusId,
  onFocusConsumed,
}: Props) {
  const { t } = useT();
  const [items, setItems] = useState<Attention[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [hidePromoted, setHidePromoted] = useState(true);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Deep-link from a 素材 graph node: show everything (so a promoted item is
  // findable) then scroll to + highlight it once the list has that row.
  useEffect(() => {
    if (focusId) setHidePromoted(false);
  }, [focusId]);
  useEffect(() => {
    if (!focusId || items.length === 0) return;
    if (!items.some((a) => a.id === focusId)) {
      onFocusConsumed?.();
      return;
    }
    document
      .getElementById(`mat-att-${focusId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(focusId);
    onFocusConsumed?.();
    const timeoutId = window.setTimeout(() => setHighlightId(null), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [focusId, items, onFocusConsumed]);
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
        <div className="font-bold text-lg">{t('attention.title')}</div>
        <div className="text-xs text-ink-muted ml-2">
          {items.length > 0 && t('attention.count', { count: items.length })}
        </div>
        <input
          type="search"
          placeholder={t('attention.search')}
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
          {t('attention.hidePromoted')}
        </label>
      </div>

      {/* Source chips */}
      <div className="px-6 py-2 border-b border-border flex items-center gap-2 text-xs">
        <span className="text-ink-muted mr-1">{t('attention.source')}</span>
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
              {chip.emoji} {t(`source.${chip.key}` as const)}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && items.length === 0 ? (
          <div className="text-center text-ink-muted text-sm py-10">{t('attention.loading')}</div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          groups.map(({ labelKey, rows }) => (
            <div key={labelKey} className="mb-6">
              <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
                {t(labelKey)}
              </div>
              <div className="space-y-3">
                {rows.map((a) => (
                  <AttentionCard
                    key={a.id}
                    attention={a}
                    highlighted={highlightId === a.id}
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
  const { t } = useT();
  return (
    <div className="text-center text-ink-muted py-12 max-w-md mx-auto">
      <div className="text-4xl mb-3">💡</div>
      <div className="font-semibold mb-2">{t('attention.empty.title')}</div>
      <div className="text-sm leading-relaxed whitespace-pre-line">
        {t('attention.empty.body')}
      </div>
    </div>
  );
}

interface CardProps {
  attention: Attention;
  onChanged: () => void;
  onPromote: () => void;
  highlighted?: boolean;
}

function AttentionCard({
  attention,
  onChanged,
  onPromote,
  highlighted,
}: CardProps) {
  const { t } = useT();
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
      // Image captures go through Sonnet vision; text captures stay on
      // the cheaper Haiku text-only path. sourceTitle rides along as
      // context either way — helps the model disambiguate jargon.
      const ctx = attention.sourceTitle || undefined;
      const r = isImageAttention(attention) && attention.imagePath
        ? await explainImage(attention.imagePath, ctx)
        : await explainSelection(attention.text, ctx);
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
      id={`mat-att-${attention.id}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={
        'group border rounded-xl bg-surface px-5 py-4 transition-all ' +
        (highlighted
          ? 'border-amber-400 ring-2 ring-amber-300/60'
          : promoted
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
              {attention.sourceTitle || hostname || t('source.none')}
            </a>
          ) : (
            <div className="text-sm font-semibold text-ink truncate leading-tight">
              {attention.sourceTitle || t('source.manual')}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[11px] text-ink-muted mt-0.5">
            {hostname && <span className="truncate">{hostname}</span>}
            {hostname && <span>·</span>}
            <span>{formatRelative(attention.capturedAt, t)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300"
            title={t('attention.materialTip')}
          >
            {t('attention.materialBadge')}
          </span>
          {attention.kind === 'quick' && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
              title={t('attention.noExplain')}
            >
              {t('attention.bareCard')}
            </span>
          )}
          {promoted && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
              {t('attention.promoted')}
            </span>
          )}
        </div>
      </div>

      {/* ── Image thumbnail (v14 image captures) ────────────────── */}
      {isImageAttention(attention) && attention.imagePath && (
        <AttentionImage
          path={attention.imagePath}
          alt={attention.text || attention.sourceTitle || t('attention.imageAlt')}
          width={attention.imageWidth}
          height={attention.imageHeight}
        />
      )}

      {/* ── Snippet (skipped when image-only capture has empty text) ── */}
      {attention.text.trim().length > 0 && (
        <blockquote className="border-l-[3px] border-accent/30 pl-3 pr-1 py-0.5 text-[14px] text-ink leading-relaxed whitespace-pre-wrap mb-3">
          {attention.text}
        </blockquote>
      )}

      {/* ── Explanation ─────────────────────────────────────────── */}
      {editingExpl ? (
        <div className="mb-3 bg-canvas rounded-md p-2">
          <textarea
            value={explInput}
            onChange={(e) => setExplInput(e.currentTarget.value)}
            placeholder={t('attention.addExplanation')}
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
              {t('common.save')}
            </button>
            <button
              type="button"
              className="text-xs px-3 py-1 rounded-md text-ink-muted hover:text-ink"
              onClick={() => {
                setEditingExpl(false);
                setExplInput(attention.explanation ?? '');
              }}
            >
              {t('common.cancel')}
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
          {t('attention.aiExplaining', { snippet: truncate(attention.text, 40) })}
        </div>
      ) : aiError ? (
        <div className="mb-3 text-[12px] text-red-600 bg-red-50 rounded-md px-3 py-2 flex items-start gap-2">
          <span>⚠️</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium">{t('attention.aiFail')}</div>
            <div className="text-red-500 break-words">{aiError}</div>
          </div>
          <button
            type="button"
            className="text-red-700 hover:text-red-900 font-medium underline shrink-0"
            onClick={() => void askAiExplain()}
          >
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <div className="mb-3 flex items-center gap-2 text-[12px]">
          <button
            type="button"
            onClick={() => void askAiExplain()}
            className="px-2.5 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 font-medium transition"
          >
            {t('attention.askAiBtn')}
          </button>
          <span className="text-ink-muted">
            {t('attention.or')}
          </span>
          <button
            type="button"
            onClick={() => setEditingExpl(true)}
            className="px-2 py-1 rounded-md text-ink-muted hover:text-ink hover:bg-canvas"
          >
            {t('attention.writeManually')}
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
            placeholder={t('attention.tagsPlaceholder')}
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
              {t('common.save')}
            </button>
            <button
              type="button"
              className="text-xs px-3 py-1 rounded-md text-ink-muted"
              onClick={() => {
                setEditingTags(false);
                setTagInput(attention.tags.join(', '));
              }}
            >
              {t('common.cancel')}
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
            {t('attention.promote')}
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
              {t('attention.editExplanation')}
            </button>
          )}
          {!editingExpl && !attention.explanation && (
            <button
              type="button"
              disabled={aiLoading}
              className="px-2 py-1 rounded-md text-accent hover:bg-accent/10 disabled:opacity-50"
              onClick={() => void askAiExplain()}
              title={t('attention.askAiTip')}
            >
              {aiLoading ? t('attention.askAiBusy') : t('attention.askAiShort')}
            </button>
          )}
          {!editingTags && (
            <button
              type="button"
              className="px-2 py-1 rounded-md text-ink-muted hover:bg-canvas hover:text-ink"
              onClick={() => setEditingTags(true)}
            >
              {t('attention.tags')}
            </button>
          )}
        </div>
        <button
          type="button"
          className={
            'ml-auto px-2 py-1 rounded-md text-ink-muted hover:bg-red-50 hover:text-red-600 transition ' +
            (hovering ? 'opacity-100' : 'opacity-0')
          }
          title={t('common.delete')}
          onClick={async () => {
            if (confirm(t('attention.confirmDelete'))) {
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

/**
 * Renders an image captured via Lens's marquee flow. The image lives on disk
 * (`~/Library/Application Support/app.nodx.desktop/media/…`); we convert the
 * filesystem path to Tauri's `asset://` URL so the webview can load it
 * without a round-trip through the sandbox.
 *
 * Aspect ratio: constrained to `max-h-72` so a portrait screenshot doesn't
 * eat the whole card. Click-to-expand: opens the same `asset://` URL in a
 * new window (Tauri's inline preview).
 */
function AttentionImage({
  path,
  alt,
  width,
  height,
}: {
  path: string;
  alt: string;
  width?: number;
  height?: number;
}) {
  const src = convertFileSrc(path);
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="mb-3 rounded-md border border-dashed border-border bg-canvas px-3 py-2 text-[11px] text-ink-muted">
        {alt}
      </div>
    );
  }
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="block mb-3 rounded-md overflow-hidden bg-canvas border border-border hover:border-accent/50 transition"
    >
      <img
        src={src}
        alt={alt}
        {...(width ? { width } : {})}
        {...(height ? { height } : {})}
        onError={() => setBroken(true)}
        className="max-h-72 w-auto max-w-full object-contain mx-auto"
      />
    </a>
  );
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

import type { StringKey } from '../../i18n/index.js';

function formatRelative(ts: number, t: (k: StringKey, p?: Record<string, string | number>) => string): string {
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return t('time.justNow');
  if (diff < hour) return t('time.minsAgo', { n: Math.floor(diff / min) });
  if (diff < day) return t('time.hoursAgo', { n: Math.floor(diff / hour) });
  if (diff < 7 * day) return t('time.daysAgo', { n: Math.floor(diff / day) });
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

// ============================================================================
// Time grouping
// ============================================================================

type TimeBucketKey = 'time.today' | 'time.yesterday' | 'time.thisWeek' | 'time.earlier';

function groupByTime(items: Attention[]): Array<{ labelKey: TimeBucketKey; rows: Attention[] }> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 3600 * 1000;
  const startOfThisWeek = startOfToday - now.getDay() * 24 * 3600 * 1000;

  const buckets: Record<TimeBucketKey, Attention[]> = {
    'time.today': [],
    'time.yesterday': [],
    'time.thisWeek': [],
    'time.earlier': [],
  };

  for (const a of items) {
    if (a.capturedAt >= startOfToday) buckets['time.today']!.push(a);
    else if (a.capturedAt >= startOfYesterday) buckets['time.yesterday']!.push(a);
    else if (a.capturedAt >= startOfThisWeek) buckets['time.thisWeek']!.push(a);
    else buckets['time.earlier']!.push(a);
  }

  const order: TimeBucketKey[] = ['time.today', 'time.yesterday', 'time.thisWeek', 'time.earlier'];
  return order
    .filter((k) => buckets[k].length > 0)
    .map((k) => ({ labelKey: k, rows: buckets[k] }));
}

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Comment, Topic } from '@nodx/models';
import { deleteComment, parseQuotedContent } from '../db/comments.js';
import { useAnchorPositions } from '../lib/anchor-layout.js';
import { useT } from '../i18n/index.js';

interface RightPanelProps {
  topic: Topic | null;
  comments: Comment[];
  onMutated: () => void;
}

const CARD_GAP = 6;
const FALLBACK_CARD_HEIGHT = 32;

export function RightPanel({ topic, comments, onMutated }: RightPanelProps) {
  const { t } = useT();
  const anchorPositions = useAnchorPositions();
  const anchorZoneRef = useRef<HTMLDivElement | null>(null);
  const [zoneTop, setZoneTop] = useState(0);

  // Track the anchor-zone's top edge in viewport coords so we can convert
  // each anchor's viewport-Y to a zone-local Y. Refreshed on resize and on
  // any ancestor scroll (capture phase) — when the doc scrolls, the zone
  // doesn't move, but it's free to be the case for other ancestors.
  useLayoutEffect(() => {
    const update = () => {
      if (anchorZoneRef.current) {
        setZoneTop(anchorZoneRef.current.getBoundingClientRect().top);
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, []);

  // Anti-overlap pass after every render — measures real heights so a card
  // that was just expanded pushes its neighbours down instead of overlapping.
  // Uses translate3d so positioning runs on the GPU compositor (no layout
  // re-flow per scroll tick).
  useLayoutEffect(() => {
    const zone = anchorZoneRef.current;
    if (!zone) return;
    const cards = Array.from(
      zone.querySelectorAll<HTMLDivElement>('[data-anchor-card]'),
    );
    // Read all heights first to avoid layout thrash from interleaving
    // reads + writes.
    const heights = cards.map(
      (c) => c.offsetHeight || FALLBACK_CARD_HEIGHT,
    );
    let prevBottom = -Infinity;
    cards.forEach((card, i) => {
      const desired = Number(card.dataset.desiredTop ?? '0');
      const top = Math.max(desired, prevBottom + CARD_GAP);
      card.style.transform = `translate3d(0, ${top}px, 0)`;
      prevBottom = top + heights[i]!;
    });
  });

  const anchored: Comment[] = [];
  const unanchored: Comment[] = [];
  for (const c of comments) {
    if (anchorPositions.has(c.id)) anchored.push(c);
    else unanchored.push(c);
  }
  anchored.sort(
    (a, b) =>
      (anchorPositions.get(a.id) ?? 0) - (anchorPositions.get(b.id) ?? 0),
  );

  const showLegend = !topic || comments.length === 0;

  return (
    <aside className="border-l border-border bg-surface flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-baseline justify-between shrink-0">
        <SectionTitle>
          {t('right.title')}{topic && comments.length > 0 ? ` (${comments.length})` : ''}
        </SectionTitle>
      </div>

      {/* Anchored zone: takes the bulk of the panel; cards float at viewport-
          aligned Ys. overflow:hidden so off-screen anchors get clipped
          naturally rather than clamped to the visible band. */}
      <div
        ref={anchorZoneRef}
        className="flex-1 relative overflow-hidden px-2"
      >
        {anchored.map((c) => {
          const anchorY = anchorPositions.get(c.id) ?? 0;
          const desiredTop = anchorY - zoneTop;
          return (
            <div
              key={c.id}
              data-anchor-card
              data-desired-top={desiredTop}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translate3d(0, ${desiredTop}px, 0)`,
                willChange: 'transform',
              }}
              className="px-2"
            >
              <CommentCard
                comment={c}
                onDelete={async () => {
                  await deleteComment(c.id);
                  onMutated();
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Bottom drawer — unanchored comments + legend. Has its own scroll
          when overcrowded; capped at ~40% of panel height. */}
      {(unanchored.length > 0 || showLegend) && (
        <div className="border-t border-border shrink-0 max-h-[40%] overflow-y-auto p-4 flex flex-col gap-3">
          {showLegend && <Legend />}
          {topic && comments.length === 0 && (
            <p className="text-xs text-ink-muted leading-relaxed">
              {t('right.emptyHint', {
                explain: t('right.type.explain'),
                sticky: t('right.type.sticky'),
                deepen: t('right.legend.deepen'),
              })}
            </p>
          )}
          {unanchored.length > 0 && (
            <>
              <SectionTitle>{t('right.section.unanchored')} ({unanchored.length})</SectionTitle>
              <ul className="flex flex-col gap-2">
                {unanchored.map((c) => (
                  <CommentCard
                    key={c.id}
                    comment={c}
                    onDelete={async () => {
                      await deleteComment(c.id);
                      onMutated();
                    }}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function CommentCard({
  comment,
  onDelete,
}: {
  comment: Comment;
  onDelete: () => void | Promise<void>;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const palette = TYPE_PALETTE[comment.type];
  const { quote, body } =
    comment.type === 'explanation' || comment.type === 'note'
      ? parseQuotedContent(comment.content)
      : { quote: null, body: comment.content };

  const oneLine = body.replace(/\s+/g, ' ').trim();

  return (
    <div
      className={
        'group rounded-md border text-xs ' +
        palette.container +
        (expanded ? ' shadow-sm' : '')
      }
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
        title={oneLine}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${palette.dot}`}
        />
        <span className="flex-1 truncate text-ink">{oneLine || '(∅)'}</span>
        <span className="text-[10px] text-ink-muted shrink-0 opacity-60 group-hover:opacity-100 transition">
          {expanded ? t('common.collapse') : t('common.expand')}
        </span>
      </button>

      {expanded && (
        <div className="px-2.5 pb-2 pt-1 border-t border-current/10 leading-relaxed">
          <div className="flex items-baseline gap-2 mb-1">
            <span className={'px-1.5 py-0.5 rounded text-[10px] ' + palette.chip}>
              {t(TYPE_LABEL_KEY[comment.type])}
            </span>
            <span className="text-[10px] text-ink-muted">
              {new Date(comment.createdAt).toLocaleString()}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void onDelete();
              }}
              title={t('right.action.deleteTitle')}
              className="ml-auto text-[10px] text-ink-muted hover:text-red-600"
            >
              {t('right.action.deleteLabel')}
            </button>
          </div>
          {quote && (
            <blockquote className="border-l-2 border-current/30 pl-2 mb-2 italic text-ink-muted">
              {quote}
            </blockquote>
          )}
          <div className="text-ink whitespace-pre-wrap">{body}</div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] uppercase tracking-wider text-ink-muted font-medium">
      {children}
    </h3>
  );
}

function Legend() {
  const { t } = useT();
  return (
    <ul className="flex flex-col gap-2 text-xs">
      <LegendRow color="bg-note-yellow border-note-yellow-edge" label={t('right.legend.sticky')} />
      <LegendRow color="bg-note-blue border-note-blue-edge" label={t('right.legend.explain')} />
      <LegendRow color="bg-note-green border-note-green-edge" label={t('right.legend.atomic')} />
      <LegendRow color="bg-note-purple border-note-purple-edge" label={t('right.legend.quote')} />
      <LegendRow color="bg-red-50 border-red-400" label={t('right.legend.block')} />
    </ul>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={`mt-0.5 inline-block w-3 h-3 rounded-sm border ${color}`}
      />
      <span className="text-ink-muted">{label}</span>
    </li>
  );
}

const TYPE_PALETTE = {
  note: {
    container: 'bg-note-yellow border-note-yellow-edge/40',
    chip: 'bg-note-yellow-edge/20 text-yellow-800',
    dot: 'bg-note-yellow-edge',
  },
  explanation: {
    container: 'bg-note-blue border-note-blue-edge/40',
    chip: 'bg-note-blue-edge/20 text-blue-800',
    dot: 'bg-note-blue-edge',
  },
  atomic: {
    container: 'bg-note-green border-note-green-edge/40',
    chip: 'bg-note-green-edge/20 text-green-800',
    dot: 'bg-note-green-edge',
  },
  reference: {
    container: 'bg-note-purple border-note-purple-edge/40',
    chip: 'bg-note-purple-edge/20 text-purple-800',
    dot: 'bg-note-purple-edge',
  },
  open_question: {
    container: 'bg-red-50 border-red-300',
    chip: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
  },
} as const satisfies Record<
  Comment['type'],
  { container: string; chip: string; dot: string }
>;

import type { StringKey } from '../i18n/index.js';

const TYPE_LABEL_KEY: Record<Comment['type'], StringKey> = {
  note: 'right.type.sticky',
  explanation: 'right.type.explain',
  atomic: 'right.type.atomic',
  reference: 'right.type.quote',
  open_question: 'right.type.block',
};

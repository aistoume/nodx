import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Comment, Topic } from '@nodx/models';
import { deleteComment, parseQuotedContent } from '../db/comments.js';
import { useAnchorPositions } from '../lib/anchor-layout.js';

interface RightPanelProps {
  topic: Topic | null;
  comments: Comment[];
  onMutated: () => void;
}

const CARD_GAP = 8;
const ESTIMATED_CARD_HEIGHT = 120;

export function RightPanel({ topic, comments, onMutated }: RightPanelProps) {
  const anchorPositions = useAnchorPositions();
  const panelRef = useRef<HTMLElement | null>(null);
  const anchoredZoneRef = useRef<HTMLDivElement | null>(null);
  const [panelTop, setPanelTop] = useState(0);

  // Track the panel's top edge in viewport coords so we can convert anchor
  // viewport-Y → panel-local-Y.
  useLayoutEffect(() => {
    const update = () => {
      if (panelRef.current) {
        setPanelTop(panelRef.current.getBoundingClientRect().top);
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

  // Anti-overlap: lay anchored cards out top-down by anchor Y, pushing each
  // down so it doesn't overlap the previous one's measured bottom. Run after
  // every render so newly inserted cards take their natural place.
  useLayoutEffect(() => {
    const zone = anchoredZoneRef.current;
    if (!zone) return;
    const cards = Array.from(
      zone.querySelectorAll<HTMLDivElement>('[data-anchor-card]'),
    );
    let prevBottom = -Infinity;
    for (const card of cards) {
      const desired = Number(card.dataset.desiredTop ?? '0');
      const top = Math.max(desired, prevBottom + CARD_GAP);
      card.style.top = `${top}px`;
      // Use the actual measured height for stacking.
      prevBottom = top + (card.offsetHeight || ESTIMATED_CARD_HEIGHT);
    }
  });

  const anchored: Comment[] = [];
  const unanchored: Comment[] = [];
  for (const c of comments) {
    if (anchorPositions.has(c.id)) anchored.push(c);
    else unanchored.push(c);
  }
  // Stable order: anchored cards by Y ascending.
  anchored.sort(
    (a, b) =>
      (anchorPositions.get(a.id) ?? 0) - (anchorPositions.get(b.id) ?? 0),
  );

  return (
    <aside
      ref={panelRef}
      className="border-l border-border bg-surface overflow-y-auto p-4 flex flex-col gap-4 relative"
    >
      <div className="flex items-baseline justify-between">
        <SectionTitle>
          备注{topic && comments.length > 0 ? ` (${comments.length})` : ''}
        </SectionTitle>
      </div>

      {!topic && <Legend />}
      {topic && comments.length === 0 && (
        <>
          <p className="text-xs text-ink-muted leading-relaxed">
            选中文档中的文字 → 浮出菜单 → <em>解释</em> / <em>便签</em> /{' '}
            <em>深化</em>。新增的备注会出现在这里，并跟着选中位置垂直对齐。
          </p>
          <Legend />
        </>
      )}

      {topic && anchored.length > 0 && (
        <div
          ref={anchoredZoneRef}
          className="relative"
          style={{
            // Ensure the panel scrolls far enough for the lowest anchor.
            minHeight:
              Math.max(
                ...anchored.map(
                  (c) => (anchorPositions.get(c.id) ?? 0) - panelTop,
                ),
                0,
              ) +
              ESTIMATED_CARD_HEIGHT +
              CARD_GAP,
          }}
        >
          {anchored.map((c) => {
            const desiredTop = Math.max(
              0,
              (anchorPositions.get(c.id) ?? 0) - panelTop,
            );
            return (
              <div
                key={c.id}
                data-anchor-card
                data-desired-top={desiredTop}
                style={{
                  position: 'absolute',
                  top: desiredTop,
                  left: 0,
                  right: 0,
                  transition: 'top 120ms ease-out',
                }}
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
      )}

      {topic && unanchored.length > 0 && (
        <>
          {anchored.length > 0 && (
            <div className="border-t border-border mt-4 pt-4">
              <SectionTitle>未锚定 ({unanchored.length})</SectionTitle>
            </div>
          )}
          <ul className="flex flex-col gap-3">
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
  const palette = TYPE_PALETTE[comment.type];
  const { quote, body } =
    comment.type === 'explanation' || comment.type === 'note'
      ? parseQuotedContent(comment.content)
      : { quote: null, body: comment.content };

  return (
    <div
      className={
        'group rounded-md border p-3 text-xs leading-relaxed relative ' +
        palette.container
      }
    >
      <div className="flex items-baseline gap-2 mb-1">
        <span className={'px-1.5 py-0.5 rounded text-[10px] ' + palette.chip}>
          {TYPE_LABEL[comment.type]}
        </span>
        <span className="text-[10px] text-ink-muted">
          {new Date(comment.createdAt).toLocaleString()}
        </span>
        <button
          type="button"
          onClick={() => void onDelete()}
          title="删除"
          className="ml-auto opacity-0 group-hover:opacity-100 transition text-[10px] text-ink-muted hover:text-red-600"
        >
          删除
        </button>
      </div>
      {quote && (
        <blockquote className="border-l-2 border-current/30 pl-2 mb-2 text-ink-muted italic">
          {quote}
        </blockquote>
      )}
      <div className="text-ink whitespace-pre-wrap">{body}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] uppercase tracking-wider text-ink-muted font-medium">
      {children}
    </h3>
  );
}

function Legend() {
  return (
    <ul className="flex flex-col gap-2 text-xs">
      <LegendRow color="bg-note-yellow border-note-yellow-edge" label="便签 — 自由想法" />
      <LegendRow color="bg-note-blue border-note-blue-edge" label="解释 — AI 名词解释" />
      <LegendRow color="bg-note-green border-note-green-edge" label="原子动作 — 谁/做什么/何时/产出" />
      <LegendRow color="bg-note-purple border-note-purple-edge" label="引用 — @ 跨对话" />
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
  },
  explanation: {
    container: 'bg-note-blue border-note-blue-edge/40',
    chip: 'bg-note-blue-edge/20 text-blue-800',
  },
  atomic: {
    container: 'bg-note-green border-note-green-edge/40',
    chip: 'bg-note-green-edge/20 text-green-800',
  },
  reference: {
    container: 'bg-note-purple border-note-purple-edge/40',
    chip: 'bg-note-purple-edge/20 text-purple-800',
  },
} as const satisfies Record<
  Comment['type'],
  { container: string; chip: string }
>;

const TYPE_LABEL: Record<Comment['type'], string> = {
  note: '便签',
  explanation: '解释',
  atomic: '原子动作',
  reference: '引用',
};

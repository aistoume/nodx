import { useEffect, useState } from 'react';
import type { Comment, Topic } from '@nodx/models';
import {
  deleteComment,
  parseExplanationContent,
} from '../db/comments.js';

interface RightPanelProps {
  topic: Topic | null;
  comments: Comment[];
  onMutated: () => void;
}

export function RightPanel({ topic, comments, onMutated }: RightPanelProps) {
  return (
    <aside className="border-l border-border bg-surface overflow-y-auto p-4 flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <SectionTitle>
          备注{topic && comments.length > 0 ? ` (${comments.length})` : ''}
        </SectionTitle>
      </div>

      {!topic && <Legend />}
      {topic && comments.length === 0 && (
        <>
          <p className="text-xs text-ink-muted leading-relaxed">
            选中消息中的任意文字 → 浮出
            <span className="inline-block mx-1 px-1.5 py-0.5 text-[10px] rounded bg-accent text-white align-middle">
              解释
            </span>
            按钮 → AI 解释会落在这里。
          </p>
          <Legend />
        </>
      )}
      {topic && comments.length > 0 && (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
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
    comment.type === 'explanation'
      ? parseExplanationContent(comment.content)
      : { quote: null, body: comment.content };

  return (
    <li
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
    </li>
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

// Maps each comment type to its visual palette and Chinese label.
// Using the four-colour tokens declared in src/index.css @theme.
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

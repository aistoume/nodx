import { useMemo, useState } from 'react';
import { markdownToHtml } from '../../lib/markdown.js';

interface MergePreviewModalProps {
  /** Sonnet-generated Markdown section to fold into the document. */
  initialMarkdown: string;
  /** True while the confirm mutation is in flight. */
  busy?: boolean;
  onConfirm: (markdown: string) => void;
  onClose: () => void;
  /** Header title. Defaults to the 归纳进文档 wording. */
  title?: string;
  /** Sub-hint next to the title. */
  hint?: string;
  /** Confirm button label. Defaults to 插入到文档末尾. */
  confirmLabel?: string;
  /** Confirm button label while busy. */
  busyLabel?: string;
}

/**
 * Editable preview before folding an expert-panel conclusion into the thinking
 * document (PRD §8.7 「用户编辑 → 插入」). Left: editable Markdown. Right: live
 * rendered preview. Confirm appends to the end of the document.
 */
export function MergePreviewModal({
  initialMarkdown,
  busy,
  onConfirm,
  onClose,
  title = '📄 归纳进文档 · 预览可编辑',
  hint = '这一节将追加到左侧思考文档末尾，插入前可自由修改',
  confirmLabel = '插入到文档末尾',
  busyLabel = '插入中…',
}: MergePreviewModalProps) {
  const [md, setMd] = useState(initialMarkdown);
  const html = useMemo(() => markdownToHtml(md), [md]);
  const empty = md.trim().length === 0;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-8"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        <header className="px-6 py-3 border-b border-border flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold text-ink">{title}</span>
          <span className="text-[11px] text-ink-muted">{hint}</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
          >
            关闭
          </button>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-border">
          <div className="flex flex-col min-h-0">
            <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-ink-muted">
              Markdown（可编辑）
            </p>
            <textarea
              value={md}
              onChange={(e) => setMd(e.target.value)}
              spellCheck={false}
              className="flex-1 resize-none px-4 py-2 text-sm font-mono leading-relaxed bg-canvas focus:outline-none text-ink"
            />
          </div>
          <div className="flex flex-col min-h-0">
            <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-ink-muted">
              预览
            </p>
            <div
              className="prose-doc flex-1 overflow-y-auto px-5 py-2 text-sm text-ink"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>

        <footer className="px-6 py-3 border-t border-border flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium rounded border border-border text-ink-muted hover:text-ink disabled:opacity-40 transition"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(md)}
            disabled={busy || empty}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition"
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

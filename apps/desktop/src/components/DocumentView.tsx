import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { Topic } from '@nodx/models';
import { refineSelection } from '../ai/document.js';
import { upsertDocument } from '../db/documents.js';
import { markdownToHtml } from '../lib/markdown.js';

interface DocumentViewProps {
  topic: Topic;
  initialHtml: string;
  /** Bumps when an AI mutation finishes; used so the right panel can refresh. */
  onMutated: () => void;
}

interface PendingSelection {
  text: string;
  from: number;
  to: number;
  /** Viewport-anchored position for the floating action button. */
  x: number;
  y: number;
}

interface ActiveProposal {
  /** The currently-selected slice of the doc (read-only after submit). */
  original: { text: string; from: number; to: number };
  /** The user's question that produced the proposal. */
  question: string;
  /** Markdown returned by the AI. */
  markdown: string;
}

const SAVE_DEBOUNCE_MS = 700;

export function DocumentView({
  topic,
  initialHtml,
  onMutated,
}: DocumentViewProps) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          // Heading is part of starter-kit; tighten its config.
          heading: { levels: [1, 2, 3] },
        }),
      ],
      content: initialHtml,
      editorProps: {
        attributes: {
          class:
            'prose-doc focus:outline-none min-h-[60vh] py-2',
        },
      },
    },
    // Re-create the editor when navigating between topics so we don't
    // bleed state.
    [topic.id],
  );

  // Keep the editor's content in sync if the parent loads a doc later.
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== initialHtml) {
      editor.commands.setContent(initialHtml || '<p></p>', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id, initialHtml, editor]);

  // Debounced save on every change.
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const html = editor.getHTML();
        void upsertDocument(topic.id, html);
      }, SAVE_DEBOUNCE_MS);
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    };
  }, [editor, topic.id]);

  // Track the selection in the editor so we can show the "深化思考" trigger.
  const [pendingSelection, setPendingSelection] = useState<
    PendingSelection | null
  >(null);
  const [questionDraft, setQuestionDraft] = useState('');
  const [askingActive, setAskingActive] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<ActiveProposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateSelectionFromEditor = useCallback(
    (e: Editor) => {
      if (proposing || proposal) return; // freeze while a proposal is open
      const { from, to, empty } = e.state.selection;
      if (empty) {
        setPendingSelection(null);
        return;
      }
      const text = e.state.doc.textBetween(from, to, ' ').trim();
      if (text.length < 4) {
        setPendingSelection(null);
        return;
      }
      // Compute viewport rect of the selection's end coords.
      try {
        const coords = e.view.coordsAtPos(to);
        setPendingSelection({
          text,
          from,
          to,
          x: coords.right,
          y: coords.bottom + 6,
        });
      } catch {
        setPendingSelection(null);
      }
    },
    [proposal, proposing],
  );

  useEffect(() => {
    if (!editor) return;
    const handler = () => updateSelectionFromEditor(editor);
    editor.on('selectionUpdate', handler);
    return () => {
      editor.off('selectionUpdate', handler);
    };
  }, [editor, updateSelectionFromEditor]);

  const openAskPopover = () => {
    if (!pendingSelection) return;
    setQuestionDraft('');
    setAskingActive(true);
  };

  const submitQuestion = async () => {
    if (!editor || !pendingSelection) return;
    const q = questionDraft.trim() || '请帮我深化这一段。';
    setProposing(true);
    setError(null);
    try {
      const r = await refineSelection(
        editor.getText(),
        pendingSelection.text,
        q,
      );
      setProposal({
        original: {
          text: pendingSelection.text,
          from: pendingSelection.from,
          to: pendingSelection.to,
        },
        question: q,
        markdown: r.markdown,
      });
      setAskingActive(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProposing(false);
    }
  };

  const cancelAsk = () => {
    setAskingActive(false);
    setQuestionDraft('');
  };

  const acceptProposal = async () => {
    if (!editor || !proposal) return;
    const html = markdownToHtml(proposal.markdown);
    editor
      .chain()
      .focus()
      .deleteRange({ from: proposal.original.from, to: proposal.original.to })
      .insertContentAt(proposal.original.from, html)
      .run();
    // Force-flush save.
    await upsertDocument(topic.id, editor.getHTML());
    setProposal(null);
    setPendingSelection(null);
    onMutated();
  };

  const rejectProposal = () => {
    setProposal(null);
    setPendingSelection(null);
  };

  const proposalHtml = useMemo(
    () => (proposal ? markdownToHtml(proposal.markdown) : ''),
    [proposal],
  );

  return (
    <div className="flex flex-col h-full bg-canvas overflow-hidden">
      <header className="border-b border-border px-8 py-4 bg-surface shrink-0">
        <div className="max-w-3xl mx-auto">
          <p className="text-[11px] uppercase tracking-wider text-ink-muted">
            思考文档{topic.parentId ? ' · 子' : ''}
          </p>
          <h1 className="text-xl font-semibold leading-tight mt-0.5">
            {topic.title}
          </h1>
          <p className="mt-2 text-xs text-ink-muted">
            可直接编辑。选中文字后点 "深化思考"，AI 会改写并询问是否替换。
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6">
          <EditorContent editor={editor} />
          {error && (
            <pre className="mt-4 text-xs text-red-600 bg-red-50 p-2 rounded whitespace-pre-wrap">
              {error}
            </pre>
          )}
        </div>
      </div>

      {/* Floating "深化思考" trigger near selection */}
      {pendingSelection && !askingActive && !proposal && (
        <FloatingButton
          x={pendingSelection.x}
          y={pendingSelection.y}
          label="深化思考"
          hint="↪ AI 改写"
          onClick={openAskPopover}
        />
      )}

      {/* Ask popover */}
      {askingActive && pendingSelection && (
        <AskPopover
          x={pendingSelection.x}
          y={pendingSelection.y}
          selection={pendingSelection.text}
          question={questionDraft}
          onChange={setQuestionDraft}
          onSubmit={submitQuestion}
          onCancel={cancelAsk}
          submitting={proposing}
        />
      )}

      {/* Proposal accept/reject card */}
      {proposal && (
        <ProposalCard
          original={proposal.original.text}
          question={proposal.question}
          newHtml={proposalHtml}
          onAccept={acceptProposal}
          onReject={rejectProposal}
        />
      )}
    </div>
  );
}

function FloatingButton({
  x,
  y,
  label,
  hint,
  onClick,
}: {
  x: number;
  y: number;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  const left = Math.max(8, Math.min(window.innerWidth - 240, x));
  const top = Math.max(8, Math.min(window.innerHeight - 80, y));
  return (
    <div
      style={{ position: 'fixed', left, top, zIndex: 50 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={onClick}
        className="px-3 py-1.5 rounded-md text-xs font-medium shadow-md bg-accent text-white hover:opacity-90 transition flex items-center gap-1.5"
      >
        <span>{label}</span>
        {hint && <span className="opacity-70 text-[10px]">{hint}</span>}
      </button>
    </div>
  );
}

function AskPopover({
  x,
  y,
  selection,
  question,
  onChange,
  onSubmit,
  onCancel,
  submitting,
}: {
  x: number;
  y: number;
  selection: string;
  question: string;
  onChange: (s: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const left = Math.max(8, Math.min(window.innerWidth - 380, x));
  const top = Math.max(8, Math.min(window.innerHeight - 240, y));
  return (
    <div
      style={{ position: 'fixed', left, top, zIndex: 60, width: 360 }}
      onMouseDown={(e) => e.stopPropagation()}
      className="bg-surface border border-border rounded-lg shadow-xl p-3 flex flex-col gap-2"
    >
      <div className="text-[11px] uppercase tracking-wider text-ink-muted">
        深化思考
      </div>
      <blockquote className="text-xs text-ink-muted italic border-l-2 border-border pl-2 max-h-20 overflow-y-auto">
        {selection}
      </blockquote>
      <textarea
        autoFocus
        value={question}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="想问什么？（留空 = 帮我深化这段）"
        rows={3}
        disabled={submitting}
        className="resize-none px-2 py-1.5 text-sm border border-border rounded-md bg-canvas focus:outline-none focus:border-accent focus:bg-surface transition font-sans"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-3 py-1 text-xs text-ink-muted hover:text-ink"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="px-3 py-1 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 transition"
        >
          {submitting ? '思考中…' : '提交  ⌘↵'}
        </button>
      </div>
    </div>
  );
}

function ProposalCard({
  original,
  question,
  newHtml,
  onAccept,
  onReject,
}: {
  original: string;
  question: string;
  newHtml: string;
  onAccept: () => void | Promise<void>;
  onReject: () => void;
}) {
  return (
    <div
      style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 60, width: 460 }}
      className="bg-surface border-2 border-accent rounded-lg shadow-2xl p-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto"
    >
      <header className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-accent font-semibold">
          AI 建议替换
        </span>
        <span className="text-[10px] text-ink-muted">问：{question}</span>
      </header>

      <section className="text-xs">
        <div className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
          原文
        </div>
        <blockquote className="line-through text-ink-muted bg-red-50/30 border-l-2 border-red-200 pl-2 py-1 rounded-sm whitespace-pre-wrap">
          {original}
        </blockquote>
      </section>

      <section className="text-xs">
        <div className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
          AI 改写
        </div>
        <div
          className="prose-doc text-sm bg-green-50/40 border-l-2 border-green-300 pl-3 py-1.5 rounded-sm"
          dangerouslySetInnerHTML={{ __html: newHtml }}
        />
      </section>

      <footer className="flex justify-end gap-2 mt-1 sticky bottom-0 bg-surface pt-2 -mx-4 px-4 border-t border-border/40">
        <button
          type="button"
          onClick={onReject}
          className="px-3 py-1.5 text-xs text-ink-muted border border-border rounded-md hover:bg-canvas"
        >
          拒绝
        </button>
        <button
          type="button"
          onClick={() => void onAccept()}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 transition"
        >
          接受替换
        </button>
      </footer>
    </div>
  );
}

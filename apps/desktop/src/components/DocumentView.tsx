import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { Comment, Message, Topic } from '@nodx/models';
import { askCoach } from '../ai/chat.js';
import { refineSelection } from '../ai/document.js';
import { explainSelection } from '../ai/explain.js';
import { isAiConfigured } from '../ai/gateway.js';
import {
  createComment,
  formatQuotedContent,
  parseQuotedContent,
} from '../db/comments.js';
import { upsertDocument } from '../db/documents.js';
import {
  createAiMessage,
  createUserMessage,
} from '../db/messages.js';
import { setAnchorPositions } from '../lib/anchor-layout.js';
import { markdownToHtml } from '../lib/markdown.js';
import { ChatComposer, ChatThread } from './ChatThread.js';
import { SpawnChildButton } from './SpawnChildButton.js';

interface DocumentViewProps {
  topic: Topic;
  initialHtml: string;
  /** Text-only chat messages (Survey / factor_list filtered out). */
  chatMessages: Message[];
  /** Quote-bearing comments that should anchor visually to the doc. */
  anchorableComments: Comment[];
  /** Bumped after any DB mutation (comment / doc / message). */
  onMutated: () => void;
  /** Switch the active topic — used after spawn-child / deep-dive. */
  onSelectTopic: (id: string) => void;
}

interface PendingSelection {
  text: string;
  from: number;
  to: number;
  /** Viewport-anchored position for floating UI. */
  x: number;
  y: number;
}

interface ActiveProposal {
  original: { text: string; from: number; to: number };
  question: string;
  markdown: string;
}

type ActivePanel = 'menu' | 'note' | 'refine' | null;

const SAVE_DEBOUNCE_MS = 700;

export function DocumentView({
  topic,
  initialHtml,
  chatMessages,
  anchorableComments,
  onMutated,
  onSelectTopic,
}: DocumentViewProps) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
      ],
      content: initialHtml,
      editorProps: {
        attributes: {
          class: 'prose-doc focus:outline-none min-h-[60vh] py-2',
        },
      },
    },
    [topic.id],
  );

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== initialHtml) {
      editor.commands.setContent(initialHtml || '<p></p>', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id, initialHtml, editor]);

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

  const [pendingSelection, setPendingSelection] = useState<
    PendingSelection | null
  >(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [explaining, setExplaining] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<ActiveProposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chat-mode state.
  const [chatThinking, setChatThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Outer scroll container so we can listen for scroll → re-anchor.
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // publishAnchors closes over `editor` and `anchorableComments`. Both can
  // change between schedulePublish() being called and its RAF firing
  // (renders triggered by topic change, child-topic creation refreshing
  // topics, comments arriving asynchronously). To avoid the RAF callback
  // calling a stale publishAnchors, we keep the latest one in a ref and
  // dereference it inside the RAF body. schedulePublish itself is empty-
  // deps stable, so listeners registered with it stay current.
  const publishAnchors = useCallback(() => {
    if (!editor) {
      setAnchorPositions(new Map());
      return;
    }
    const next = new Map<string, number>();
    for (const c of anchorableComments) {
      const { quote } = parseQuotedContent(c.content);
      if (!quote) continue;
      let foundPos: number | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (foundPos !== null) return false;
        if (node.isText && node.text) {
          const idx = node.text.indexOf(quote);
          if (idx >= 0) {
            foundPos = pos + idx;
            return false;
          }
        }
        return true;
      });
      if (foundPos == null) continue;
      try {
        const coords = editor.view.coordsAtPos(foundPos);
        next.set(c.id, coords.top);
      } catch {
        // pos off-screen / view detached — skip silently
      }
    }
    setAnchorPositions(next);
  }, [editor, anchorableComments]);

  const publishAnchorsRef = useRef(publishAnchors);
  useEffect(() => {
    publishAnchorsRef.current = publishAnchors;
  });

  const schedulePublish = useCallback(() => {
    if (rafIdRef.current != null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      publishAnchorsRef.current();
    });
  }, []);

  // Run a publish when the editor instance changes (topic switch) or when
  // anchorableComments changes (note added / deleted / quote text edited).
  useEffect(() => {
    if (!editor) return;
    schedulePublish();
  }, [editor, anchorableComments, schedulePublish]);

  // Editor doc-content changes (typing, paste, AI replace) → re-anchor.
  useEffect(() => {
    if (!editor) return;
    const handler = () => schedulePublish();
    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
    };
  }, [editor, schedulePublish]);

  // Scroll / resize: re-translate positions to viewport coords.
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const onScroll = () => schedulePublish();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [schedulePublish]);

  // Clear anchors when the component unmounts so a stale set doesn't bleed
  // into the next topic / chat-mode state.
  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      setAnchorPositions(new Map());
    };
  }, []);

  const handleChatSend = async (content: string) => {
    setChatError(null);
    try {
      await createUserMessage(topic.id, content);
      onMutated();
      if (!isAiConfigured()) {
        setChatError(
          'AI 网关未配置，跳过 AI 回复。',
        );
        return;
      }
      setChatThinking(true);
      const docText = editor?.getText() ?? '';
      const reply = await askCoach(
        // Include the just-sent user message; we re-fetch via onMutated but
        // the local pass below is stable enough for one call.
        [
          ...chatMessages,
          {
            id: 'pending',
            topicId: topic.id,
            role: 'user',
            type: 'text',
            content,
            createdAt: Date.now(),
          },
        ],
        docText,
      );
      await createAiMessage(topic.id, reply.text);
      onMutated();
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setChatThinking(false);
    }
  };

  // Track the editor's selection so we can position the action menu.
  // Freeze when a popover or proposal is open so they don't dismiss
  // themselves by triggering a "no selection" path.
  const updateSelectionFromEditor = useCallback(
    (e: Editor) => {
      if (proposing || proposal || activePanel === 'note' || activePanel === 'refine') {
        return;
      }
      const { from, to, empty } = e.state.selection;
      if (empty) {
        setPendingSelection(null);
        setActivePanel(null);
        return;
      }
      const text = e.state.doc.textBetween(from, to, ' ').trim();
      if (text.length < 2) {
        setPendingSelection(null);
        setActivePanel(null);
        return;
      }
      try {
        const coords = e.view.coordsAtPos(to);
        setPendingSelection({
          text,
          from,
          to,
          x: coords.right,
          y: coords.bottom + 6,
        });
        setActivePanel('menu');
      } catch {
        setPendingSelection(null);
        setActivePanel(null);
      }
    },
    [proposal, proposing, activePanel],
  );

  useEffect(() => {
    if (!editor) return;
    const handler = () => updateSelectionFromEditor(editor);
    editor.on('selectionUpdate', handler);
    return () => {
      editor.off('selectionUpdate', handler);
    };
  }, [editor, updateSelectionFromEditor]);

  // ──────── Actions ────────

  const handleExplain = async () => {
    if (!pendingSelection || explaining) return;
    setExplaining(true);
    setError(null);
    try {
      const r = await explainSelection(pendingSelection.text);
      await createComment({
        topicId: topic.id,
        anchorId: null, // doc-anchored — no message id to attach to
        type: 'explanation',
        content: formatQuotedContent(pendingSelection.text, r.explanation),
      });
      window.getSelection()?.removeAllRanges();
      setPendingSelection(null);
      setActivePanel(null);
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExplaining(false);
    }
  };

  const submitNote = async (noteText: string) => {
    if (!pendingSelection) return;
    const trimmed = noteText.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await createComment({
        topicId: topic.id,
        anchorId: null,
        type: 'note',
        content: formatQuotedContent(pendingSelection.text, trimmed),
      });
      window.getSelection()?.removeAllRanges();
      setPendingSelection(null);
      setActivePanel(null);
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const submitRefineQuestion = async (question: string) => {
    if (!editor || !pendingSelection) return;
    const q = question.trim() || '请帮我深化这一段。';
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
      setActivePanel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProposing(false);
    }
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
    await upsertDocument(topic.id, editor.getHTML());
    setProposal(null);
    setPendingSelection(null);
    setActivePanel(null);
    onMutated();
  };

  const rejectProposal = () => {
    setProposal(null);
    setPendingSelection(null);
    setActivePanel(null);
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
            可直接编辑。选中文字后选择 <em>解释</em> / <em>便签</em> /{' '}
            <em>深化</em>。
          </p>
        </div>
      </header>

      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6">
          <EditorContent editor={editor} />
          {error && (
            <pre className="mt-4 text-xs text-red-600 bg-red-50 p-2 rounded whitespace-pre-wrap">
              {error}
            </pre>
          )}

          <ChatThread
            messages={chatMessages}
            thinking={chatThinking}
            error={chatError}
          />
        </div>
      </div>

      <ChatComposer
        onSend={handleChatSend}
        disabled={chatThinking}
        topSlot={
          <SpawnChildButton
            parentTopicId={topic.id}
            disabled={chatThinking}
            onCreated={(childId) => {
              onMutated();
              onSelectTopic(childId);
            }}
          />
        }
      />

      {pendingSelection && activePanel === 'menu' && (
        <SelectionMenu
          x={pendingSelection.x}
          y={pendingSelection.y}
          explaining={explaining}
          onExplain={handleExplain}
          onNote={() => setActivePanel('note')}
          onRefine={() => setActivePanel('refine')}
        />
      )}

      {pendingSelection && activePanel === 'note' && (
        <NotePopover
          x={pendingSelection.x}
          y={pendingSelection.y}
          selection={pendingSelection.text}
          onSubmit={submitNote}
          onCancel={() => setActivePanel('menu')}
        />
      )}

      {pendingSelection && activePanel === 'refine' && (
        <AskPopover
          x={pendingSelection.x}
          y={pendingSelection.y}
          selection={pendingSelection.text}
          onSubmit={submitRefineQuestion}
          onCancel={() => setActivePanel('menu')}
          submitting={proposing}
        />
      )}

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

// ──────── Subcomponents ────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function SelectionMenu({
  x,
  y,
  explaining,
  onExplain,
  onNote,
  onRefine,
}: {
  x: number;
  y: number;
  explaining: boolean;
  onExplain: () => void;
  onNote: () => void;
  onRefine: () => void;
}) {
  const left = clamp(x, 8, window.innerWidth - 280);
  const top = clamp(y, 8, window.innerHeight - 60);
  return (
    <div
      style={{ position: 'fixed', left, top, zIndex: 50 }}
      onMouseDown={(e) => e.preventDefault()}
      className="bg-surface border border-border rounded-md shadow-md flex overflow-hidden text-xs"
    >
      <MenuButton
        onClick={onExplain}
        loading={explaining}
        loadingLabel="解释中…"
        idleLabel="解释"
        hint="蓝色备注"
        accent="blue"
      />
      <span className="w-px bg-border" />
      <MenuButton
        onClick={onNote}
        idleLabel="便签"
        hint="黄色备注"
        accent="yellow"
      />
      <span className="w-px bg-border" />
      <MenuButton
        onClick={onRefine}
        idleLabel="深化"
        hint="AI 改写"
        accent="accent"
      />
    </div>
  );
}

function MenuButton({
  onClick,
  loading,
  loadingLabel,
  idleLabel,
  hint,
  accent,
}: {
  onClick: () => void;
  loading?: boolean;
  loadingLabel?: string;
  idleLabel: string;
  hint: string;
  accent: 'blue' | 'yellow' | 'accent';
}) {
  const accentClass =
    accent === 'blue'
      ? 'hover:bg-note-blue text-blue-700'
      : accent === 'yellow'
        ? 'hover:bg-note-yellow text-yellow-700'
        : 'hover:bg-accent-tint text-accent';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={
        'px-3 py-2 flex flex-col items-start gap-0.5 transition disabled:opacity-60 ' +
        accentClass
      }
    >
      <span className="font-medium">
        {loading ? loadingLabel : idleLabel}
      </span>
      <span className="text-[10px] opacity-70">{hint}</span>
    </button>
  );
}

function NotePopover({
  x,
  y,
  selection,
  onSubmit,
  onCancel,
}: {
  x: number;
  y: number;
  selection: string;
  onSubmit: (note: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit(text);
    } finally {
      setSaving(false);
    }
  };

  const left = clamp(x, 8, window.innerWidth - 380);
  const top = clamp(y, 8, window.innerHeight - 240);
  return (
    <div
      style={{ position: 'fixed', left, top, zIndex: 60, width: 360 }}
      onMouseDown={(e) => e.stopPropagation()}
      className="bg-note-yellow border border-note-yellow-edge/60 rounded-lg shadow-xl p-3 flex flex-col gap-2"
    >
      <div className="text-[11px] uppercase tracking-wider text-yellow-800 font-semibold">
        便签
      </div>
      <blockquote className="text-xs text-yellow-900/70 italic border-l-2 border-yellow-700/30 pl-2 max-h-20 overflow-y-auto">
        {selection}
      </blockquote>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            void submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="记下你对这段的想法…"
        rows={3}
        disabled={saving}
        className="resize-none px-2 py-1.5 text-sm border border-yellow-700/30 rounded-md bg-white/80 focus:outline-none focus:border-yellow-700/60 transition font-sans"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1 text-xs text-yellow-900/70 hover:text-yellow-900"
        >
          返回
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || !text.trim()}
          className="px-3 py-1 text-xs font-medium rounded-md bg-yellow-700 text-white hover:opacity-90 disabled:opacity-50 transition"
        >
          {saving ? '保存中…' : '保存便签  ⌘↵'}
        </button>
      </div>
    </div>
  );
}

function AskPopover({
  x,
  y,
  selection,
  onSubmit,
  onCancel,
  submitting,
}: {
  x: number;
  y: number;
  selection: string;
  onSubmit: (question: string) => Promise<void> | void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [question, setQuestion] = useState('');

  const submit = () => {
    void onSubmit(question);
  };

  const left = clamp(x, 8, window.innerWidth - 380);
  const top = clamp(y, 8, window.innerHeight - 240);
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
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
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
          返回
        </button>
        <button
          type="button"
          onClick={submit}
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

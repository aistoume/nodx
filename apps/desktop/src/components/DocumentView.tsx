import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { MermaidCodeBlock } from './doc/MermaidCodeBlock.js';
import type { Comment, Message, Topic } from '@nodx/models';
import { askCoach } from '../ai/chat.js';
import { refineSelection } from '../ai/document.js';
import { illustrateSelection } from '../ai/illustrate.js';
import { mediaImageHtml } from '../lib/media.js';
import { explainSelection } from '../ai/explain.js';
import { isAiConfigured } from '../ai/gateway.js';
import {
  createComment,
  createOpenQuestion,
  formatQuotedContent,
  parseQuotedContent,
} from '../db/comments.js';
import type { RecapOutput } from '../ai/replay.js';
import { ReplayCard } from './replay/ReplayCard.js';
import { ReportModal } from './report/ReportModal.js';
import { exportTopicBundle } from '../db/bundle.js';
import { saveBundleFile, safeFileName } from '../lib/bundle-file.js';
import { upsertDocument } from '../db/documents.js';
import { createTopic } from '../db/topics.js';
import { extractExecutionPlan, executionToMarkdown } from '../ai/execution.js';
import { MergePreviewModal } from './panel/MergePreviewModal.js';
import { useT } from '../i18n/index.js';
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
  /** "上次回顾" card (PRD §3.11), shown at the top when reopened after a gap. */
  replayCard?: RecapOutput | null;
  /** Hide the replay card for this view. */
  onDismissReplay?: () => void;
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

type ActivePanel = 'menu' | 'note' | 'refine' | 'stuck' | null;

const SAVE_DEBOUNCE_MS = 700;

export function DocumentView({
  topic,
  initialHtml,
  chatMessages,
  anchorableComments,
  onMutated,
  onSelectTopic,
  replayCard,
  onDismissReplay,
}: DocumentViewProps) {
  const { t } = useT();
  // Composer seed for "重新推理" (replay card → draft 卡点).
  const [composerSeed, setComposerSeed] = useState('');
  const [seedNonce, setSeedNonce] = useState(0);
  // Decision-report overlay (PRD §3.10).
  const [showReport, setShowReport] = useState(false);
  // .nodx bundle export status.
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  // 拆出执行 (思考→执行 split).
  const [splitting, setSplitting] = useState(false);
  const [execPreview, setExecPreview] = useState<string | null>(null);
  const [execTitle, setExecTitle] = useState('');

  const handleSplitExecution = async () => {
    setSplitting(true);
    setError(null);
    try {
      const plan = await extractExecutionPlan(topic.id, topic.title);
      setExecTitle(plan.title);
      setExecPreview(executionToMarkdown(plan));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSplitting(false);
    }
  };

  const handleConfirmSplit = async (markdown: string) => {
    const child = await createTopic({
      title: execTitle || t('doc.exec.titleFallback', { t: topic.title }),
      parentId: topic.id,
      status: 'atomic',
      nodeKind: 'execution',
    });
    await upsertDocument(child.id, markdownToHtml(markdown));
    setExecPreview(null);
    onMutated();
    onSelectTopic(child.id);
  };

  const handleExportBundle = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      const json = await exportTopicBundle(topic.id);
      const path = await saveBundleFile(`${safeFileName(topic.title)}.nodx`, json);
      if (!path) return; // user cancelled the save dialog
      const count = JSON.parse(json).tables.topics.length as number;
      setExportMsg(t('doc.exportedMsg', { n: String(count), path }));
      window.setTimeout(() => setExportMsg(null), 6000);
    } catch (e) {
      setExportMsg(t('doc.exportFailMsg', { err: e instanceof Error ? e.message : String(e) }));
    } finally {
      setExporting(false);
    }
  };
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          // Replaced by MermaidCodeBlock below (same node, adds a NodeView
          // that renders ```mermaid fences as live diagrams).
          codeBlock: false,
        }),
        MermaidCodeBlock,
        Image.configure({ inline: false }),
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
  const [illustrating, setIllustrating] = useState(false);

  // 🎨 选段配图: Sonnet writes an image prompt from the selected passage,
  // Gemini renders it, and the result is inserted right below the selection.
  const handleIllustrate = async () => {
    if (!editor || !pendingSelection || illustrating) return;
    setIllustrating(true);
    try {
      const r = await illustrateSelection(pendingSelection.text, topic.title);
      editor
        .chain()
        .focus()
        .insertContentAt(pendingSelection.to, mediaImageHtml(r.file))
        .run();
      setPendingSelection(null);
      setActivePanel(null);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setIllustrating(false);
    }
  };
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
      // eslint-disable-next-line no-console
      console.debug('[anchor] skip — no editor yet');
      setAnchorPositions(new Map());
      return;
    }

    // Flatten the doc's text nodes into one continuous string with a
    // parallel array mapping each character's index back to its
    // ProseMirror position. This is how we resolve a quote that crosses
    // text-node boundaries (which it does whenever the user's selection
    // spans bold/italic/link spans — Sonnet-generated docs are full of
    // these). Per-text-node indexOf would miss every such case.
    let flatText = '';
    const flatToDocPos: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        for (let i = 0; i < node.text.length; i++) {
          flatToDocPos[flatText.length + i] = pos + i;
        }
        flatText += node.text;
      }
      return true;
    });

    const next = new Map<string, number>();
    let noQuote = 0;
    let quoteNotInDoc = 0;
    let coordsFailed = 0;
    for (const c of anchorableComments) {
      const { quote } = parseQuotedContent(c.content);
      if (!quote) {
        noQuote++;
        continue;
      }
      const idx = flatText.indexOf(quote);
      if (idx < 0) {
        quoteNotInDoc++;
        continue;
      }
      const docPos = flatToDocPos[idx];
      if (docPos == null) {
        quoteNotInDoc++;
        continue;
      }
      try {
        const coords = editor.view.coordsAtPos(docPos);
        next.set(c.id, coords.top);
      } catch {
        coordsFailed++;
      }
    }
    // eslint-disable-next-line no-console
    console.log('[anchor] publish', {
      total: anchorableComments.length,
      anchored: next.size,
      noQuote,
      quoteNotInDoc,
      coordsFailed,
      editorReady: Boolean(editor.view?.dom?.isConnected),
      flatLen: flatText.length,
    });
    setAnchorPositions(next);

    // If we had comments but couldn't anchor any of them, the editor view
    // is probably not in the DOM yet (just-mounted race). Retry once after
    // the next layout pass.
    if (
      anchorableComments.length > 0 &&
      next.size === 0 &&
      anchorableComments.some(
        (c) => parseQuotedContent(c.content).quote != null,
      )
    ) {
      window.setTimeout(() => {
        publishAnchorsRef.current();
      }, 200);
    }
  }, [editor, anchorableComments]);

  const publishAnchorsRef = useRef(publishAnchors);
  // useLayoutEffect — runs synchronously after commit, before any RAF in
  // the next frame can fire. Plain useEffect has occasionally been beaten
  // by an in-flight RAF that captured the previous publishAnchors before
  // the ref got updated.
  useLayoutEffect(() => {
    publishAnchorsRef.current = publishAnchors;
  });

  /**
   * Run publishAnchors on the next animation frame, coalescing bursts of
   * scroll/update events down to one publish per frame. Falls back to
   * setTimeout(0) if requestAnimationFrame doesn't fire — under React
   * StrictMode dev double-invoke + cleanup, a queued RAF can be silently
   * cancelled and we'd never know.
   */
  const schedulePublish = useCallback(() => {
    if (rafIdRef.current != null) return;
    let timerFired = false;
    const fallback = window.setTimeout(() => {
      if (timerFired) return;
      timerFired = true;
      rafIdRef.current = null;
      publishAnchorsRef.current();
    }, 32);
    rafIdRef.current = requestAnimationFrame(() => {
      if (timerFired) return;
      timerFired = true;
      window.clearTimeout(fallback);
      rafIdRef.current = null;
      publishAnchorsRef.current();
    });
  }, []);

  // Trigger a publish when:
  //   - editor instance changes (topic switch recreates the editor)
  //   - anchorableComments changes (note added / deleted / type changed)
  //   - initialHtml changes (topic switch where editor is reused via
  //     setContent(emitUpdate=false) — no 'update' event would fire,
  //     so we'd otherwise miss it)
  // Trigger effect: fires on editor/anchorableComments/initialHtml change.
  // Calls publishAnchors directly (bypasses the RAF coalescer) — the
  // trigger frequency is low (data-driven, not scroll-driven), and direct
  // calls eliminate the StrictMode-cancelled-RAF class of bugs we hit.
  useEffect(() => {
    if (!editor) return;
    publishAnchorsRef.current();
  }, [editor, anchorableComments, initialHtml]);

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
          t('doc.aiSkipped'),
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
            sessionId: 'pending',
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
      // '' separator keeps the quote consistent with how publishAnchors
      // searches: a flat concatenation of every text node's content with
      // no inter-block padding. Mismatched separators here used to make
      // multi-block selections un-anchorable.
      const text = e.state.doc.textBetween(from, to, '').trim();
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

  // 卡点 (PRD §3.12): the selected text is the question; the popover captures
  // why it's stuck. Writes an open_question comment (red, also feeds the global
  // 卡点 list + the replay card).
  const submitStuck = async (blockedReason: string) => {
    if (!pendingSelection) return;
    setError(null);
    try {
      await createOpenQuestion({
        topicId: topic.id,
        anchorId: null,
        question: pendingSelection.text,
        blockedReason: blockedReason.trim() || undefined,
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
    const q = question.trim() || t('doc.deepen.fallbackQ');
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
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-ink-muted">
                {t('doc.headerBadge')}{topic.parentId ? t('doc.subSuffix') : ''}
              </p>
              <h1 className="text-xl font-semibold leading-tight mt-0.5">
                {topic.title}
              </h1>
            </div>
            <div className="shrink-0 mt-0.5 flex items-center gap-2">
              {topic.nodeKind !== 'execution' && (
                <button
                  type="button"
                  onClick={handleSplitExecution}
                  disabled={splitting}
                  title={t('doc.toolbar.extractExecTitle')}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-emerald-500 text-emerald-600 hover:bg-emerald-500 hover:text-white transition disabled:opacity-50"
                >
                  {splitting ? t('doc.exec.splitting') : t('doc.exec.splitBtn')}
                </button>
              )}
              <button
                type="button"
                onClick={handleExportBundle}
                disabled={exporting}
                title={t('doc.toolbar.exportBundleTitle')}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-ink-muted hover:border-accent hover:text-accent transition disabled:opacity-50"
              >
                {exporting ? t('doc.exportBusy') : t('doc.exportBtn')}
              </button>
              <button
                type="button"
                onClick={() => setShowReport(true)}
                title={t('doc.toolbar.exportReportTitle')}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-accent text-accent hover:bg-accent hover:text-white transition"
              >
                {t('doc.reportBtn')}
              </button>
            </div>
          </div>
          {exportMsg && (
            <p className="mt-2 text-xs text-accent">{exportMsg}</p>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            {t('doc.editHint.prefix')} <em>{t('doc.editHint.explain')}</em> / <em>{t('doc.editHint.sticky')}</em> /{' '}
            <em>{t('doc.editHint.deepen')}</em> / <em>{t('doc.editHint.block')}</em>.
          </p>
        </div>
      </header>
      {showReport && (
        <ReportModal topicId={topic.id} onClose={() => setShowReport(false)} />
      )}

      {execPreview !== null && (
        <MergePreviewModal
          initialMarkdown={execPreview}
          title={t('doc.exec.previewTitle')}
          hint={t('doc.exec.previewHint')}
          confirmLabel={t('doc.exec.confirm')}
          busyLabel={t('doc.exec.creating')}
          onConfirm={(md) => void handleConfirmSplit(md)}
          onClose={() => setExecPreview(null)}
        />
      )}

      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6">
          {replayCard && (
            <div className="mb-5">
              <ReplayCard
                recap={replayCard}
                onDismiss={onDismissReplay}
                onReplay={() => {
                  const draft =
                    t('doc.replay.draftPrefix') + '\n' +
                    replayCard.stuckPoints.map((s) => `- ${s}`).join('\n') +
                    '\n\n' + t('doc.replay.draftSuffix');
                  setComposerSeed(draft);
                  setSeedNonce((n) => n + 1);
                }}
              />
            </div>
          )}
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
        seedDraft={composerSeed}
        seedNonce={seedNonce}
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
          illustrating={illustrating}
          onExplain={handleExplain}
          onNote={() => setActivePanel('note')}
          onRefine={() => setActivePanel('refine')}
          onStuck={() => setActivePanel('stuck')}
          onIllustrate={() => void handleIllustrate()}
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

      {pendingSelection && activePanel === 'stuck' && (
        <NotePopover
          variant="stuck"
          x={pendingSelection.x}
          y={pendingSelection.y}
          selection={pendingSelection.text}
          onSubmit={submitStuck}
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
  illustrating,
  onExplain,
  onNote,
  onRefine,
  onStuck,
  onIllustrate,
}: {
  x: number;
  y: number;
  explaining: boolean;
  illustrating: boolean;
  onExplain: () => void;
  onNote: () => void;
  onRefine: () => void;
  onStuck: () => void;
  onIllustrate: () => void;
}) {
  const { t } = useT();
  const left = clamp(x, 8, window.innerWidth - 340);
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
        loadingLabel={t('doc.toolbar.explain.loading')}
        idleLabel={t('doc.toolbar.explain.idle')}
        hint={t('doc.toolbar.explain.hint')}
        accent="blue"
      />
      <span className="w-px bg-border" />
      <MenuButton
        onClick={onNote}
        idleLabel={t('doc.toolbar.sticky.idle')}
        hint={t('doc.toolbar.sticky.hint')}
        accent="yellow"
      />
      <span className="w-px bg-border" />
      <MenuButton
        onClick={onRefine}
        idleLabel={t('doc.toolbar.deepen.idle')}
        hint={t('doc.toolbar.deepen.hint')}
        accent="accent"
      />
      <span className="w-px bg-border" />
      <MenuButton
        onClick={onStuck}
        idleLabel={t('doc.toolbar.block.idle')}
        hint={t('doc.toolbar.block.hint')}
        accent="red"
      />
      <span className="w-px bg-border" />
      <MenuButton
        onClick={onIllustrate}
        loading={illustrating}
        loadingLabel={t('doc.toolbar.illustrate.loading')}
        idleLabel={t('doc.toolbar.illustrate.idle')}
        hint={t('doc.toolbar.illustrate.hint')}
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
  accent: 'blue' | 'yellow' | 'accent' | 'red';
}) {
  const accentClass =
    accent === 'blue'
      ? 'hover:bg-note-blue text-blue-700'
      : accent === 'yellow'
        ? 'hover:bg-note-yellow text-yellow-700'
        : accent === 'red'
          ? 'hover:bg-red-50 text-red-600'
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

const POPOVER_THEME = {
  note: {
    card: 'bg-note-yellow border-note-yellow-edge/60',
    labelKey: 'doc.popover.note.label' as const,
    labelText: 'text-yellow-800',
    quote: 'text-yellow-900/70 border-yellow-700/30',
    field: 'border-yellow-700/30 focus:border-yellow-700/60',
    cancel: 'text-yellow-900/70 hover:text-yellow-900',
    submit: 'bg-yellow-700',
    submitLabelKey: 'doc.popover.note.submit' as const,
    placeholderKey: 'doc.popover.note.placeholder' as const,
    allowEmpty: false,
  },
  stuck: {
    card: 'bg-red-50 border-red-300',
    labelKey: 'doc.popover.stuck.label' as const,
    labelText: 'text-red-700',
    quote: 'text-red-900/70 border-red-300',
    field: 'border-red-300 focus:border-red-400',
    cancel: 'text-red-900/70 hover:text-red-900',
    submit: 'bg-red-600',
    submitLabelKey: 'doc.popover.stuck.submit' as const,
    placeholderKey: 'doc.popover.stuck.placeholder' as const,
    allowEmpty: true,
  },
} as const;

function NotePopover({
  x,
  y,
  selection,
  onSubmit,
  onCancel,
  variant = 'note',
}: {
  x: number;
  y: number;
  selection: string;
  onSubmit: (note: string) => Promise<void> | void;
  onCancel: () => void;
  variant?: 'note' | 'stuck';
}) {
  const { t } = useT();
  const theme = POPOVER_THEME[variant];
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const canSubmit = (theme.allowEmpty || !!text.trim()) && !saving;
  const submit = async () => {
    if (!canSubmit) return;
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
      className={`border rounded-lg shadow-xl p-3 flex flex-col gap-2 ${theme.card}`}
    >
      <div
        className={`text-[11px] uppercase tracking-wider font-semibold ${theme.labelText}`}
      >
        {t(theme.labelKey)}
      </div>
      <blockquote
        className={`text-xs italic border-l-2 pl-2 max-h-20 overflow-y-auto ${theme.quote}`}
      >
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
        placeholder={t(theme.placeholderKey)}
        rows={3}
        disabled={saving}
        className={`resize-none px-2 py-1.5 text-sm border rounded-md bg-white/80 focus:outline-none transition font-sans ${theme.field}`}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={`px-3 py-1 text-xs ${theme.cancel}`}
        >
          {t('doc.popover.back')}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className={`px-3 py-1 text-xs font-medium rounded-md text-white hover:opacity-90 disabled:opacity-50 transition ${theme.submit}`}
        >
          {saving ? t('doc.popover.saving') : t(theme.submitLabelKey)}
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
  const { t } = useT();
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
        {t('doc.deepen.title')}
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
        placeholder={t('doc.deepen.placeholder')}
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
          {t('doc.popover.back')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="px-3 py-1 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 transition"
        >
          {submitting ? t('doc.deepen.thinking') : t('doc.deepen.submit')}
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
  const { t } = useT();
  return (
    <div
      style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 60, width: 460 }}
      className="bg-surface border-2 border-accent rounded-lg shadow-2xl p-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto"
    >
      <header className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-accent font-semibold">
          {t('doc.proposal.title')}
        </span>
        <span className="text-[10px] text-ink-muted">{t('doc.proposal.qLabel', { q: question })}</span>
      </header>

      <section className="text-xs">
        <div className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
          {t('doc.proposal.original')}
        </div>
        <blockquote className="line-through text-ink-muted bg-red-50/30 border-l-2 border-red-200 pl-2 py-1 rounded-sm whitespace-pre-wrap">
          {original}
        </blockquote>
      </section>

      <section className="text-xs">
        <div className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
          {t('doc.proposal.rewrite')}
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
          {t('doc.proposal.reject')}
        </button>
        <button
          type="button"
          onClick={() => void onAccept()}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 transition"
        >
          {t('doc.proposal.accept')}
        </button>
      </footer>
    </div>
  );
}

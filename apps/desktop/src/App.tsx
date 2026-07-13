import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Attention, Comment, MaterialKind, Topic } from '@nodx/models';
import { listen } from '@tauri-apps/api/event';
import { t as tPure } from './i18n/index.js';
import { Header } from './components/Header.js';
import { LeftPanel } from './components/LeftPanel.js';
import { CenterPanel } from './components/CenterPanel.js';
import { RightPanel } from './components/RightPanel.js';
import { ExplainTrigger } from './components/ExplainTrigger.js';
import { NetworkGraphView } from './components/NetworkGraphView.js';
import { CaseSearchView } from './components/cbr/CaseSearchView.js';
import { AttentionInboxView } from './components/attention/AttentionInboxView.js';
import { TopicTabsBar } from './components/TopicTabsBar.js';
import { SettingsView } from './components/SettingsView.js';
import { listArchivedTopics, listTopics, createTopic } from './db/topics.js';
import { markCanvasTopic } from './lib/canvas-topics.js';
import { listComments, listAllOpenQuestions } from './db/comments.js';
import { createUserMessage } from './db/messages.js';
import { markPromoted, upsertCaptured } from './db/attentions.js';
import { registerPanelDevTrigger } from './ai/panel.js';
import { registerCbrDevTrigger } from './ai/cbr.js';
import { registerReplayDevTrigger } from './ai/replay.js';

type View = 'dialog' | 'graph' | 'cases' | 'attention' | 'settings';

/**
 * Shape emitted by Rust on `nodx://capture` events — must match
 * `CapturePayload` in apps/desktop/src-tauri/src/lib.rs.
 */
interface CapturePayload {
  id: string;
  text: string;
  explanation?: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceKind: 'lens-chrome' | 'lens-mac' | 'manual';
  kind: 'explain' | 'quick';
  capturedAt: number;
  /**
   * Image-capture fields (v14+, POST /v1/capture-image path). When set,
   * the payload came from Lens's marquee-screenshot flow — the image
   * already lives on disk at `imagePath` and the row should carry the
   * path + dimensions through to the DB layer.
   */
  imagePath?: string;
  imageMime?: string;
  imageWidth?: number;
  imageHeight?: number;
}

const OPEN_TABS_KEY = 'nodx:open-topic-tabs:v1';

function loadOpenTabs(): string[] {
  try {
    const raw = localStorage.getItem(OPEN_TABS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveOpenTabs(ids: string[]): void {
  try {
    localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(ids));
  } catch {
    /* non-fatal */
  }
}

export function App() {
  const [view, setView] = useState<View>('dialog');
  // Deep-link from a 素材 graph node → focus that item in its library.
  const [materialFocus, setMaterialFocus] = useState<{
    kind: MaterialKind;
    id: string;
  } | null>(null);
  const [attentionRefreshTick, setAttentionRefreshTick] = useState(0);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [archivedTopics, setArchivedTopics] = useState<Topic[]>([]);
  const [openTopicIds, setOpenTopicIds] = useState<string[]>(() => loadOpenTabs());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [openQuestions, setOpenQuestions] = useState<
    Array<{ id: string; topicId: string; topicTitle: string; question: string }>
  >([]);

  const refreshOpenQuestions = useCallback(async () => {
    try {
      const list = await listAllOpenQuestions();
      setOpenQuestions(
        list.map((o) => ({
          id: o.comment.id,
          topicId: o.comment.topicId,
          topicTitle: o.topicTitle,
          question: o.comment.openQuestionData?.question ?? o.comment.content,
        })),
      );
    } catch {
      // Non-critical — the badge just stays stale.
    }
  }, []);

  const refreshTopics = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [active, archived] = await Promise.all([
        listTopics(),
        listArchivedTopics(),
      ]);
      setTopics(active);
      setArchivedTopics(archived);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshComments = useCallback(async () => {
    if (!selectedTopicId) {
      setComments([]);
      return;
    }
    try {
      setComments(await listComments(selectedTopicId));
    } catch {
      // RightPanel can survive a stale list; topics-level error already
      // surfaces via loadError.
    }
  }, [selectedTopicId]);

  useEffect(() => {
    void refreshTopics();
  }, [refreshTopics]);

  // Tauri 2 doesn't ship a Cmd+R reload by default — wire it up in JS so
  // dev hot-reloads / debug refreshes don't require restarting the dev
  // command. Plain location.reload() is enough since SQLite + Worker
  // state are external.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'r' && !e.shiftKey) {
        e.preventDefault();
        window.location.reload();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    void refreshComments();
  }, [refreshComments]);

  useEffect(() => {
    void refreshOpenQuestions();
  }, [refreshOpenQuestions]);

  // Persist open tabs whenever they change.
  useEffect(() => {
    saveOpenTabs(openTopicIds);
  }, [openTopicIds]);

  // Prune tabs that point at deleted topics. Active topic might also need
  // to fall back to the last remaining tab.
  useEffect(() => {
    if (topics.length === 0) return;
    const active = new Set(topics.map((t) => t.id));
    setOpenTopicIds((prev) => {
      const filtered = prev.filter((id) => active.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [topics]);

  /**
   * Open a topic in the tab strip (adds if not present) and select it.
   * Replaces direct `setSelectedTopicId` calls so the tab UX stays in sync.
   */
  const openTopicInTab = useCallback((id: string) => {
    setSelectedTopicId(id);
    setOpenTopicIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setOpenTopicIds((prev) => {
        const next = prev.filter((x) => x !== id);
        // If we closed the active tab, jump to the previous tab (or null).
        if (selectedTopicId === id) {
          const idx = prev.indexOf(id);
          const fallback = next[Math.max(0, idx - 1)] ?? next[0] ?? null;
          setSelectedTopicId(fallback);
        }
        return next;
      });
    },
    [selectedTopicId],
  );

  /**
   * Create a brand-new topic from the tab bar's + dropdown. Default status
   * is 'exploring' (matching the LeftPanel form's default), the topic gets
   * added to the tab strip immediately and made active.
   */
  const createTopicFromTab = useCallback(
    async (title: string) => {
      const topic = await createTopic({ title });
      await refreshTopics();
      openTopicInTab(topic.id);
      // Make sure the user lands somewhere visible after creating.
      if (view !== 'dialog' && view !== 'graph') {
        setView('dialog');
      }
    },
    [refreshTopics, openTopicInTab, view],
  );

  // Expert Panel has no UI yet — expose window.__nodxRunPanel(topicId) in
  // dev so the debate engine can be driven + inspected from the console.
  useEffect(() => {
    if (import.meta.env.DEV) {
      registerPanelDevTrigger();
      registerCbrDevTrigger();
      registerReplayDevTrigger();
    }
  }, []);

  // Listen for deep-link captures fired from nodx Lens (Chrome / Mac).
  // Rust parses `nodx://capture?...` and emits a `nodx://capture` event with
  // the decoded payload — see apps/desktop/src-tauri/src/lib.rs.
  useEffect(() => {
    const unlistenPromise = listen<CapturePayload>('nodx://capture', async (e) => {
      const p = e.payload;
      try {
        await upsertCaptured({
          id: p.id,
          text: p.text,
          explanation: p.explanation,
          sourceUrl: p.sourceUrl,
          sourceTitle: p.sourceTitle,
          sourceKind: p.sourceKind,
          kind: p.kind,
          capturedAt: p.capturedAt,
          ...(p.imagePath ? { imagePath: p.imagePath } : {}),
          ...(p.imageMime ? { imageMime: p.imageMime } : {}),
          ...(p.imageWidth ? { imageWidth: p.imageWidth } : {}),
          ...(p.imageHeight ? { imageHeight: p.imageHeight } : {}),
        });
        // Open the inbox so the user sees the new row, and bump the tick.
        setView('attention');
        setAttentionRefreshTick((n) => n + 1);
      } catch (err) {
        console.error('failed to ingest capture', err);
      }
    });
    return () => {
      void unlistenPromise.then((u) => u());
    };
  }, []);

  // "Promote attention to topic": create a Topic seeded with the snippet
  // as the first user message, then mark the attention as promoted and
  // flip into dialog mode so the user can run Survey on it.
  const promoteAttentionToTopic = useCallback(
    async (a: Attention) => {
      // Title = first 60 chars of the snippet (rough, user can rename later).
      const rawTitle = a.text.trim().replace(/\s+/g, ' ');
      const title =
        rawTitle.length > 60 ? `${rawTitle.slice(0, 57)}…` : rawTitle;
      const topic = await createTopic({ title });
      // Seed message — preserves attribution so the AI can see where it came from.
      const lines: string[] = [tPure('app.promote.fromPool', { src: a.sourceTitle || a.sourceUrl })];
      lines.push('', `> ${a.text}`);
      if (a.explanation && a.explanation.trim()) {
        lines.push('', tPure('app.promote.lensNote', { expl: a.explanation }));
      }
      await createUserMessage(topic.id, lines.join('\n'));
      await markPromoted(a.id, topic.id);
      await refreshTopics();
      openTopicInTab(topic.id);
      setView('dialog');
      setAttentionRefreshTick((n) => n + 1);
    },
    [refreshTopics, openTopicInTab],
  );

  const selectedTopic = useMemo(
    () =>
      selectedTopicId
        ? (topics.find((t) => t.id === selectedTopicId) ?? null)
        : null,
    [topics, selectedTopicId],
  );

  const refreshAll = () => {
    void refreshTopics();
    void refreshComments();
    void refreshOpenQuestions();
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        view={view}
        onViewChange={setView}
        openQuestions={openQuestions}
        onJumpToTopic={(id) => {
          openTopicInTab(id);
          setView('dialog');
        }}
      />

      {/* Topic tab strip — only meaningful in dialog / graph view.
          Hidden in cases / attention views since those don't operate on a
          single active topic. */}
      {(view === 'dialog' || view === 'graph') && (
        <TopicTabsBar
          topics={topics}
          openTopicIds={openTopicIds}
          activeTopicId={selectedTopicId}
          onSelect={(id) => setSelectedTopicId(id)}
          onClose={closeTab}
          onOpenPicker={(id) => openTopicInTab(id)}
          onCreate={createTopicFromTab}
        />
      )}

      {view === 'settings' && (
        <SettingsView onClose={() => setView('dialog')} />
      )}

      {/* LeftPanel persists across views — clicking a topic from graph
          mode swaps the canvas's root subtree without forcing the user
          back into dialog mode. RightPanel only renders in dialog mode
          since its anchored cards are tied to the doc editor. */}
      {view !== 'settings' && (
      <div
        className={
          'grid flex-1 min-h-0 ' +
          (view === 'dialog'
            ? 'grid-cols-[240px_1fr_340px]'
            : view === 'graph'
              ? 'grid-cols-[240px_1fr]'
              : 'grid-cols-[1fr]')
        }
      >
        {view === 'cases' ? (
          <CaseSearchView
            focusId={
              materialFocus?.kind === 'solution' ? materialFocus.id : undefined
            }
            onFocusConsumed={() => setMaterialFocus(null)}
            onOpenTopic={(id) => {
              openTopicInTab(id);
              setView('dialog');
              void refreshTopics();
            }}
          />
        ) : view === 'attention' ? (
          <AttentionInboxView
            refreshTick={attentionRefreshTick}
            activeTopicId={selectedTopicId}
            focusId={
              materialFocus?.kind === 'inspiration'
                ? materialFocus.id
                : undefined
            }
            onFocusConsumed={() => setMaterialFocus(null)}
            onPromote={(a) => {
              void promoteAttentionToTopic(a);
            }}
          />
        ) : (
          <>
            <LeftPanel
              topics={topics}
              archivedTopics={archivedTopics}
              loading={loading}
              loadError={loadError}
              selectedTopicId={selectedTopicId}
              onSelectTopic={(id) => {
                if (id) openTopicInTab(id);
                else setSelectedTopicId(null);
              }}
              onMutated={refreshAll}
            />
            {view === 'dialog' ? (
              <>
                <CenterPanel
                  topic={selectedTopic}
                  comments={comments}
                  onMutated={refreshAll}
                  onSelectTopic={openTopicInTab}
                />
                <RightPanel
                  topic={selectedTopic}
                  comments={comments}
                  onMutated={refreshAll}
                />
              </>
            ) : view === 'graph' ? (
              <NetworkGraphView
                topics={topics}
                selectedTopicId={selectedTopicId}
                onSelectTopic={openTopicInTab}
                onSwitchToDialog={() => setView('dialog')}
                onOpenMaterialLibrary={(kind, id) => {
                  setMaterialFocus({ kind, id });
                  setView(kind === 'solution' ? 'cases' : 'attention');
                }}
                onRequestNewCanvas={(name) => {
                  void (async () => {
                    const t = await createTopic({ title: name });
                    markCanvasTopic(t.id); // stay blank; user fires Survey manually
                    await refreshTopics();
                    openTopicInTab(t.id); // stays on the graph view
                  })();
                }}
              />
            ) : null}
          </>
        )}
      </div>
      )}

      <ExplainTrigger
        topicId={selectedTopicId}
        onCreated={() => void refreshComments()}
      />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Comment, Topic } from '@nodx/models';
import { Header } from './components/Header.js';
import { LeftPanel } from './components/LeftPanel.js';
import { CenterPanel } from './components/CenterPanel.js';
import { RightPanel } from './components/RightPanel.js';
import { ExplainTrigger } from './components/ExplainTrigger.js';
import { NetworkGraphView } from './components/NetworkGraphView.js';
import { CaseSearchView } from './components/cbr/CaseSearchView.js';
import { listArchivedTopics, listTopics } from './db/topics.js';
import { listComments, listAllOpenQuestions } from './db/comments.js';
import { registerPanelDevTrigger } from './ai/panel.js';
import { registerCbrDevTrigger } from './ai/cbr.js';
import { registerReplayDevTrigger } from './ai/replay.js';

type View = 'dialog' | 'graph' | 'cases';

export function App() {
  const [view, setView] = useState<View>('dialog');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [archivedTopics, setArchivedTopics] = useState<Topic[]>([]);
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

  // Expert Panel has no UI yet — expose window.__nodxRunPanel(topicId) in
  // dev so the debate engine can be driven + inspected from the console.
  useEffect(() => {
    if (import.meta.env.DEV) {
      registerPanelDevTrigger();
      registerCbrDevTrigger();
      registerReplayDevTrigger();
    }
  }, []);

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
          setSelectedTopicId(id);
          setView('dialog');
        }}
      />


      {/* LeftPanel persists across views — clicking a topic from graph
          mode swaps the canvas's root subtree without forcing the user
          back into dialog mode. RightPanel only renders in dialog mode
          since its anchored cards are tied to the doc editor. */}
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
            onOpenTopic={(id) => {
              setSelectedTopicId(id);
              setView('dialog');
              void refreshTopics();
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
              onSelectTopic={setSelectedTopicId}
              onMutated={refreshAll}
            />
            {view === 'dialog' ? (
              <>
                <CenterPanel
                  topic={selectedTopic}
                  comments={comments}
                  onMutated={refreshAll}
                  onSelectTopic={setSelectedTopicId}
                />
                <RightPanel
                  topic={selectedTopic}
                  comments={comments}
                  onMutated={refreshAll}
                />
              </>
            ) : (
              <NetworkGraphView
                topics={topics}
                selectedTopicId={selectedTopicId}
                onSelectTopic={setSelectedTopicId}
                onSwitchToDialog={() => setView('dialog')}
              />
            )}
          </>
        )}
      </div>

      <ExplainTrigger
        topicId={selectedTopicId}
        onCreated={() => void refreshComments()}
      />
    </div>
  );
}

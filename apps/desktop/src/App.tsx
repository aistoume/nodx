import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Comment, Topic } from '@nodx/models';
import { Header } from './components/Header.js';
import { LeftPanel } from './components/LeftPanel.js';
import { CenterPanel } from './components/CenterPanel.js';
import { RightPanel } from './components/RightPanel.js';
import { ExplainTrigger } from './components/ExplainTrigger.js';
import { NetworkGraphView } from './components/NetworkGraphView.js';
import { listArchivedTopics, listTopics } from './db/topics.js';
import { listComments } from './db/comments.js';

type View = 'dialog' | 'graph';

export function App() {
  const [view, setView] = useState<View>('dialog');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [archivedTopics, setArchivedTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);

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

  useEffect(() => {
    void refreshComments();
  }, [refreshComments]);

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
  };

  return (
    <div className="flex flex-col h-full">
      <Header view={view} onViewChange={setView} />

      {/* LeftPanel persists across views — clicking a topic from graph
          mode swaps the canvas's root subtree without forcing the user
          back into dialog mode. RightPanel only renders in dialog mode
          since its anchored cards are tied to the doc editor. */}
      <div
        className={
          'grid flex-1 min-h-0 ' +
          (view === 'dialog'
            ? 'grid-cols-[240px_1fr_340px]'
            : 'grid-cols-[240px_1fr]')
        }
      >
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
      </div>

      <ExplainTrigger
        topicId={selectedTopicId}
        onCreated={() => void refreshComments()}
      />
    </div>
  );
}

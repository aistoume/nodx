import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Comment, Topic } from '@nodx/models';
import { Header } from './components/Header.js';
import { LeftPanel } from './components/LeftPanel.js';
import { CenterPanel } from './components/CenterPanel.js';
import { RightPanel } from './components/RightPanel.js';
import { ExplainTrigger } from './components/ExplainTrigger.js';
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

      {view === 'dialog' ? (
        <div className="grid grid-cols-[240px_1fr_340px] flex-1 min-h-0">
          <LeftPanel
            topics={topics}
            archivedTopics={archivedTopics}
            loading={loading}
            loadError={loadError}
            selectedTopicId={selectedTopicId}
            onSelectTopic={setSelectedTopicId}
            onMutated={refreshAll}
          />
          <CenterPanel
            topic={selectedTopic}
            onMutated={refreshAll}
            onSelectTopic={setSelectedTopicId}
          />
          <RightPanel
            topic={selectedTopic}
            comments={comments}
            onMutated={refreshAll}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-ink-muted">
          <div className="text-center">
            <p className="text-sm">网络图视图将于 Week 3 接入</p>
            <p className="text-xs mt-2 opacity-70">
              Cytoscape.js + cose-bilkent 布局 + 跨支语义边
            </p>
          </div>
        </div>
      )}

      <ExplainTrigger
        topicId={selectedTopicId}
        onCreated={() => void refreshComments()}
      />
    </div>
  );
}

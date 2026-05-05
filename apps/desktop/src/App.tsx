import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Topic } from '@nodx/models';
import { Header } from './components/Header.js';
import { LeftPanel } from './components/LeftPanel.js';
import { CenterPanel } from './components/CenterPanel.js';
import { RightPanel } from './components/RightPanel.js';
import { listTopics } from './db/topics.js';

type View = 'dialog' | 'graph';

export function App() {
  const [view, setView] = useState<View>('dialog');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const fresh = await listTopics();
      setTopics(fresh);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedTopic = useMemo(
    () =>
      selectedTopicId
        ? (topics.find((t) => t.id === selectedTopicId) ?? null)
        : null,
    [topics, selectedTopicId],
  );

  return (
    <div className="flex flex-col h-full">
      <Header view={view} onViewChange={setView} />

      {view === 'dialog' ? (
        <div className="grid grid-cols-[240px_1fr_340px] flex-1 min-h-0">
          <LeftPanel
            topics={topics}
            loading={loading}
            loadError={loadError}
            selectedTopicId={selectedTopicId}
            onSelectTopic={setSelectedTopicId}
            onCreated={() => {
              void refresh();
            }}
          />
          <CenterPanel topic={selectedTopic} />
          <RightPanel topic={selectedTopic} />
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
    </div>
  );
}

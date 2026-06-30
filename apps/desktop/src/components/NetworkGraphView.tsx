/**
 * Network graph view — ComfyUI-inspired topology of the active topic subtree.
 *
 * Switched from Cytoscape + cose-bilkent to **React Flow (@xyflow/react)**:
 *   - rich React nodes (see TopicNode.tsx) instead of label-only rectangles
 *   - bezier connections + animated handles + dot grid background
 *   - built-in MiniMap + Controls (zoom / fit / lock)
 *   - dagre auto-layout for first paint; drag freely afterwards
 *   - position persistence per-topic to localStorage
 *
 * Public API unchanged: same props, same behaviour when a node is clicked
 * (single-click selects, double-click goes back to dialog).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import type { Topic } from '@nodx/models';
import { TopicNode, type TopicNodeData } from './graph/TopicNode.js';

// ============================================================================
// Subtree helpers (kept from the old Cytoscape implementation)
// ============================================================================

function findRootId(
  topicId: string,
  byId: Map<string, Topic>,
): string | null {
  let curr = byId.get(topicId);
  if (!curr) return null;
  while (curr.parentId) {
    const parent = byId.get(curr.parentId);
    if (!parent) break;
    curr = parent;
  }
  return curr.id;
}

function collectSubtree(rootId: string, topics: Topic[]): Topic[] {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const byParent = new Map<string | null, Topic[]>();
  for (const t of topics) {
    const list = byParent.get(t.parentId) ?? [];
    list.push(t);
    byParent.set(t.parentId, list);
  }
  const out: Topic[] = [];
  const visit = (id: string): void => {
    const t = byId.get(id);
    if (!t) return;
    out.push(t);
    for (const child of byParent.get(id) ?? []) visit(child.id);
  };
  visit(rootId);
  return out;
}

// ============================================================================
// Position persistence
// ============================================================================

const POSITIONS_STORAGE_KEY = 'nodx:graph-positions:v2';

interface SavedPosition {
  x: number;
  y: number;
}

function loadPositions(): Record<string, SavedPosition> {
  try {
    const raw = localStorage.getItem(POSITIONS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SavedPosition>;
  } catch {
    return {};
  }
}

function savePositions(nodes: Node[]): void {
  try {
    const all = loadPositions();
    for (const n of nodes) {
      all[n.id] = { x: n.position.x, y: n.position.y };
    }
    localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // quota / unavailable — non-fatal
  }
}

// ============================================================================
// Dagre layout
// ============================================================================

const NODE_WIDTH = 240;
const NODE_HEIGHT = 130;

function dagreLayout(topics: Topic[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',         // left-to-right tree, like ComfyUI workflows
    nodesep: 30,
    ranksep: 80,
    marginx: 40,
    marginy: 40,
  });

  const validIds = new Set(topics.map((t) => t.id));
  for (const t of topics) {
    g.setNode(t.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const t of topics) {
    if (t.parentId && validIds.has(t.parentId)) {
      g.setEdge(t.parentId, t.id);
    }
  }

  dagre.layout(g);

  const out = new Map<string, { x: number; y: number }>();
  for (const t of topics) {
    const n = g.node(t.id);
    if (n) {
      // dagre gives the center; react-flow expects top-left → adjust.
      out.set(t.id, {
        x: n.x - NODE_WIDTH / 2,
        y: n.y - NODE_HEIGHT / 2,
      });
    }
  }
  return out;
}

// ============================================================================
// Component
// ============================================================================

interface NetworkGraphViewProps {
  topics: Topic[];
  selectedTopicId: string | null;
  onSelectTopic: (id: string) => void;
  /** Called when the user wants to leave the graph view (e.g. double-clicked node). */
  onSwitchToDialog: () => void;
}

const nodeTypes: NodeTypes = { topic: TopicNode };

export function NetworkGraphView(props: NetworkGraphViewProps) {
  return (
    <ReactFlowProvider>
      <NetworkGraphInner {...props} />
    </ReactFlowProvider>
  );
}

function NetworkGraphInner({
  topics,
  selectedTopicId,
  onSelectTopic,
  onSwitchToDialog,
}: NetworkGraphViewProps) {
  const rf = useReactFlow();

  // Restrict the canvas to the selected topic's root subtree — one main
  // topic = one network. Selecting a child still shows the same canvas
  // (child shares the same root). Selecting a sibling root swaps it.
  const subtree = useMemo<Topic[]>(() => {
    if (!selectedTopicId) return [];
    const byId = new Map(topics.map((t) => [t.id, t]));
    const rootId = findRootId(selectedTopicId, byId);
    if (!rootId) return [];
    return collectSubtree(rootId, topics);
  }, [topics, selectedTopicId]);
  const rootTopic = subtree[0] ?? null;

  // Build nodes once per subtree change. Use saved positions when available;
  // fall back to fresh dagre layout for any node that lacks one.
  const [nodes, setNodes] = useState<Node<TopicNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const layoutKeyRef = useRef<string>('');

  useEffect(() => {
    const ids = subtree.map((t) => t.id).join(',');
    if (ids === layoutKeyRef.current) {
      // Only data changed (status / count / selection) — keep positions, swap data.
      setNodes((prev) =>
        prev.map((n) => {
          const t = subtree.find((x) => x.id === n.id);
          if (!t) return n;
          return { ...n, data: topicToNodeData(t, selectedTopicId) };
        }),
      );
      return;
    }
    layoutKeyRef.current = ids;

    const saved = loadPositions();
    const auto = dagreLayout(subtree);

    const newNodes: Node<TopicNodeData>[] = subtree.map((t) => {
      const pos = saved[t.id] ?? auto.get(t.id) ?? { x: 0, y: 0 };
      return {
        id: t.id,
        type: 'topic',
        position: pos,
        data: topicToNodeData(t, selectedTopicId),
        // Disable React Flow's default selection so we drive it through `isSelected` in data
        selectable: true,
        draggable: true,
      };
    });

    const validIds = new Set(subtree.map((t) => t.id));
    const newEdges: Edge[] = subtree
      .filter((t) => t.parentId && validIds.has(t.parentId))
      .map((t) => ({
        id: `e_${t.parentId}_${t.id}`,
        source: t.parentId!,
        target: t.id,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#52525b', strokeWidth: 1.5 },
      }));

    setNodes(newNodes);
    setEdges(newEdges);

    // Center on the selected node when the subtree changes.
    setTimeout(() => {
      if (selectedTopicId) {
        const target = newNodes.find((n) => n.id === selectedTopicId);
        if (target) {
          rf.setCenter(
            target.position.x + NODE_WIDTH / 2,
            target.position.y + NODE_HEIGHT / 2,
            { zoom: 0.9, duration: 400 },
          );
          return;
        }
      }
      rf.fitView({ padding: 0.2, duration: 400 });
    }, 50);
  }, [subtree, selectedTopicId, rf]);

  // Handle position drags — persist on drop.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prev) => {
        const next = applyNodeChanges(changes, prev) as Node<TopicNodeData>[];
        if (changes.some((c) => c.type === 'position' && !c.dragging)) {
          savePositions(next);
        }
        return next;
      });
    },
    [],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      onSelectTopic(node.id);
    },
    [onSelectTopic],
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      onSelectTopic(node.id);
      onSwitchToDialog();
    },
    [onSelectTopic, onSwitchToDialog],
  );

  const handleAutoLayout = useCallback(() => {
    const auto = dagreLayout(subtree);
    setNodes((prev) =>
      prev.map((n) => {
        const p = auto.get(n.id);
        return p ? { ...n, position: p } : n;
      }),
    );
    setTimeout(() => rf.fitView({ padding: 0.2, duration: 400 }), 50);
    // Also wipe the saved positions for this subtree so the auto-layout sticks.
    try {
      const all = loadPositions();
      for (const t of subtree) delete all[t.id];
      localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(all));
    } catch {
      /* non-fatal */
    }
  }, [rf, subtree]);

  if (!rootTopic) {
    return (
      <div className="h-full flex items-center justify-center text-ink-muted">
        请先在左侧选一个话题
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 relative">
      {/* Header strip — ComfyUI-style toolbar */}
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-3 text-zinc-300 text-sm">
        <span className="text-zinc-500">网络图 ·</span>
        <span className="font-semibold truncate max-w-[400px]">
          {rootTopic.title}
        </span>
        <span className="text-zinc-600 text-xs">
          {subtree.length} 节点 · {edges.length} 边
        </span>
        <button
          type="button"
          onClick={handleAutoLayout}
          className="ml-auto px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs"
          title="按层级重新排版"
        >
          ⎌ 自动整理
        </button>
        <button
          type="button"
          onClick={() => rf.fitView({ padding: 0.2, duration: 400 })}
          className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs"
        >
          ⊡ 适配窗口
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1.2}
            color="#3f3f46"
          />
          <Controls className="!bg-zinc-900 !border-zinc-700 [&_button]:!bg-zinc-900 [&_button]:!border-zinc-700 [&_button]:!text-zinc-300 [&_button:hover]:!bg-zinc-800" />
          <MiniMap
            pannable
            zoomable
            className="!bg-zinc-900 !border !border-zinc-700 !rounded-md"
            maskColor="rgba(24,24,27,0.7)"
            nodeColor={(n) => {
              const d = n.data as TopicNodeData;
              return d?.isSelected ? '#3b82f6' : '#71717a';
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}

function topicToNodeData(t: Topic, selectedId: string | null): TopicNodeData {
  return {
    title: t.title,
    status: t.status,
    isPinned: t.isPinned,
    aiSummary: t.aiSummary,
    messageCount: t.meta.messageCount,
    childCount: t.meta.childCount,
    hasOpenQuestions: t.hasOpenQuestions,
    isSelected: t.id === selectedId,
    isArchived: t.isArchived,
    isAutoRecursion: !!t.generatedByAutoRecursionRunId,
  };
}

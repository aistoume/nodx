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
  applyEdgeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import type { MaterialKind, MaterialRef, Topic } from '@nodx/models';
import { TopicNode, type TopicNodeData } from './graph/TopicNode.js';
import { MaterialNode, type MaterialNodeData } from './graph/MaterialNode.js';
import { MaterialPicker } from './graph/MaterialPicker.js';
import { SynthesisModal } from './graph/SynthesisModal.js';
import { listMaterials } from '../db/materials.js';

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
// Loaded 素材 (Material) persistence — which materials sit on which canvas.
// Keyed by root topic id (one main topic = one canvas), like positions.
// ============================================================================

const MATERIALS_STORAGE_KEY = 'nodx:graph-materials:v1';
const MAT_PREFIX = 'mat_';

interface LoadedMaterial {
  id: string;
  kind: MaterialKind;
  x: number;
  y: number;
}

function loadMaterialsStore(): Record<string, LoadedMaterial[]> {
  try {
    const raw = localStorage.getItem(MATERIALS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LoadedMaterial[]>) : {};
  } catch {
    return {};
  }
}

function saveMaterialsForRoot(rootId: string, list: LoadedMaterial[]): void {
  try {
    const all = loadMaterialsStore();
    if (list.length === 0) delete all[rootId];
    else all[rootId] = list;
    localStorage.setItem(MATERIALS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // non-fatal
  }
}

// ============================================================================
// 素材 → 思考节点 links (user-drawn edges). Keyed by root topic id.
// ============================================================================

const LINKS_STORAGE_KEY = 'nodx:graph-links:v1';

interface MaterialLink {
  materialId: string;
  topicId: string;
}

function loadLinksStore(): Record<string, MaterialLink[]> {
  try {
    const raw = localStorage.getItem(LINKS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MaterialLink[]>) : {};
  } catch {
    return {};
  }
}

function saveLinksForRoot(rootId: string, list: MaterialLink[]): void {
  try {
    const all = loadLinksStore();
    if (list.length === 0) delete all[rootId];
    else all[rootId] = list;
    localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // non-fatal
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
  /**
   * Double-clicking a 素材 node jumps to its library and focuses that exact
   * item: solution → 案例库, inspiration → 灵感池. One-way only (a material
   * can be reused across many projects, so the library never jumps back).
   */
  onOpenMaterialLibrary?: (kind: MaterialKind, materialId: string) => void;
  /** Create a fresh blank canvas — a new empty root topic with this name. */
  onRequestNewCanvas?: (name: string) => void;
}

const nodeTypes: NodeTypes = { topic: TopicNode, material: MaterialNode };

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
  onOpenMaterialLibrary,
  onRequestNewCanvas,
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
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const layoutKeyRef = useRef<string>('');

  // ── 素材 (Material) state ──────────────────────────────────────────────
  const rootId = rootTopic?.id ?? null;
  const [materialsById, setMaterialsById] = useState<Map<string, MaterialRef>>(
    new Map(),
  );
  const [loaded, setLoaded] = useState<LoadedMaterial[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(
    null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const refreshMaterials = useCallback(() => {
    listMaterials()
      .then((ms) => setMaterialsById(new Map(ms.map((m) => [m.id, m]))))
      .catch(() => {});
  }, []);
  useEffect(() => {
    refreshMaterials();
  }, [refreshMaterials]);

  // ── Material → thinking-node links + 综合 modal ─────────────────────────
  const [links, setLinks] = useState<MaterialLink[]>([]);
  const [synthTopicId, setSynthTopicId] = useState<string | null>(null);
  // 新画布 name prompt.
  const [newCanvasName, setNewCanvasName] = useState<string | null>(null);

  // Load this root's canvas materials + links when the root topic changes.
  useEffect(() => {
    setSelectedMaterialId(null);
    setLoaded(rootId ? (loadMaterialsStore()[rootId] ?? []) : []);
    setLinks(rootId ? (loadLinksStore()[rootId] ?? []) : []);
  }, [rootId]);

  // How many materials are wired into each topic (drives the 综合 button).
  const linkedCountByTopic = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of links) m.set(l.topicId, (m.get(l.topicId) ?? 0) + 1);
    return m;
  }, [links]);

  const handleSynthesize = useCallback((topicId: string) => {
    setSynthTopicId(topicId);
  }, []);

  // Draw a link when the user connects a material → a topic (either drag dir).
  const onConnect = useCallback(
    (c: Connection) => {
      if (!rootId || !c.source || !c.target) return;
      const ends = [c.source, c.target];
      const matEnd = ends.find((e) => e.startsWith(MAT_PREFIX));
      const topicEnd = ends.find((e) => !e.startsWith(MAT_PREFIX));
      if (!matEnd || !topicEnd) return; // must be material ↔ topic
      const materialId = matEnd.slice(MAT_PREFIX.length);
      setLinks((prev) => {
        if (prev.some((l) => l.materialId === materialId && l.topicId === topicEnd)) {
          return prev;
        }
        const next = [...prev, { materialId, topicId: topicEnd }];
        saveLinksForRoot(rootId, next);
        return next;
      });
    },
    [rootId],
  );

  const handleRemoveMaterial = useCallback(
    (matId: string) => {
      if (!rootId) return;
      setLoaded((prev) => {
        const next = prev.filter((m) => m.id !== matId);
        saveMaterialsForRoot(rootId, next);
        return next;
      });
      // Drop any links from this material too.
      setLinks((prev) => {
        if (!prev.some((l) => l.materialId === matId)) return prev;
        const next = prev.filter((l) => l.materialId !== matId);
        saveLinksForRoot(rootId, next);
        return next;
      });
    },
    [rootId],
  );

  const handleAddMaterial = useCallback(
    (m: MaterialRef) => {
      if (!rootId) return;
      setMaterialsById((prev) => {
        if (prev.has(m.id)) return prev;
        const next = new Map(prev);
        next.set(m.id, m);
        return next;
      });
      setLoaded((prev) => {
        if (prev.some((x) => x.id === m.id)) return prev;
        // Stack loaded materials in a column to the left of the LR tree.
        const entry: LoadedMaterial = {
          id: m.id,
          kind: m.kind,
          x: -320,
          y: 40 + prev.length * 170,
        };
        const next = [...prev, entry];
        saveMaterialsForRoot(rootId, next);
        return next;
      });
    },
    [rootId],
  );

  const buildMaterialNodes = useCallback((): Node[] => {
    return loaded.map((lm) => {
      const ref = materialsById.get(lm.id);
      const data: MaterialNodeData = {
        materialId: lm.id,
        kind: lm.kind,
        title: ref?.title ?? '（素材已删除）',
        ...(ref?.subtitle ? { subtitle: ref.subtitle } : {}),
        ...(ref?.body ? { body: ref.body } : {}),
        isSelected: selectedMaterialId === lm.id,
        onRemove: handleRemoveMaterial,
      };
      return {
        id: MAT_PREFIX + lm.id,
        type: 'material',
        position: { x: lm.x, y: lm.y },
        selectable: true,
        draggable: true,
        data,
      };
    });
  }, [loaded, materialsById, selectedMaterialId, handleRemoveMaterial]);

  const buildTopicData = useCallback(
    (t: Topic): TopicNodeData => ({
      ...topicToNodeData(t, selectedTopicId),
      linkedMaterialCount: linkedCountByTopic.get(t.id) ?? 0,
      onSynthesize: handleSynthesize,
    }),
    [selectedTopicId, linkedCountByTopic, handleSynthesize],
  );

  useEffect(() => {
    const ids = subtree.map((t) => t.id).join(',');
    if (ids === layoutKeyRef.current) {
      // Only data changed (status / selection / materials / links) — keep
      // topic positions, swap topic data, rebuild material nodes.
      setNodes((prev) => {
        const topicNodes = prev
          .filter((n) => n.type === 'topic')
          .map((n) => {
            const t = subtree.find((x) => x.id === n.id);
            return t ? { ...n, data: buildTopicData(t) } : n;
          });
        return [...topicNodes, ...buildMaterialNodes()];
      });
      return;
    }
    layoutKeyRef.current = ids;

    const saved = loadPositions();
    const auto = dagreLayout(subtree);

    const newNodes: Node[] = subtree.map((t) => {
      const pos = saved[t.id] ?? auto.get(t.id) ?? { x: 0, y: 0 };
      return {
        id: t.id,
        type: 'topic',
        position: pos,
        data: buildTopicData(t),
        selectable: true,
        draggable: true,
      };
    });

    setNodes([...newNodes, ...buildMaterialNodes()]);

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
  }, [subtree, selectedTopicId, rf, buildMaterialNodes, buildTopicData]);

  // Edges: parent→child (auto) + material→topic links (user-drawn). Rebuilt
  // whenever the tree / links / loaded materials change.
  useEffect(() => {
    const validIds = new Set(subtree.map((t) => t.id));
    const parentEdges: Edge[] = subtree
      .filter((t) => t.parentId && validIds.has(t.parentId))
      .map((t) => ({
        id: `e_${t.parentId}_${t.id}`,
        source: t.parentId!,
        target: t.id,
        type: 'smoothstep',
        animated: false,
        deletable: false,
        style: { stroke: '#52525b', strokeWidth: 1.5 },
      }));

    const loadedIds = new Set(loaded.map((m) => m.id));
    const linkEdges: Edge[] = links
      .filter((l) => loadedIds.has(l.materialId) && validIds.has(l.topicId))
      .map((l) => ({
        id: `link_${l.materialId}_${l.topicId}`,
        source: MAT_PREFIX + l.materialId,
        target: l.topicId,
        type: 'default',
        animated: true,
        deletable: true,
        style: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '5 4' },
      }));

    setEdges([...parentEdges, ...linkEdges]);
  }, [subtree, links, loaded]);

  // Handle position drags — persist on drop (topics + materials separately).
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prev) => {
        const next = applyNodeChanges(changes, prev) as Node[];
        if (changes.some((c) => c.type === 'position' && !c.dragging)) {
          savePositions(next.filter((n) => n.type === 'topic'));
          if (rootId) {
            const byGraphId = new Map(next.map((n) => [n.id, n]));
            setLoaded((prevLoaded) => {
              const updated = prevLoaded.map((lm) => {
                const node = byGraphId.get(MAT_PREFIX + lm.id);
                return node
                  ? { ...lm, x: node.position.x, y: node.position.y }
                  : lm;
              });
              saveMaterialsForRoot(rootId, updated);
              return updated;
            });
          }
        }
        return next;
      });
    },
    [rootId],
  );

  // Edge changes — persist removal of material→topic links (select an edge
  // and press Delete/Backspace). Parent-child edges are non-deletable.
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removedLinkIds = changes
        .filter((c) => c.type === 'remove' && c.id.startsWith('link_'))
        .map((c) => (c as { id: string }).id);
      if (removedLinkIds.length > 0 && rootId) {
        setLinks((prev) => {
          const next = prev.filter(
            (l) => !removedLinkIds.includes(`link_${l.materialId}_${l.topicId}`),
          );
          saveLinksForRoot(rootId, next);
          return next;
        });
      }
      setEdges((prev) => applyEdgeChanges(changes, prev));
    },
    [rootId],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      if (node.type === 'material') {
        setSelectedMaterialId((node.data as MaterialNodeData).materialId);
        return;
      }
      setSelectedMaterialId(null);
      onSelectTopic(node.id);
    },
    [onSelectTopic],
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      if (node.type === 'material') {
        // Jump to the material's library + focus that item (one-way).
        const d = node.data as MaterialNodeData;
        onOpenMaterialLibrary?.(d.kind, d.materialId);
        return;
      }
      onSelectTopic(node.id);
      onSwitchToDialog();
    },
    [onSelectTopic, onSwitchToDialog, onOpenMaterialLibrary],
  );

  const openPicker = useCallback(() => {
    refreshMaterials();
    setPickerOpen(true);
  }, [refreshMaterials]);

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

  const newCanvasModal =
    newCanvasName !== null && onRequestNewCanvas ? (
      <NewCanvasPrompt
        name={newCanvasName}
        onName={setNewCanvasName}
        onCreate={(n) => {
          setNewCanvasName(null);
          onRequestNewCanvas(n);
        }}
        onClose={() => setNewCanvasName(null)}
      />
    ) : null;

  if (!rootTopic) {
    return (
      <div className="h-full relative flex flex-col items-center justify-center gap-3 text-ink-muted">
        请先在左侧选一个话题
        {onRequestNewCanvas && (
          <button
            type="button"
            onClick={() => setNewCanvasName('')}
            className="px-3 py-1.5 rounded-md bg-emerald-600/20 text-emerald-300 border border-emerald-600/40 hover:bg-emerald-600/30 text-xs"
          >
            🆕 新建空白画布
          </button>
        )}
        {newCanvasModal}
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
          {loaded.length > 0 && ` · ${loaded.length} 素材`}
        </span>
        {onRequestNewCanvas && (
          <button
            type="button"
            onClick={() => setNewCanvasName('')}
            className="ml-auto px-2.5 py-1 rounded-md bg-emerald-600/20 text-emerald-300 border border-emerald-600/40 hover:bg-emerald-600/30 text-xs"
            title="新建一个空白话题作为画布，在上面加载素材、连线、综合"
          >
            🆕 新画布
          </button>
        )}
        <button
          type="button"
          onClick={openPicker}
          className={
            (onRequestNewCanvas ? '' : 'ml-auto ') +
            'px-2.5 py-1 rounded-md bg-amber-600/20 text-amber-300 border border-amber-600/40 hover:bg-amber-600/30 text-xs'
          }
          title="从素材库（案例库/灵感池）加载一个素材节点到画布"
        >
          ➕ 加载素材
        </button>
        <button
          type="button"
          onClick={handleAutoLayout}
          className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs"
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
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
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
              if (n.type === 'material') return '#f59e0b';
              const d = n.data as TopicNodeData;
              return d?.isSelected ? '#3b82f6' : '#71717a';
            }}
          />
        </ReactFlow>
      </div>

      {pickerOpen && (
        <MaterialPicker
          loadedIds={new Set(loaded.map((m) => m.id))}
          onPick={handleAddMaterial}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {synthTopicId && (
        <SynthesisModal
          topicId={synthTopicId}
          topicTitle={
            subtree.find((t) => t.id === synthTopicId)?.title ?? '思考节点'
          }
          materials={links
            .filter((l) => l.topicId === synthTopicId)
            .map((l) => materialsById.get(l.materialId))
            .filter((m): m is MaterialRef => !!m)}
          onDone={(id) => {
            setSynthTopicId(null);
            onSelectTopic(id);
            onSwitchToDialog();
          }}
          onClose={() => setSynthTopicId(null)}
        />
      )}

      {newCanvasModal}
    </div>
  );
}

/** Small name prompt for 新画布 — pick a name, then create the blank canvas. */
function NewCanvasPrompt({
  name,
  onName,
  onCreate,
  onClose,
}: {
  name: string;
  onName: (v: string) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const submit = () => onCreate(name.trim() || '新画布');
  return (
    <div className="absolute inset-0 z-30 flex" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/45" />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative m-auto w-[380px] rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl p-4 flex flex-col gap-3"
      >
        <p className="text-sm font-semibold">🆕 新建空白画布</p>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          给这块画布起个名字（就是话题标题）。创建后是空白的，不会自动跑 Survey；
          你可以加载素材、连线、综合，想起步时再手动跑 Survey。
        </p>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onClose();
          }}
          placeholder="例：东南亚市场进入研究"
          className="px-3 py-2 text-sm rounded-md bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-emerald-500/60"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1.5 text-xs rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition"
          >
            创建画布
          </button>
        </div>
      </div>
    </div>
  );
}

function topicToNodeData(t: Topic, selectedId: string | null) {
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
    nodeKind: t.nodeKind,
  };
}

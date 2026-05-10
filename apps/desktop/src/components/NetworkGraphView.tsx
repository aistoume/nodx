import { useEffect, useMemo, useRef } from 'react';
import cytoscape, {
  type Core,
  type ElementDefinition,
  type StylesheetCSS,
} from 'cytoscape';
// cose-bilkent ships no TS types — declare at the import
// @ts-expect-error — no @types package
import coseBilkent from 'cytoscape-cose-bilkent';
import type { Topic } from '@nodx/models';

let cytoscapeInitialised = false;
function ensureCytoscapeReady(): void {
  if (cytoscapeInitialised) return;
  cytoscape.use(coseBilkent);
  cytoscapeInitialised = true;
}

const POSITIONS_STORAGE_KEY = 'nodx:graph-positions:v1';

interface SavedPosition {
  x: number;
  y: number;
}

function loadPositions(): Map<string, SavedPosition> {
  try {
    const raw = localStorage.getItem(POSITIONS_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, SavedPosition>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function savePositions(cy: Core): void {
  try {
    const obj: Record<string, SavedPosition> = {};
    cy.nodes().forEach((n) => {
      const p = n.position();
      obj[n.id()] = { x: p.x, y: p.y };
    });
    localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // localStorage might be unavailable / quota exceeded; non-fatal
  }
}

/**
 * Find the topmost ancestor (root) of a given topic by walking parentId
 * up. Stops if a parent is missing from the active set. Returns the id
 * of the root, or null if the input id isn't in the topics list.
 */
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

/**
 * Collect a root topic plus every descendant in a single subtree.
 * Order: root first, then children depth-first (handy for header copy
 * that wants the root's title).
 */
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

/**
 * Walk the parent chain to compute each topic's depth (root = 0). Stops
 * at the first ancestor whose id isn't in the active set (defensive
 * against archived parents). Memoised inside the call so each node is
 * resolved at most once.
 */
function computeDepths(topics: Topic[]): Map<string, number> {
  const validIds = new Set(topics.map((t) => t.id));
  const parentOf = new Map(topics.map((t) => [t.id, t.parentId]));
  const memo = new Map<string, number>();
  function resolve(id: string): number {
    if (memo.has(id)) return memo.get(id)!;
    const parentId = parentOf.get(id);
    if (!parentId || !validIds.has(parentId)) {
      memo.set(id, 0);
      return 0;
    }
    const d = resolve(parentId) + 1;
    memo.set(id, d);
    return d;
  }
  for (const t of topics) resolve(t.id);
  return memo;
}

interface NetworkGraphViewProps {
  topics: Topic[];
  selectedTopicId: string | null;
  onSelectTopic: (id: string) => void;
  /** Called when the user wants to leave the graph view (e.g. clicked node). */
  onSwitchToDialog: () => void;
}

/**
 * Cytoscape-based topology of all active topics. Nodes coloured by status
 * via the four-status palette. Edges = parent-child relationships derived
 * from `Topic.parentId`. Node positions persist to localStorage so the
 * graph doesn't reshuffle every time the user comes back to this tab.
 */
export function NetworkGraphView({
  topics,
  selectedTopicId,
  onSelectTopic,
  onSwitchToDialog,
}: NetworkGraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  // Stable callback refs so the cy click handler doesn't need re-binding
  // every render.
  const callbacksRef = useRef({ onSelectTopic, onSwitchToDialog });
  useEffect(() => {
    callbacksRef.current = { onSelectTopic, onSwitchToDialog };
  });

  // Restrict the canvas to the currently-selected topic's root subtree —
  // one main topic = one network. Selecting a child still shows the same
  // canvas (child shares the same root). Selecting a sibling root swaps
  // the canvas entirely.
  const subtree = useMemo<Topic[]>(() => {
    if (!selectedTopicId) return [];
    const byId = new Map(topics.map((t) => [t.id, t]));
    const rootId = findRootId(selectedTopicId, byId);
    if (!rootId) return [];
    return collectSubtree(rootId, topics);
  }, [topics, selectedTopicId]);
  const rootTopic = subtree[0] ?? null;

  const elements = useMemo<ElementDefinition[]>(() => {
    const validIds = new Set(subtree.map((t) => t.id));
    const depths = computeDepths(subtree);
    const nodes: ElementDefinition[] = subtree.map((t) => ({
      group: 'nodes',
      data: {
        id: t.id,
        label: t.title,
        status: t.status,
        depth: depths.get(t.id) ?? 0,
        // Stash parentId on the node so the position-seeding pass can
        // place a brand-new child near its already-placed parent
        // instead of letting Cytoscape default it to (0,0) — which
        // makes the parent edge a zero-length line and the user sees
        // "no link".
        parentId: t.parentId ?? '',
        messageCount: t.meta.messageCount,
        childCount: t.meta.childCount,
      },
    }));
    const edges: ElementDefinition[] = subtree
      .filter((t) => t.parentId && validIds.has(t.parentId))
      .map((t) => ({
        group: 'edges',
        data: {
          id: `e_${t.parentId}_${t.id}`,
          source: t.parentId!,
          target: t.id,
          type: 'parent',
        },
      }));
    return [...nodes, ...edges];
  }, [subtree]);

  // Mount once.
  useEffect(() => {
    if (!containerRef.current) return;
    ensureCytoscapeReady();
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: GRAPH_STYLE,
      wheelSensitivity: 0.25,
      minZoom: 0.3,
      maxZoom: 2.5,
    });
    cyRef.current = cy;

    cy.on('tap', 'node', (evt) => {
      const id = evt.target.id();
      callbacksRef.current.onSelectTopic(id);
      callbacksRef.current.onSwitchToDialog();
    });

    // Persist positions when the user drags a node or after auto-layout.
    cy.on('dragfree', 'node', () => savePositions(cy));
    // On layout end: resize against the latest container metrics (in case
    // the container was 0×0 when cy initialised) and fit so every node
    // is in view. Then persist positions.
    cy.on('layoutstop', () => {
      cy.resize();
      cy.fit(undefined, 30);
      savePositions(cy);
    });

    // Cytoscape caches container dimensions at init. In a flex layout the
    // container can be 0×0 on first paint, in which case the initial
    // layout/fit happen against bad dimensions and edges/nodes render at
    // funky coords. A ResizeObserver makes the cy match reality.
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      observer = new ResizeObserver(() => {
        if (cyRef.current) cyRef.current.resize();
      });
      observer.observe(containerRef.current);
    }

    return () => {
      observer?.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Sync elements + run layout whenever topics change. Saved positions
  // win; only nodes without a saved position trigger a cose-bilkent pass.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const saved = loadPositions();

    // Track sibling counts per parent so we can fan brand-new children
    // out around the parent instead of stacking at (0,0).
    const siblingIndex = new Map<string, number>();
    const positionedElements: ElementDefinition[] = elements.map((el) => {
      if (el.group !== 'nodes') return el;
      const id = el.data.id;
      if (typeof id !== 'string') return el;
      const pos = saved.get(id);
      if (pos) return { ...el, position: { x: pos.x, y: pos.y } };

      // No saved position. Seed near the parent if the parent has one
      // saved, with a fan-out so siblings don't pile up. Without this,
      // Cytoscape defaults to (0,0) for every new node, the parent edge
      // becomes a zero-length line, and the relationship visually
      // disappears.
      const parentId =
        typeof el.data.parentId === 'string' && el.data.parentId
          ? el.data.parentId
          : null;
      const parentPos = parentId ? saved.get(parentId) : undefined;
      if (parentPos) {
        const idx = siblingIndex.get(parentId!) ?? 0;
        siblingIndex.set(parentId!, idx + 1);
        // Spread siblings horizontally below the parent.
        const offsetX = (idx - 1.5) * 140 + (Math.random() - 0.5) * 30;
        return {
          ...el,
          position: { x: parentPos.x + offsetX, y: parentPos.y + 180 },
        };
      }
      return el;
    });

    cy.batch(() => {
      cy.elements().remove();
      cy.add(positionedElements);
    });

    if (elements.length === 0) return;

    // Defensive resize before layout — picks up the latest container
    // dimensions if this mount happened while the grid was still settling.
    cy.resize();

    const nodeIds = elements
      .filter((el) => el.group === 'nodes')
      .map((el) => el.data.id as string);
    const allSaved = nodeIds.every((id) => saved.has(id));

    // If the root itself has no saved position, our parent-relative
    // pre-seeding produced nothing useful (every unsaved node also has
    // no saved parent to anchor against), so every node would land at
    // (0,0). cose-bilkent with randomize:false can't disambiguate
    // overlapping nodes — the result is the root invisible because it
    // overlaps with everyone or with the canvas origin. Force a fresh
    // randomized layout in that case.
    const rootId = subtree[0]?.id;
    const rootSaved = rootId != null && saved.has(rootId);

    if (allSaved) {
      // No new nodes — keep everyone exactly where they were last time.
      cy.layout({
        name: 'preset',
        fit: true,
        padding: 30,
      } as cytoscape.LayoutOptions).run();
    } else {
      cy.layout({
        name: 'cose-bilkent',
        animate: false,
        // Root not saved → fresh randomize. Root saved → keep it as
        // the anchor; pre-seeded children are refined from there.
        randomize: !rootSaved,
        nodeRepulsion: 8000,
        idealEdgeLength: 130,
        gravity: 0.35,
        fit: true,
        padding: 30,
      } as cytoscape.LayoutOptions).run();
    }
  }, [elements]);

  // Highlight the active topic.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (selectedTopicId) {
      const node = cy.getElementById(selectedTopicId);
      if (node && node.length > 0) node.select();
    }
  }, [selectedTopicId, elements]);

  return (
    <div className="flex flex-col h-full bg-canvas">
      <header className="border-b border-border px-6 py-3 bg-surface shrink-0 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-ink-muted">
            网络图 · 主话题画布
          </p>
          <p className="text-sm text-ink mt-0.5 truncate">
            {rootTopic ? (
              <>
                <span className="font-medium">{rootTopic.title}</span>
                <span className="text-ink-muted ml-2 text-xs">
                  · {subtree.length} 个话题
                </span>
              </>
            ) : (
              <span className="text-ink-muted">未选中主话题</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink-muted shrink-0">
          <Legend />
          <span className="opacity-60">点击节点 → 进入对话</span>
        </div>
      </header>
      {subtree.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-ink-muted text-sm text-center px-8">
          {topics.length === 0
            ? '还没有话题。先在左栏新建一个吧。'
            : '左栏选中一个话题，即可看它的主话题画布（包含所有子话题）。'}
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 min-h-0" />
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-2">
      <LegendDot color="#3b82f6" label="探索中" />
      <LegendDot color="#22c55e" label="已总结" />
      <LegendDot color="#a855f7" label="原子" />
      <LegendDot color="#9ca3af" label="幽灵" />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: color }}
      />
      <span>{label}</span>
    </span>
  );
}

// Per-level widths give a subtle visual hierarchy: root topics are widest,
// each nesting level shrinks slightly. Height auto-fits the (wrapped)
// label; padding keeps the text from kissing the border.
const GRAPH_STYLE: StylesheetCSS[] = [
  {
    selector: 'node',
    css: {
      label: 'data(label)',
      'text-wrap': 'wrap',
      'font-size': '12px',
      'font-family':
        '-apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif',
      'line-height': 1.3,
      color: '#1a1a1a',
      'text-valign': 'center',
      'text-halign': 'center',
      width: 'label',
      height: 'label',
      padding: '14px',
      shape: 'round-rectangle',
      'border-width': 2,
      'background-opacity': 0.9,
    },
  },
  {
    // Root topics — give the label more breathing room so longer questions
    // wrap into a comfortable rectangle rather than stretching wide.
    selector: 'node[depth = 0]',
    css: {
      'text-max-width': '180px',
      'min-width': '180px',
      'font-size': '13px',
      'font-weight': 600,
    },
  },
  {
    selector: 'node[depth = 1]',
    css: {
      'text-max-width': '150px',
      'min-width': '150px',
    },
  },
  {
    selector: 'node[depth >= 2]',
    css: {
      'text-max-width': '120px',
      'min-width': '120px',
      'font-size': '11px',
    },
  },
  {
    selector: 'node[status = "exploring"]',
    css: { 'background-color': '#dbeafe', 'border-color': '#3b82f6' },
  },
  {
    selector: 'node[status = "summarized"]',
    css: { 'background-color': '#d1fae5', 'border-color': '#22c55e' },
  },
  {
    selector: 'node[status = "atomic"]',
    css: { 'background-color': '#ede9fe', 'border-color': '#a855f7' },
  },
  {
    selector: 'node[status = "ghost"]',
    css: {
      'background-color': '#f3f4f6',
      'border-color': '#9ca3af',
      'border-style': 'dashed',
      'background-opacity': 0.6,
    },
  },
  {
    selector: 'node:selected',
    css: {
      'border-width': 4,
      'border-color': '#2c5282',
      'background-color': '#eff6fe',
    },
  },
  {
    selector: 'edge',
    css: {
      width: 1.5,
      'line-color': '#cbd5e1',
      'target-arrow-color': '#94a3b8',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.9,
      'curve-style': 'bezier',
    },
  },
];

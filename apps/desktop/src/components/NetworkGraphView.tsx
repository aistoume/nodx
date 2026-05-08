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

interface NetworkGraphViewProps {
  topics: Topic[];
  selectedTopicId: string | null;
  onSelectTopic: (id: string) => void;
  /** Called when the user wants to leave the graph view (e.g. clicked node). */
  onSwitchToDialog: () => void;
}

/**
 * Cytoscape-based topology of all active topics. Nodes coloured by status
 * via the four-status palette in `index.css`. Edges = parent-child
 * relationships derived from `Topic.parentId` (we don't query the `edges`
 * table yet — that's reserved for future cross-branch semantic edges).
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
  // every render (Cytoscape doesn't make that ergonomic).
  const callbacksRef = useRef({ onSelectTopic, onSwitchToDialog });
  useEffect(() => {
    callbacksRef.current = { onSelectTopic, onSwitchToDialog };
  });

  const elements = useMemo<ElementDefinition[]>(() => {
    const validIds = new Set(topics.map((t) => t.id));
    const nodes: ElementDefinition[] = topics.map((t) => ({
      group: 'nodes',
      data: {
        id: t.id,
        label: t.title,
        status: t.status,
        messageCount: t.meta.messageCount,
        childCount: t.meta.childCount,
      },
    }));
    const edges: ElementDefinition[] = topics
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
  }, [topics]);

  // Mount once; the elements effect updates contents on data change.
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

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Sync elements + run layout whenever topics change.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
    if (elements.length === 0) return;
    cy.layout({
      name: 'cose-bilkent',
      animate: false,
      randomize: true,
      // tuned for ~5-50 nodes; loose enough to read labels, tight enough
      // to fit on a typical viewport
      nodeRepulsion: 8000,
      idealEdgeLength: 110,
      gravity: 0.35,
      fit: true,
      padding: 30,
    } as cytoscape.LayoutOptions).run();
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
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-muted">
            网络图
          </p>
          <p className="text-sm text-ink mt-0.5">
            {topics.length} 个话题 · 父子连接显示拆解结构
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink-muted">
          <Legend />
          <span className="opacity-60">点击节点 → 进入对话</span>
        </div>
      </header>
      {topics.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-ink-muted text-sm">
          还没有话题。先在左栏新建一个吧。
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

// Stylesheet — uses data() selectors so each status maps to the right colour
// without callback functions (which Cytoscape's TS types are picky about).
const GRAPH_STYLE: StylesheetCSS[] = [
  {
    selector: 'node',
    css: {
      label: 'data(label)',
      'text-wrap': 'wrap',
      'text-max-width': '140',
      'font-size': '12px',
      'font-family':
        '-apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif',
      color: '#1a1a1a',
      'text-valign': 'center',
      'text-halign': 'center',
      width: '140px',
      height: '60px',
      shape: 'round-rectangle',
      'border-width': 2,
      'background-opacity': 0.9,
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

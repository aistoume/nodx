/**
 * CodeBlock extension that renders ```mermaid fences as live diagrams.
 *
 * The AI's thinking documents come in as markdown → HTML
 * (`<pre><code class="language-mermaid">`), which TipTap's CodeBlock parses
 * with `language: 'mermaid'`. This NodeView keeps every other language as a
 * plain code block, but for mermaid it renders the SVG below the (toggleable)
 * source so the document reads as a diagram, not code.
 *
 * Render errors fall back to showing the source with a small notice — a
 * half-written diagram while the user edits must never take the doc down.
 */
import { useEffect, useRef, useState } from 'react';
import CodeBlock from '@tiptap/extension-code-block';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import mermaid from 'mermaid';
import { useT } from '../../i18n/index.js';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'neutral',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif',
});

let renderSeq = 0;

function MermaidView(props: NodeViewProps) {
  const { t } = useT();
  const isMermaid = props.node.attrs.language === 'mermaid';
  const code = props.node.textContent;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    if (!isMermaid) return;
    if (debounce.current != null) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      const id = `nodx-mermaid-${++renderSeq}`;
      mermaid
        .render(id, code)
        .then((r) => {
          setSvg(r.svg);
          setError(null);
        })
        .catch((e) => {
          // mermaid.render leaves a dangling error element behind — clean it.
          document.getElementById(`d${id}`)?.remove();
          setError(e instanceof Error ? e.message : String(e));
        });
    }, 300);
    return () => {
      if (debounce.current != null) window.clearTimeout(debounce.current);
    };
  }, [code, isMermaid]);

  if (!isMermaid) {
    return (
      <NodeViewWrapper as="pre" className="doc-codeblock">
        <NodeViewContent as="code" />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="doc-mermaid my-3">
      <div
        contentEditable={false}
        className="flex items-center justify-between text-[11px] text-ink-muted px-1 pb-1 select-none"
      >
        <span>📊 {t('doc.mermaid.label')}</span>
        <button
          type="button"
          className="hover:text-ink transition"
          onClick={() => setShowSource((v) => !v)}
        >
          {showSource ? t('doc.mermaid.hideSource') : t('doc.mermaid.showSource')}
        </button>
      </div>
      {/* Source: kept in the document flow (editable) but visually collapsed
          unless toggled — TipTap needs NodeViewContent mounted to edit. */}
      <pre
        className={`doc-codeblock ${showSource ? '' : 'hidden'}`}
        spellCheck={false}
      >
        <NodeViewContent as="code" />
      </pre>
      <div contentEditable={false}>
        {error ? (
          <div className="text-[11px] text-red-600 bg-red-50 rounded p-2">
            {t('doc.mermaid.error')}: {error}
          </div>
        ) : svg ? (
          <div
            className="flex justify-center overflow-x-auto rounded-lg border border-border bg-white p-3"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="text-[11px] text-ink-muted p-2">…</div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

/** Drop-in replacement for StarterKit's codeBlock with mermaid rendering. */
export const MermaidCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MermaidView);
  },
});

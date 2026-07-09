import { useEffect, useState } from 'react';
import { explainSelection } from '../ai/explain.js';
import { createComment, formatExplanationContent } from '../db/comments.js';
import { useT } from '../i18n/index.js';

interface ExplainTriggerProps {
  /** Currently-selected topic. Trigger is inert when null. */
  topicId: string | null;
  /** Called after a comment is successfully created so siblings can refresh. */
  onCreated: () => void;
}

interface SelectionPos {
  x: number;
  y: number;
  text: string;
  messageId: string;
}

const MIN_SELECTION_LENGTH = 2;

/**
 * Watches document selection. When the user highlights ≥2 chars inside a
 * message bubble (`[data-message-id]`), a "解释" button floats near the
 * end of the selection. Clicking it asks Haiku and persists the result
 * as a type='explanation' comment anchored to that message.
 *
 * Mounted once at the App level — there's only one window selection per
 * window, so a single global trigger is the natural model.
 */
export function ExplainTrigger({ topicId, onCreated }: ExplainTriggerProps) {
  const { t } = useT();
  const [pos, setPos] = useState<SelectionPos | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recompute position on every selection settle (mouseup).
  useEffect(() => {
    const compute = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setPos(null);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < MIN_SELECTION_LENGTH) {
        setPos(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const startNode = range.startContainer;
      const startEl =
        startNode.nodeType === Node.ELEMENT_NODE
          ? (startNode as HTMLElement)
          : startNode.parentElement;
      const bubble = startEl?.closest('[data-message-id]');
      if (!bubble) {
        setPos(null);
        return;
      }
      const messageId = bubble.getAttribute('data-message-id');
      if (!messageId) {
        setPos(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setPos({
        x: rect.right,
        y: rect.bottom + 6,
        text,
        messageId,
      });
    };

    const onMouseUp = () => {
      // Run after the browser settles the selection.
      window.setTimeout(compute, 0);
    };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, []);

  // Click outside the button (and outside any new selection) clears the popup.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-explain-button]')) return;
      setPos(null);
      setError(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  if (!pos || !topicId) return null;

  const handleClick = async () => {
    if (pending) return;
    const snapshot = pos;
    setPending(true);
    setError(null);
    try {
      const r = await explainSelection(snapshot.text);
      await createComment({
        topicId,
        anchorId: snapshot.messageId,
        type: 'explanation',
        content: formatExplanationContent(snapshot.text, r.explanation),
      });
      window.getSelection()?.removeAllRanges();
      setPos(null);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  // Anchor near the selection end. clamp to viewport so we don't slip off-screen.
  const left = Math.max(8, Math.min(window.innerWidth - 220, pos.x));
  const top = Math.max(8, Math.min(window.innerHeight - 80, pos.y));

  return (
    <div
      data-explain-button
      style={{ position: 'fixed', left, top, zIndex: 50 }}
      // preventDefault on mousedown stops the button from stealing focus,
      // which would clear the user's selection before our click fires.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="px-3 py-1.5 rounded-md text-xs font-medium shadow-md bg-accent text-white hover:opacity-90 disabled:opacity-60 transition flex items-center gap-1.5"
      >
        {pending ? (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" />
            <span>{t('explainTrigger.explaining')}</span>
          </>
        ) : (
          <>
            <span>{t('explainTrigger.label')}</span>
            <span className="opacity-70 text-[10px]">{t('explainTrigger.jump')}</span>
          </>
        )}
      </button>
      {error && (
        <div className="mt-1 max-w-[260px] text-[11px] bg-red-50 text-red-700 border border-red-200 rounded-md px-2 py-1 shadow-md">
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * PopoverApp — the floating panel shown after ⌥+E fires from another app.
 *
 * UX flow:
 *   1. Rust captures selection → emits 'system-capture' event with {text}
 *   2. We show "Connecting…" then stream the AI explanation in
 *   3. User can:
 *      - 🎯 Save to 灵感池 (creates an Attention row in the local DB)
 *      - ✕ Close (just hides the window; no save)
 *
 * The explain path reuses the same `explainSelection` Haiku call the
 * 灵感池's ✨ button uses, so the prompt + JSON-schema validation is
 * already battle-tested.
 */

import { useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { explainSelection } from '../ai/explain.js';
import { createAttention } from '../db/attentions.js';
import { useT } from '../i18n/index.js';

type Phase = 'idle' | 'loading' | 'done' | 'error' | 'no-permission';

interface CapturedSnippet {
  text: string;
  captured_at: number;
}

export function PopoverApp() {
  const { t } = useT();
  const [snippet, setSnippet] = useState<string>('');
  const [explanation, setExplanation] = useState<string>('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  // ── Wire the Rust → frontend events ──────────────────────────────────
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    listen<CapturedSnippet>('system-capture', (event) => {
      // New capture — clear previous state, start fresh.
      const text = (event.payload?.text ?? '').trim();
      if (!text) return;
      setSnippet(text);
      setExplanation('');
      setError(null);
      setSavedId(null);
      void runExplain(text);
    }).then((fn) => unlisteners.push(fn));

    listen('system-capture-permission-required', () => {
      setPhase('no-permission');
      setError(null);
    }).then((fn) => unlisteners.push(fn));

    return () => {
      unlisteners.forEach((u) => u());
      inFlight.current?.abort();
    };
  }, []);

  // ── Allow ESC to close the popover ───────────────────────────────────
  //
  // Use document + capture phase so we catch the key BEFORE any input /
  // textarea inside the popover swallows it. Also abort any in-flight AI
  // request so the user can ESC out of a slow streaming response.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        // Cancel any pending AI call so the user actually feels the cancel.
        inFlight.current?.abort();
        inFlight.current = null;
        void getCurrentWindow().hide();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  // ── Self-focus when the window becomes visible ──────────────────────
  //
  // macOS sometimes hands focus back to the previous app even after we
  // show + set_focus from Rust. Without focus the keydown listener above
  // never fires. Grab focus on mount and whenever a new capture arrives.
  useEffect(() => {
    const grabFocus = () => {
      try {
        window.focus();
        // Body needs an actual focusable target for keydown to dispatch
        // on some macOS WebKit builds.
        document.body.setAttribute('tabindex', '-1');
        document.body.focus();
      } catch {
        /* harmless if blocked */
      }
    };
    grabFocus();
    // Also re-grab whenever the popover regains visibility.
    const onVis = () => {
      if (!document.hidden) grabFocus();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [snippet]);

  async function runExplain(text: string) {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;

    setPhase('loading');
    try {
      const r = await explainSelection(text);
      if (ctrl.signal.aborted) return;
      setExplanation(r.explanation);
      setPhase('done');
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    } finally {
      inFlight.current = null;
    }
  }

  async function saveToPool() {
    if (!snippet) return;
    try {
      const attention = await createAttention({
        text: snippet,
        explanation: explanation || undefined,
        // No URL/title available — this is a system-wide capture.
        sourceUrl: '',
        sourceTitle: '',
        sourceKind: 'lens-mac',
        kind: explanation ? 'explain' : 'quick',
        capturedAt: Date.now(),
      });
      setSavedId(attention.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Cancel + close convenience for the loading state
  const cancelAndClose = () => {
    inFlight.current?.abort();
    inFlight.current = null;
    void getCurrentWindow().hide();
  };

  return (
    <div
      className="h-screen w-screen flex flex-col bg-surface text-ink overflow-hidden"
      onClick={() => {
        // Click anywhere → ensure we own focus so ESC works next time.
        try { window.focus(); document.body.focus(); } catch { /* */ }
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
        <span className="text-[12px] font-semibold tracking-wide text-accent">
          {t('popover.title')}
        </span>
        <span className="text-[10px] text-ink-muted">⌥+E</span>
        {phase === 'loading' && (
          <button
            type="button"
            onClick={cancelAndClose}
            className="text-[10px] px-1.5 py-0.5 rounded text-rose-600 hover:bg-rose-50 font-medium"
            title={t('popover.cancel')}
          >
            {t('popover.cancel')}
          </button>
        )}
        <button
          type="button"
          onClick={cancelAndClose}
          className="ml-auto text-ink-muted hover:text-ink text-[14px] w-5 h-5 flex items-center justify-center rounded hover:bg-canvas"
          title={t('popover.close')}
        >
          ✕
        </button>
      </div>

      {/* Snippet quote — only when we have content */}
      {snippet && (
        <div className="px-3 py-2 border-b border-border bg-canvas/40">
          <div className="text-[11px] text-ink-muted mb-1">{t('popover.snippetLabel')}</div>
          <blockquote className="text-[12px] text-ink line-clamp-3 border-l-2 border-accent/40 pl-2 italic">
            {snippet}
          </blockquote>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {phase === 'idle' && !snippet && (
          <div className="h-full flex items-center justify-center text-center text-ink-muted text-[12px]">
            {t('popover.emptyHint')}
          </div>
        )}

        {phase === 'no-permission' && (
          <div className="text-[12px] leading-relaxed">
            <div className="font-semibold text-rose-600 mb-2">{t('popover.permTitle')}</div>
            <p className="text-ink-muted mb-2">{t('popover.permBody')}</p>
            <p className="text-ink-muted">{t('popover.permAction')}</p>
          </div>
        )}

        {phase === 'loading' && (
          <div className="flex items-center gap-2 text-[12px] text-ink-muted">
            <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            {t('popover.loading', {
              preview: snippet.slice(0, 30) + (snippet.length > 30 ? '…' : ''),
            })}
          </div>
        )}

        {phase === 'error' && error && (
          <div className="text-[12px]">
            <div className="font-semibold text-rose-600 mb-1">{t('popover.errorTitle')}</div>
            <div className="text-rose-500 break-words mb-2">{error}</div>
            <button
              type="button"
              onClick={() => void runExplain(snippet)}
              className="text-accent hover:underline"
            >
              {t('popover.retry')}
            </button>
          </div>
        )}

        {phase === 'done' && (
          <div className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap">
            {explanation}
          </div>
        )}
      </div>

      {/* Footer actions */}
      {(phase === 'done' || phase === 'error') && snippet && (
        <div className="px-3 py-2 border-t border-border flex items-center gap-2 shrink-0 bg-canvas/40">
          {savedId ? (
            <span className="text-[11px] text-emerald-600 font-medium">
              {t('popover.savedToPool')}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void saveToPool()}
              className="text-[11px] px-2.5 py-1 rounded-md bg-accent text-white hover:opacity-90 font-medium"
            >
              {t('popover.saveToPool')}
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              if (explanation) {
                try {
                  await navigator.clipboard.writeText(explanation);
                } catch {
                  /* clipboard might be blocked — non-fatal */
                }
              }
            }}
            className="text-[11px] px-2.5 py-1 rounded-md border border-border hover:border-accent text-ink-muted hover:text-ink"
          >
            {t('popover.copy')}
          </button>
          <span className="ml-auto text-[10px] text-ink-muted italic">
            {t('popover.escHint')}
          </span>
        </div>
      )}
    </div>
  );
}

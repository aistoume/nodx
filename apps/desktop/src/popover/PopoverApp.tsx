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
import {
  executeDirective,
  fetchOsGrounding,
  runOsInstruction,
  type OsDirective,
  type OsGrounding,
} from '../ai/os-dispatch.js';
import { createAttention } from '../db/attentions.js';
import { useT } from '../i18n/index.js';

type Phase = 'idle' | 'loading' | 'done' | 'error' | 'no-permission';

/** 30-day per-action-kind "don't ask again" allowlist (localStorage). */
const ALLOW_KEY = 'nodx:os-exec-allow:v1';
const ALLOW_TTL_MS = 30 * 24 * 3600 * 1000;

function isKindAllowed(kind: OsDirective['action']): boolean {
  try {
    const map = JSON.parse(localStorage.getItem(ALLOW_KEY) ?? '{}') as Record<string, number>;
    return typeof map[kind] === 'number' && Date.now() - map[kind]! < ALLOW_TTL_MS;
  } catch {
    return false;
  }
}

function allowKind(kind: OsDirective['action']): void {
  try {
    const map = JSON.parse(localStorage.getItem(ALLOW_KEY) ?? '{}') as Record<string, number>;
    map[kind] = Date.now();
    localStorage.setItem(ALLOW_KEY, JSON.stringify(map));
  } catch {
    /* non-fatal */
  }
}

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

  // ── ✏️ instruct state (docs/desktop-os-actions.md M-A) ────────────────
  const [instructText, setInstructText] = useState('');
  const [instructBusy, setInstructBusy] = useState(false);
  const [pendingDirective, setPendingDirective] = useState<OsDirective | null>(null);
  const [execStatus, setExecStatus] = useState<string | null>(null);
  const [instructAnswer, setInstructAnswer] = useState<string | null>(null);
  const grounding = useRef<OsGrounding>({ apps: [], shortcuts: [] });

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
      setInstructText('');
      setPendingDirective(null);
      setExecStatus(null);
      setInstructAnswer(null);
      void runExplain(text);
      // Refresh the OS grounding table in the background so an instruct
      // typed a moment later sees the current running apps + Shortcuts.
      void fetchOsGrounding().then((g) => {
        grounding.current = g;
      });
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

  async function runInstruct() {
    const instruction = instructText.trim();
    if (!instruction || !snippet || instructBusy) return;
    setInstructBusy(true);
    setExecStatus(null);
    setInstructAnswer(null);
    setPendingDirective(null);
    try {
      const r = await runOsInstruction(instruction, snippet, grounding.current);
      if (r.directive) {
        if (isKindAllowed(r.directive.action)) {
          await doExecute(r.directive);
        } else {
          setPendingDirective(r.directive);
        }
      } else {
        setInstructAnswer(r.answer ?? '');
      }
    } catch (err) {
      setExecStatus(
        t('popover.executedFail', { err: err instanceof Error ? err.message : String(err) }),
      );
    } finally {
      setInstructBusy(false);
    }
  }

  async function doExecute(d: OsDirective, alsoAllow = false) {
    setPendingDirective(null);
    if (alsoAllow) allowKind(d.action);
    try {
      const note = await executeDirective(d);
      setExecStatus(t('popover.executedOk', { note }));
    } catch (err) {
      setExecStatus(
        t('popover.executedFail', { err: err instanceof Error ? err.message : String(err) }),
      );
    }
  }

  const directiveLabel = (d: OsDirective): [string, string] => {
    switch (d.action) {
      case 'open_url':
        return [t('popover.actOpenUrl'), d.url];
      case 'open_app':
        return [t('popover.actOpenApp'), d.app];
      case 'run_shortcut':
        return [t('popover.actRunShortcut'), d.name];
    }
  };

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

        {/* ✏️ instruct outcomes */}
        {instructAnswer !== null && (
          <div className="mt-3 pt-2 border-t border-border">
            <div className="text-[11px] text-accent font-semibold mb-1">
              {t('popover.instructAnswer')}
            </div>
            <div className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap">
              {instructAnswer}
            </div>
          </div>
        )}
        {execStatus && (
          <div className="mt-3 pt-2 border-t border-border text-[12px] text-ink">
            {execStatus}
          </div>
        )}

        {/* ⚡ execution confirmation card */}
        {pendingDirective && (
          <div className="mt-3 rounded-lg border-2 border-amber-400/70 bg-amber-50/60 p-2.5">
            <div className="text-[11px] font-bold text-amber-700 mb-1.5">
              {t('popover.confirmTitle')}
            </div>
            {(() => {
              const [kind, target] = directiveLabel(pendingDirective);
              return (
                <div className="text-[12px] text-ink mb-1">
                  <span className="font-semibold">{kind}</span>
                  <span className="mx-1 text-ink-muted">→</span>
                  <span className="break-all">{target}</span>
                </div>
              );
            })()}
            {pendingDirective.action === 'run_shortcut' && pendingDirective.input && (
              <div className="text-[11px] text-ink-muted mb-1 line-clamp-2">
                {t('popover.actInput')}: {pendingDirective.input}
              </div>
            )}
            {pendingDirective.note && (
              <div className="text-[11px] text-ink-muted italic mb-2">{pendingDirective.note}</div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void doExecute(pendingDirective)}
                className="text-[11px] px-2.5 py-1 rounded-md bg-amber-500 text-white hover:opacity-90 font-semibold"
              >
                {t('popover.confirmExec')}
              </button>
              <button
                type="button"
                onClick={() => void doExecute(pendingDirective, true)}
                className="text-[10px] px-2 py-1 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-100"
                title={t('popover.confirmSkipKind')}
              >
                {t('popover.confirmSkipKind')}
              </button>
              <button
                type="button"
                onClick={() => setPendingDirective(null)}
                className="ml-auto text-[11px] px-2 py-1 rounded-md text-ink-muted hover:text-ink"
              >
                {t('popover.confirmCancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ✏️ instruct input — always available once there's a snippet */}
      {snippet && phase !== 'no-permission' && (
        <div className="px-3 py-2 border-t border-border flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={instructText}
            onChange={(e) => setInstructText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runInstruct();
            }}
            placeholder={t('popover.instructPlaceholder')}
            disabled={instructBusy}
            className="flex-1 text-[12px] px-2 py-1.5 rounded-md border border-border bg-surface focus:border-accent outline-none placeholder:text-ink-muted/70"
          />
          <button
            type="button"
            onClick={() => void runInstruct()}
            disabled={instructBusy || !instructText.trim()}
            className="text-[11px] px-2.5 py-1.5 rounded-md bg-accent text-white font-medium disabled:opacity-40"
          >
            {instructBusy ? (
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              t('popover.instructRun')
            )}
          </button>
        </div>
      )}

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

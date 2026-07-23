/**
 * nodx Lens — the standalone desktop pet.
 *
 * Always-on-top bubble that expands into a mini AI panel: 84×84 bubble,
 * 220×220 action wheel, 380×460 card. Self-contained — the AI call runs
 * in Rust against the user's own provider key from the OS keychain; no
 * nodx desktop required.
 *
 * Interaction contract (kept deliberately boring):
 *   - click bubble        → expand card
 *   - drag bubble         → move the pet anywhere (position persisted)
 *   - right-click bubble  → hide pet (re-show from the tray 🐣 menu)
 *   - card header         → drag to move (position persisted)
 *   - ▾ in card           → collapse back to bubble
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
} from '@tauri-apps/api/window';
import { applyDir, t } from './i18n';
import { loadWheel, SPOKE_COLORS, type WheelConfig, type WheelSpoke } from './wheel';

type Provider = 'anthropic' | 'openai' | 'gemini';
const PROVIDER_KEY = 'nodx-pet-provider';

const BUBBLE = { w: 84, h: 84 };
const WHEEL = { w: 220, h: 220 };
const CARD = { w: 380, h: 460 };
const POS_KEY = 'nodx-pet-pos';

const IS_MAC = navigator.userAgent.includes('Mac');

type Shot = { b64: string } | null;

/**
 * Resize the pet window while keeping its CENTRE fixed — the wheel has to
 * bloom around the bubble, not grow down-right from its top-left corner.
 */
async function resize(w: number, h: number) {
  const win = getCurrentWindow();
  try {
    const [pos, size, sf] = await Promise.all([
      win.outerPosition(),
      win.outerSize(),
      win.scaleFactor(),
    ]);
    const cx = pos.x + size.width / 2;
    const cy = pos.y + size.height / 2;
    await win.setSize(new LogicalSize(w, h));
    await win.setPosition(
      new PhysicalPosition(
        Math.round(cx - (w * sf) / 2),
        Math.round(cy - (h * sf) / 2),
      ),
    );
  } catch {
    await win.setSize(new LogicalSize(w, h));
  }
}

type View = 'bubble' | 'wheel' | 'card';

export function PetApp() {
  const [view, setView] = useState<View>('bubble');
  const [shot, setShot] = useState<Shot>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [wheel, setWheel] = useState<WheelConfig>(loadWheel);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [hasKey, setHasKey] = useState(true);
  const [clipText, setClipText] = useState<string | null>(null);
  const answerRef = useRef<HTMLDivElement | null>(null);
  const askRef = useRef<HTMLTextAreaElement | null>(null);

  const grabClipboard = useCallback(async () => {
    setError(null);
    const clip = await invoke<string>('pet_read_clipboard');
    if (clip) {
      setClipText(clip);
      setTurns([]);
    } else {
      setError(t('clipEmpty'));
    }
  }, []);

  // Provider + key live in the OS keychain (Rust side); the chosen
  // provider id is a plain local preference.
  // Provider / key / wheel all live in the settings window; re-read them
  // whenever it says something changed.
  const reloadConfig = useCallback(() => {
    const p = (localStorage.getItem(PROVIDER_KEY) as Provider | null) ?? 'anthropic';
    setProvider(p);
    setWheel(loadWheel());
    void invoke<boolean>('pet_key_has', { provider: p }).then(setHasKey).catch(() => {});
  }, []);

  useEffect(() => {
    applyDir();
    reloadConfig();
    const un = listen('pet://config', () => reloadConfig());
    return () => {
      void un.then((f) => f());
    };
  }, [reloadConfig]);



  // Bubble drag: distinguish a click (→ expand) from a drag (→ move the
  // window). We start the native drag once the pointer moves past a small
  // threshold; a release without movement counts as a click.
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const onBubbleDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return; // left button only
    downAt.current = { x: e.clientX, y: e.clientY };
    draggedRef.current = false;
  }, []);
  const onBubbleMove = useCallback((e: React.PointerEvent) => {
    if (!downAt.current || draggedRef.current) return;
    const dx = e.clientX - downAt.current.x;
    const dy = e.clientY - downAt.current.y;
    if (Math.hypot(dx, dy) > 4) {
      draggedRef.current = true;
      void getCurrentWindow().startDragging();
    }
  }, []);
  // Single click → action wheel (pre-loaded with the current selection if
  // there is one). Double click → straight to region capture. We delay the
  // single-click action by one double-click window so the two don't fight.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openWheel = useCallback(async () => {
    try {
      const sel = await invoke<string | null>('pet_grab_selection');
      if (sel && sel.trim()) {
        setClipText(sel.trim());
        setTurns([]);
        setShot(null);
      }
    } catch {
      /* Accessibility not granted — the wheel still works, just no text */
    }
    await showWheel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onBubbleClick = useCallback((e: React.MouseEvent) => {
    downAt.current = null;
    if (draggedRef.current) {
      draggedRef.current = false; // was a drag, not a click
      return;
    }
    if (e.detail >= 2) return; // handled by onDoubleClick
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      void openWheel();
    }, 240);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openWheel]);

  const onBubbleDoubleClick = useCallback(() => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    void (async () => {
      await expand();
      await captureRegion();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Restore / persist window position ─────────────────────────────
  useEffect(() => {
    const win = getCurrentWindow();
    const saved = localStorage.getItem(POS_KEY);
    if (saved) {
      // Stored value is the CENTRE (see below) — place the bubble around it.
      void (async () => {
        try {
          const { cx, cy } = JSON.parse(saved) as { cx: number; cy: number };
          const sf = await win.scaleFactor();
          await win.setPosition(
            new PhysicalPosition(
              Math.round(cx - (BUBBLE.w * sf) / 2),
              Math.round(cy - (BUBBLE.h * sf) / 2),
            ),
          );
        } catch {
          /* corrupt — ignore */
        }
      })();
    }
    let t: ReturnType<typeof setTimeout> | undefined;
    const unlisten = win.onMoved(({ payload }) => {
      clearTimeout(t);
      // Persist the centre, not the corner: the window changes size as the
      // pet morphs, so a corner would drift on every expand/collapse.
      t = setTimeout(() => {
        void (async () => {
          const size = await win.outerSize();
          localStorage.setItem(
            POS_KEY,
            JSON.stringify({
              cx: payload.x + size.width / 2,
              cy: payload.y + size.height / 2,
            }),
          );
        })();
      }, 300);
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  // ── ⌥+E wake: Rust grabbed the selection, hand it to the question bar ─
  useEffect(() => {
    const un = listen<string | null>('pet://wake', async (e) => {
      const sel = (e.payload ?? '').trim();
      if (sel) {
        setClipText(sel);
        setShot(null);
        setTurns([]);
        setError(null);
      }
      await resize(CARD.w, CARD.h);
      setView('card');
      // Ready to type immediately — that's the point of the shortcut.
      setTimeout(() => askRef.current?.focus(), 60);
    });
    return () => {
      void un.then((f) => f());
    };
  }, []);


  // ── ⌥+W: jump straight into region capture ────────────────────────
  useEffect(() => {
    const un = listen('pet://shoot', async () => {
      setClipText(null);
      setTurns([]);
      setError(null);
      await resize(CARD.w, CARD.h);
      setView('card');
      await captureRegion();
    });
    return () => {
      void un.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expand = useCallback(async () => {
    await resize(CARD.w, CARD.h);
    setView('card');
  }, []);

  const collapse = useCallback(async () => {
    setView('bubble');
    setClipText(null);
    setShot(null);
    await resize(BUBBLE.w, BUBBLE.h);
  }, []);

  const showWheel = useCallback(async () => {
    await resize(WHEEL.w, WHEEL.h);
    setView('wheel');
  }, []);

  const hidePet = useCallback(() => {
    void invoke('pet_hide');
  }, []);

  // ── Screenshot flow ────────────────────────────────────────────────
  const captureRegion = useCallback(async () => {
    setError(null);
    try {
      // The crosshair covers the whole screen — get the card out of the way.
      const win = getCurrentWindow();
      await win.hide();
      const b64 = await invoke<string | null>('pet_capture_region');
      await win.show();
      if (b64) {
        setShot({ b64 });
        setTurns([]);
      }
    } catch (e) {
      await getCurrentWindow().show();
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // ── Ask (with or without the screenshot) ───────────────────────────
  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setTurns([]);
    try {
      // First turn carries the quoted context; follow-ups are plain so the
      // model doesn't get the same block re-pasted every round.
      const first = turns.length === 0;
      const content = first && clipText
        ? `${t('quotedAbout')}${q}\n\n"""\n${clipText}\n"""`
        : q;
      const thread = [...turns, { role: 'user' as const, text: content }];
      setTurns([...turns, { role: 'user', text: q }]);
      setQuestion('');
      const text = await invoke<string>('pet_ask', {
        provider,
        thread: thread.map((t) => ({ role: t.role, content: t.text })),
        imageB64: shot ? shot.b64 : null,
      });
      setTurns((prev) => [...prev, { role: 'assistant', text }]);
      requestAnimationFrame(() =>
        answerRef.current?.scrollTo(0, answerRef.current.scrollHeight),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('NO_KEY')) {
        setError(t('needKeyMsg'));
        void invoke('pet_open_settings');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [question, busy, shot, clipText, provider, turns]);

  // ── Wheel actions — driven by the user's saved config ─────────────
  const runSpoke = useCallback(
    async (spoke: WheelSpoke) => {
      switch (spoke.kind) {
        case 'prompt': {
          setQuestion(spoke.param);
          await expand();
          setTimeout(() => void ask(), 0);
          break;
        }
        case 'search': {
          const q = clipText ?? '';
          await collapse();
          void invoke('pet_open_url', {
            url: spoke.param + encodeURIComponent(q),
          });
          break;
        }
        case 'shot': {
          await expand();
          await captureRegion();
          break;
        }
        case 'cli': {
          const input = clipText ?? '';
          await expand();
          setTurns([{ role: 'user', text: `▷ ${spoke.label || t('runCmd')}` }]);
          setBusy(true);
          setError(null);
          try {
            const out = await invoke<string>('pet_run_cli', {
              template: spoke.param,
              input,
            });
            setTurns((prev) => [...prev, { role: 'assistant', text: out || t('noOutput') }]);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
          break;
        }
        case 'ask':
        default:
          await expand();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ask, clipText],
  );

  // ── Bubble ─────────────────────────────────────────────────────────
  if (view === 'bubble') {
    return (
      <div className="pet-bubble-wrap">
        <button
          className="pet-bubble"
          title={t('bubbleTitle')}
          onPointerDown={onBubbleDown}
          onPointerMove={onBubbleMove}
          onClick={onBubbleClick}
          onDoubleClick={onBubbleDoubleClick}
          onContextMenu={(e) => {
            e.preventDefault();
            hidePet();
          }}
        >
          <img className="pet-star" src="/star.png" alt="nodx" draggable={false} />
        </button>
      </div>
    );
  }

  // ── Wheel ──────────────────────────────────────────────────────────
  if (view === 'wheel') {
    const POS = ['up', 'right', 'down', 'left'] as const;
    return (
      <div className="pet-wheel-wrap">
        {wheel.spokes.map((sp, i) => (
          <button
            key={i}
            className={`pet-spoke ${POS[i]}`}
            style={{ background: SPOKE_COLORS[i] }}
            title={sp.label}
            onClick={() => void runSpoke(sp)}
          >
            {sp.emoji || '❓'}
            <em>{sp.label}</em>
          </button>
        ))}
        <button className="pet-wheel-center" title={t('cancel')} onClick={() => void collapse()}>
          ✕
        </button>
      </div>
    );
  }

  // ── Card ───────────────────────────────────────────────────────────
  return (
    <div className="pet-card">
      <header className="pet-head" data-tauri-drag-region>
        <span className="pet-head-title" data-tauri-drag-region>
          🐣 nodx
        </span>
        <button
          className={`pet-ic${hasKey ? '' : ' warn'}`}
          title={hasKey ? t('settingsTitle') : t('needKeyTitle')}
          onClick={() => void invoke('pet_open_settings')}
        >
          ⚙
        </button>
        <button className="pet-ic" title={t('collapse')} onClick={() => void collapse()}>
          ▾
        </button>
        <button className="pet-ic" title={t('hidePet')} onClick={hidePet}>
          ✕
        </button>
      </header>

      <div className="pet-body">
        <div className="pet-src-row">
          {IS_MAC && (
            <button className="pet-shot-btn" onClick={() => void captureRegion()} disabled={busy}>
              📸 {shot ? t('shotBtnAgain') : t('shotBtn')}
            </button>
          )}
          <button className="pet-shot-btn ghost" onClick={() => void grabClipboard()} disabled={busy}>
            📋 {clipText ? t('clipBtnAgain') : t('clipBtn')}
          </button>
        </div>
        {shot && (
          <div className="pet-thumb-row">
            <img className="pet-thumb" src={`data:image/png;base64,${shot.b64}`} alt={t('shotBtn')} />
            <button className="pet-ic" title={t('removeShot')} onClick={() => setShot(null)}>
              ✕
            </button>
          </div>
        )}
        {clipText && (
          <div className="pet-clip-row">
            <span className="pet-clip-text" title={clipText}>“{clipText}”</span>
            <button className="pet-ic" title={t('removeText')} onClick={() => setClipText(null)}>
              ✕
            </button>
          </div>
        )}

        <div className="pet-ask-row">
          <textarea
            ref={askRef}
            rows={2}
            value={question}
            disabled={busy}
            placeholder={
              shot
                ? t('phShot')
                : clipText
                  ? t('phClip')
                  : turns.length > 0
                  ? t('phFollow')
                  : t('phFree')
            }
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void ask();
              }
            }}
          />
          <button className="pet-ask-btn" disabled={busy || !question.trim()} onClick={() => void ask()}>
            {busy ? '…' : t('askBtn')}
          </button>
        </div>

        {error && <div className="pet-err">{error}</div>}
        {turns.length > 0 && (
          <div className="pet-thread" ref={answerRef}>
            {turns.map((turn, i) => (
              <div key={i} className={`pet-turn ${turn.role}`}>
                {turn.text}
                {turn.role === 'assistant' && (
                  <button
                    className="pet-ic pet-copy"
                    title={t('copy')}
                    onClick={() => void navigator.clipboard.writeText(turn.text)}
                  >
                    📋
                  </button>
                )}
              </div>
            ))}
            {busy && <div className="pet-turn assistant pending">…</div>}
          </div>
        )}
      </div>
    </div>
  );
}

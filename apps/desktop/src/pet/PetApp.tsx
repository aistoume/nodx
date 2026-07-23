/**
 * 桌宠 (desktop pet) — the always-on-top bubble that expands into a mini
 * AI panel. Two window sizes: a 84×84 bubble, and a 380×460 card with
 * screenshot-Q&A / quick-ask. Runs in its own Tauri window ("pet") and
 * talks to the in-proc gateway exactly like the main app.
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
import {
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
} from '@tauri-apps/api/window';
import { completeText, MODELS } from '@nodx/ai';
import { getGatewayConfig, AiNotConfiguredError } from '../ai/gateway';

const BUBBLE = { w: 84, h: 84 };
const CARD = { w: 380, h: 460 };
const POS_KEY = 'nodx-pet-pos';

const IS_MAC = navigator.userAgent.includes('Mac');

type Shot = { b64: string } | null;

async function resize(w: number, h: number) {
  await getCurrentWindow().setSize(new LogicalSize(w, h));
}

export function PetApp() {
  const [expanded, setExpanded] = useState(false);
  const [shot, setShot] = useState<Shot>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [petOnly, setPetOnly] = useState(false);
  const answerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void invoke<boolean>('pet_only_get').then(setPetOnly).catch(() => {});
  }, []);

  const togglePetOnly = useCallback(() => {
    const next = !petOnly;
    setPetOnly(next);
    void invoke('pet_only_set', { on: next });
  }, [petOnly]);

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
  const onBubbleClick = useCallback(() => {
    downAt.current = null;
    if (draggedRef.current) {
      draggedRef.current = false; // was a drag, not a click
      return;
    }
    void expand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Restore / persist window position ─────────────────────────────
  useEffect(() => {
    const win = getCurrentWindow();
    const saved = localStorage.getItem(POS_KEY);
    if (saved) {
      try {
        const { x, y } = JSON.parse(saved) as { x: number; y: number };
        void win.setPosition(new PhysicalPosition(x, y));
      } catch {
        /* corrupt — ignore */
      }
    }
    let t: ReturnType<typeof setTimeout> | undefined;
    const unlisten = win.onMoved(({ payload }) => {
      clearTimeout(t);
      t = setTimeout(() => {
        localStorage.setItem(POS_KEY, JSON.stringify({ x: payload.x, y: payload.y }));
      }, 300);
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  const expand = useCallback(async () => {
    await resize(CARD.w, CARD.h);
    setExpanded(true);
  }, []);

  const collapse = useCallback(async () => {
    setExpanded(false);
    await resize(BUBBLE.w, BUBBLE.h);
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
        setAnswer(null);
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
    setAnswer(null);
    try {
      const cfg = await getGatewayConfig();
      const res = await completeText(cfg, {
        prompt: q,
        system:
          'You are nodx pet, a tiny desktop assistant. Answer concisely (2–6 sentences unless asked for more). If an image is attached, answer about the exact pixels shown, quoting visible text/numbers exactly. Reply in the language of the question.',
        model: shot ? MODELS.sonnet : MODELS.haiku,
        maxTokens: 1024,
        ...(shot ? { imageBase64: shot.b64, imageMime: 'image/png' } : {}),
      });
      setAnswer(res.text);
      requestAnimationFrame(() => answerRef.current?.scrollTo(0, 0));
    } catch (e) {
      if (e instanceof AiNotConfiguredError) {
        setError('还没配 AI key — 点「打开 nodx」→ ⚙ 设置里填一次即可。');
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }, [question, busy, shot]);

  // ── Bubble ─────────────────────────────────────────────────────────
  if (!expanded) {
    return (
      <div className="pet-bubble-wrap">
        <button
          className="pet-bubble"
          title="nodx — 点击展开 · 拖动移动 · 右键隐藏"
          onPointerDown={onBubbleDown}
          onPointerMove={onBubbleMove}
          onClick={onBubbleClick}
          onContextMenu={(e) => {
            e.preventDefault();
            hidePet();
          }}
        >
          <span className="pet-bar b1" />
          <span className="pet-bar b2" />
          <span className="pet-bar b3" />
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
          className={`pet-ic${petOnly ? ' on' : ''}`}
          title={
            petOnly
              ? '轻量模式已开：启动只显示桌宠。点击关闭（下次启动照常打开主窗）'
              : '轻量模式：启动只显示桌宠，不开主窗。点击开启'
          }
          onClick={togglePetOnly}
        >
          🪶
        </button>
        <button className="pet-ic" title="打开 nodx 主窗口" onClick={() => void invoke('pet_show_main')}>
          🧠
        </button>
        <button className="pet-ic" title="收起成气泡" onClick={() => void collapse()}>
          ▾
        </button>
        <button className="pet-ic" title="隐藏桌宠（托盘 🐣 可恢复）" onClick={hidePet}>
          ✕
        </button>
      </header>

      <div className="pet-body">
        {IS_MAC && (
          <button className="pet-shot-btn" onClick={() => void captureRegion()} disabled={busy}>
            📸 {shot ? '重新框选屏幕' : '框选屏幕提问'}
          </button>
        )}
        {shot && (
          <div className="pet-thumb-row">
            <img className="pet-thumb" src={`data:image/png;base64,${shot.b64}`} alt="截屏" />
            <button className="pet-ic" title="移除截屏" onClick={() => setShot(null)}>
              ✕
            </button>
          </div>
        )}

        <div className="pet-ask-row">
          <textarea
            rows={2}
            value={question}
            disabled={busy}
            placeholder={shot ? '问点关于这张截屏的…  ⌘/Ctrl+Enter' : '随便问点什么…  ⌘/Ctrl+Enter'}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void ask();
              }
            }}
          />
          <button className="pet-ask-btn" disabled={busy || !question.trim()} onClick={() => void ask()}>
            {busy ? '…' : '问'}
          </button>
        </div>

        {error && <div className="pet-err">{error}</div>}
        {answer !== null && (
          <div className="pet-answer" ref={answerRef}>
            {answer}
            <div className="pet-answer-tools">
              <button
                className="pet-ic"
                title="复制回答"
                onClick={() => void navigator.clipboard.writeText(answer)}
              >
                📋
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

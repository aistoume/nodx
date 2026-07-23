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

type Provider = 'anthropic' | 'openai' | 'gemini';
const PROVIDERS: { id: Provider; label: string; hint: string }[] = [
  { id: 'anthropic', label: 'Claude', hint: 'sk-ant-… · console.anthropic.com' },
  { id: 'openai', label: 'GPT', hint: 'sk-… · platform.openai.com' },
  { id: 'gemini', label: 'Gemini', hint: 'AQ.… / AIza… · aistudio.google.com（有免费额度）' },
];
const PROVIDER_KEY = 'nodx-pet-provider';

const BUBBLE = { w: 84, h: 84 };
const WHEEL = { w: 220, h: 220 };
const CARD = { w: 380, h: 460 };
const POS_KEY = 'nodx-pet-pos';

const IS_MAC = navigator.userAgent.includes('Mac');

type Shot = { b64: string } | null;

async function resize(w: number, h: number) {
  await getCurrentWindow().setSize(new LogicalSize(w, h));
}

type View = 'bubble' | 'wheel' | 'card';

export function PetApp() {
  const [view, setView] = useState<View>('bubble');
  const [shot, setShot] = useState<Shot>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [hasKey, setHasKey] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [clipText, setClipText] = useState<string | null>(null);
  const answerRef = useRef<HTMLDivElement | null>(null);
  const askRef = useRef<HTMLTextAreaElement | null>(null);

  const grabClipboard = useCallback(async () => {
    setError(null);
    const t = await invoke<string>('pet_read_clipboard');
    if (t) {
      setClipText(t);
      setAnswer(null);
    } else {
      setError('剪贴板里没有文字 — 先在别处选中并复制（⌘C）。');
    }
  }, []);

  // Provider + key live in the OS keychain (Rust side); the chosen
  // provider id is a plain local preference.
  useEffect(() => {
    const saved = localStorage.getItem(PROVIDER_KEY) as Provider | null;
    if (saved) setProvider(saved);
    void invoke<boolean>('pet_key_has', { provider: saved ?? 'anthropic' })
      .then(setHasKey)
      .catch(() => {});
  }, []);

  const pickProvider = useCallback((p: Provider) => {
    setProvider(p);
    localStorage.setItem(PROVIDER_KEY, p);
    void invoke<boolean>('pet_key_has', { provider: p }).then(setHasKey).catch(() => {});
  }, []);

  const saveKey = useCallback(async () => {
    const k = keyInput.trim();
    await invoke('pet_key_set', { provider, key: k });
    setHasKey(k.length > 0);
    setKeyInput('');
    setShowSettings(false);
  }, [keyInput, provider]);

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
        setAnswer(null);
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

  // ── ⌥+E wake: Rust grabbed the selection, hand it to the question bar ─
  useEffect(() => {
    const un = listen<string | null>('pet://wake', async (e) => {
      const sel = (e.payload ?? '').trim();
      if (sel) {
        setClipText(sel);
        setShot(null);
        setAnswer(null);
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
      setAnswer(null);
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
      const prompt = clipText
        ? `关于下面这段文字，${q}\n\n"""\n${clipText}\n"""`
        : q;
      const text = await invoke<string>('pet_ask', {
        provider,
        prompt,
        imageB64: shot ? shot.b64 : null,
      });
      setAnswer(text);
      requestAnimationFrame(() => answerRef.current?.scrollTo(0, 0));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('NO_KEY')) {
        setError('还没填 API key — 点 ⚙ 设置一次即可。');
        setShowSettings(true);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [question, busy, shot, clipText, provider]);

  // ── Wheel actions (on the grabbed selection) ───────────────────────
  const wheelExplain = useCallback(async () => {
    setQuestion('解释一下这段文字');
    await expand();
    // ask() reads `question` + `clipText`; give React a tick to flush.
    setTimeout(() => void ask(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  const wheelSearch = useCallback(async () => {
    const q = clipText ?? '';
    await collapse();
    void invoke('pet_open_url', {
      url: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipText]);

  const wheelAsk = useCallback(async () => {
    await expand(); // keep clipText, let the user type a question
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Bubble ─────────────────────────────────────────────────────────
  if (view === 'bubble') {
    return (
      <div className="pet-bubble-wrap">
        <button
          className="pet-bubble"
          title="单击=动作轮盘 · 双击=框选截屏 · 拖动=移动 · 右键=隐藏"
          onPointerDown={onBubbleDown}
          onPointerMove={onBubbleMove}
          onClick={onBubbleClick}
          onDoubleClick={onBubbleDoubleClick}
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

  // ── Wheel ──────────────────────────────────────────────────────────
  if (view === 'wheel') {
    return (
      <div className="pet-wheel-wrap">
        <button className="pet-spoke up" title="解释这段文字" onClick={() => void wheelExplain()}>
          📖<em>解释</em>
        </button>
        <button className="pet-spoke right" title="网页搜索" onClick={() => void wheelSearch()}>
          🔎<em>搜索</em>
        </button>
        <button className="pet-spoke down" title="就这段文字追问" onClick={() => void wheelAsk()}>
          💬<em>追问</em>
        </button>
        <button className="pet-spoke left" title="框选屏幕改为提问" onClick={() => void expand()}>
          🖼<em>更多</em>
        </button>
        <button className="pet-wheel-center" title="取消" onClick={() => void collapse()}>
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
          className={`pet-ic${showSettings ? ' on' : ''}${hasKey ? '' : ' warn'}`}
          title={hasKey ? '设置：AI 提供方 / API key' : '还没填 API key — 点这里设置'}
          onClick={() => setShowSettings((v) => !v)}
        >
          ⚙
        </button>
        <button className="pet-ic" title="收起成气泡" onClick={() => void collapse()}>
          ▾
        </button>
        <button className="pet-ic" title="隐藏桌宠（托盘 🐣 可恢复）" onClick={hidePet}>
          ✕
        </button>
      </header>

      <div className="pet-body">
        {showSettings && (
          <div className="pet-settings">
            <div className="pet-prov-row">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className={`pet-prov${provider === p.id ? ' on' : ''}`}
                  onClick={() => pickProvider(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="pet-hint">{PROVIDERS.find((p) => p.id === provider)?.hint}</p>
            <div className="pet-ask-row">
              <input
                type="password"
                className="pet-key-input"
                placeholder={hasKey ? '已保存 · 输入新 key 可替换' : '粘贴 API key'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveKey();
                }}
              />
              <button className="pet-ask-btn" onClick={() => void saveKey()}>
                存
              </button>
            </div>
            <p className="pet-hint">key 只存在本机钥匙串，请求直连提供方。</p>
          </div>
        )}
        <div className="pet-src-row">
          {IS_MAC && (
            <button className="pet-shot-btn" onClick={() => void captureRegion()} disabled={busy}>
              📸 {shot ? '重截' : '框选屏幕'}
            </button>
          )}
          <button className="pet-shot-btn ghost" onClick={() => void grabClipboard()} disabled={busy}>
            📋 {clipText ? '换剪贴板' : '问选中文字'}
          </button>
        </div>
        {shot && (
          <div className="pet-thumb-row">
            <img className="pet-thumb" src={`data:image/png;base64,${shot.b64}`} alt="截屏" />
            <button className="pet-ic" title="移除截屏" onClick={() => setShot(null)}>
              ✕
            </button>
          </div>
        )}
        {clipText && (
          <div className="pet-clip-row">
            <span className="pet-clip-text" title={clipText}>“{clipText}”</span>
            <button className="pet-ic" title="移除文字" onClick={() => setClipText(null)}>
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
                ? '问点关于这张截屏的…  ⌘/Ctrl+Enter'
                : clipText
                  ? '问点关于这段文字的…  ⌘/Ctrl+Enter'
                  : '随便问点什么…  ⌘/Ctrl+Enter'
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

/** @jsxImportSource preact */
/**
 * nodx Lens — side panel (v0.7.0).
 *
 * A per-URL inspiration inbox mirror: shows every marquee-highlight the
 * user has made on the current page, lets them ask Sonnet vision
 * questions about each cropped image, and (optionally) forwards the
 * screenshots to nodx desktop's 灵感池.
 *
 * The side panel is bound to a tab (Chrome opens/closes it per-tab), so
 * every mount reads the active tab's URL and shows highlights for that
 * URL only. When the user navigates within the tab we detect the URL
 * change via chrome.tabs.onUpdated and re-fetch.
 */

import { render } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  getSettings,
  providerNeedsApiKey,
  setSettings,
  type Provider,
  type Settings,
} from '../shared/settings.js';
import { MODELS, PROVIDER_SHORT } from '../shared/model-catalog.js';
import {
  appendQA,
  deleteAction,
  deleteHighlight,
  listForUrl,
  normalizeUrl,
  subscribe,
  subscribeActions,
  updateQA,
  updateHighlight,
  type Highlight,
} from '../shared/highlights.js';
import { callAI } from '../shared/providers.js';
import { mdToHtml } from '../shared/markdown.js';
import { postCaptureToNodx } from '../shared/capture.js';

interface ActiveTabState {
  url: string;
  title: string;
  favIconUrl?: string;
}

async function currentActiveTab(): Promise<ActiveTabState | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  return {
    url: tab.url,
    title: tab.title ?? '',
    ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
  };
}

function App() {
  const [tab, setTab] = useState<ActiveTabState | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [actions, setActions] = useState<Highlight[]>([]);
  const [syncToNodx, setSyncToNodx] = useState(true);
  const [settings, setSettingsState] = useState<Settings | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const cardsRef = useRef<Record<string, HTMLDivElement | null>>({});

  // ── Bootstrap: read current tab + sync flag, load highlights. ─────
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [t, storage] = await Promise.all([
        currentActiveTab(),
        chrome.storage.local.get('syncToNodx'),
      ]);
      if (cancelled) return;
      setTab(t);
      setSyncToNodx((storage.syncToNodx as boolean | undefined) ?? true);
      if (t) setHighlights(await listForUrl(t.url));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Quick model switcher: load settings + stay in sync with the
  //    options page (both write the same `settings` storage key). ─────
  useEffect(() => {
    void getSettings().then(setSettingsState);
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'local' && changes.settings) {
        void getSettings().then(setSettingsState);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const switchProvider = useCallback((p: Provider) => {
    // Same behaviour as the options page: picking a provider snaps the
    // models to that provider's defaults (each provider has its own ids).
    const next = {
      provider: p,
      model: { explain: MODELS[p].explain[0]!, deepen: MODELS[p].deepen[0]! },
    };
    setSettingsState((s) => (s ? { ...s, ...next, apiKey: s.apiKeys[p] ?? '' } : s));
    void setSettings(next);
  }, []);

  const switchModel = useCallback((explain: string) => {
    setSettingsState((s) => {
      if (!s) return s;
      const model = { ...s.model, explain };
      void setSettings({ model });
      return { ...s, model };
    });
  }, []);

  // ── Live-refresh on storage changes for this tab's URL. ───────────
  useEffect(() => {
    if (!tab?.url) return;
    const unsub = subscribe(tab.url, (hs) => setHighlights(hs));
    return unsub;
  }, [tab?.url]);

  // ── Global action log (search / shopping / generate) — shown on every page. ─
  useEffect(() => subscribeActions(setActions), []);

  // ── Handle URL changes within the same panel session. ─────────────
  useEffect(() => {
    const listener = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      updated: chrome.tabs.Tab,
    ) => {
      if (!updated.active) return;
      if (!changeInfo.url && !changeInfo.title) return;
      void (async () => {
        const t = await currentActiveTab();
        setTab(t);
        if (t) setHighlights(await listForUrl(t.url));
      })();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onActivated.addListener(async () => {
      const t = await currentActiveTab();
      setTab(t);
      if (t) setHighlights(await listForUrl(t.url));
    });
    return () => {
      chrome.tabs.onUpdated.removeListener(listener);
    };
  }, []);

  // ── FOCUS_HIGHLIGHT: the service worker asks us to scroll to a card. ─
  useEffect(() => {
    const listener = (msg: unknown) => {
      const m = msg as { type?: string; highlightId?: string };
      if (m?.type === 'FOCUS_HIGHLIGHT' && m.highlightId) {
        setFocusedId(m.highlightId);
        // Scroll after paint.
        requestAnimationFrame(() => {
          const el = cardsRef.current[m.highlightId!];
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // ── User actions ──────────────────────────────────────────────────
  const startScreenshot = useCallback(async () => {
    try {
      const res = (await chrome.runtime.sendMessage({ type: 'START_CAPTURE' })) as {
        ok: boolean;
        error?: string;
      };
      if (!res?.ok) console.warn('[nodx Lens] capture failed:', res?.error);
    } catch (e) {
      console.warn('[nodx Lens] capture threw:', e);
    }
  }, []);

  const toggleSync = useCallback(async () => {
    const next = !syncToNodx;
    setSyncToNodx(next);
    await chrome.storage.local.set({ syncToNodx: next });
  }, [syncToNodx]);

  return (
    <div class="panel">
      <header class="panel-head">
        <div class="panel-title">
          <span class="brand">nodx</span>
          <span>Lens</span>
          <button
            class="settings-link"
            style={{ marginLeft: 'auto' }}
            onClick={() => chrome.runtime.openOptionsPage()}
            title="Open settings"
          >
            ⚙ Settings
          </button>
        </div>
        <div class="panel-sub">
          {tab?.favIconUrl ? (
            <img
              src={tab.favIconUrl}
              alt=""
              width={12}
              height={12}
              style={{ verticalAlign: '-2px', marginRight: '4px' }}
            />
          ) : null}
          {tab?.title || tab?.url || 'No active tab'}
        </div>
        <div class="actions">
          <button class="action-btn" onClick={startScreenshot}>
            📸 Screenshot region
          </button>
        </div>
        {settings && (
          <div class="model-row">
            <select
              class="model-select"
              value={settings.provider}
              onChange={(e) =>
                switchProvider((e.target as HTMLSelectElement).value as Provider)
              }
              title="AI provider"
            >
              {(Object.keys(MODELS) as Provider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_SHORT[p]}
                </option>
              ))}
            </select>
            <select
              class="model-select grow"
              value={settings.model.explain}
              onChange={(e) => switchModel((e.target as HTMLSelectElement).value)}
              title="Model used for answers here"
            >
              {[
                ...new Set([
                  ...MODELS[settings.provider].explain,
                  ...MODELS[settings.provider].deepen,
                ]),
              ].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {providerNeedsApiKey(settings.provider) && !settings.apiKey && (
              <span class="model-nokey" title="This provider has no API key saved yet — click ⚙ Settings to add one">
                ⚠ no key
              </span>
            )}
          </div>
        )}
        <label class="sync-row">
          <input type="checkbox" checked={syncToNodx} onChange={toggleSync} />
          <span>Also send screenshots to nodx desktop</span>
        </label>
      </header>

      <div class="panel-body">
        {/* 本页的框选卡置顶 —— 与正在看的页面最相关；全局动作记录在下方。 */}
        {highlights.length === 0 ? (
          <div class="empty">
            <p style={{ fontSize: '13px', color: '#666' }}>
              No highlights on this page yet.
            </p>
            <p>
              Click <strong>📸 Screenshot region</strong> above and drag
              across any part of the page.
            </p>
            <p style={{ marginTop: '10px' }}>
              Each highlight becomes a card here — ask Sonnet about it, keep
              the yellow marker on the page as a reminder.
            </p>
          </div>
        ) : (
          highlights.map((h) => (
            <HighlightCard
              key={h.id}
              highlight={h}
              focused={h.id === focusedId}
              refFn={(el) => {
                cardsRef.current[h.id] = el;
              }}
              onDelete={() => {
                void deleteHighlight(h.url, h.id);
                if (focusedId === h.id) setFocusedId(null);
              }}
              onSyncDesktop={async () => {
                const result = await postCaptureToNodx(h.thumbnailDataUrl, {
                  sourceUrl: h.url,
                  sourceTitle: h.pageTitle,
                  imageWidth: h.imageWidth,
                  imageHeight: h.imageHeight,
                });
                if (result.ok) {
                  await updateHighlight({
                    id: h.id,
                    url: h.url,
                    syncedToNodx: true,
                    ...(result.id ? { syncedAttentionId: result.id } : {}),
                  });
                }
              }}
            />
          ))
        )}

        {actions.length > 0 && (
          <div class="actions-log" style={{ marginTop: '12px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#6b7280',
                margin: '2px 2px 6px',
              }}
            >
              🕘 搜索 / 购物 / 生成记录（{actions.length}）
            </div>
            {(showAllActions ? actions : actions.slice(0, 3)).map((a) => (
              <ActionCard
                key={a.id}
                item={a}
                onDelete={() => void deleteAction(a.id)}
              />
            ))}
            {actions.length > 3 && (
              <button
                class="action-btn"
                style={{ width: '100%', marginTop: '4px' }}
                onClick={() => setShowAllActions((v) => !v)}
              >
                {showAllActions ? '收起' : `展开全部（${actions.length} 条）`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionCard({
  item,
  onDelete,
}: {
  item: Highlight;
  onDelete: () => void;
}) {
  const a = item.action;
  if (!a) return null;
  const badge =
    a.kind === 'search'
      ? '🔍 搜索'
      : a.kind === 'shopping'
        ? '🛒 购物'
        : a.kind === 'save'
          ? '💡 保存'
          : a.kind === 'instruct'
            ? '✏️ 指令'
            : '🎨 生成';
  const openUrl = () => {
    if (a.url) chrome.tabs.create({ url: a.url });
  };
  return (
    <div class="card">
      <img
        src={item.thumbnailDataUrl}
        alt=""
        class="card-thumb"
        onClick={openUrl}
        title={a.url ? '点击重新打开' : '生成的图片'}
      />
      <div class="card-meta">
        <span>{new Date(item.createdAt).toLocaleString()}</span>
        <span class="badge">{badge}</span>
        <button
          class="del"
          title="删除这条记录"
          style={{ marginLeft: 'auto' }}
          onClick={onDelete}
        >
          ✕
        </button>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'wrap',
          fontSize: '12px',
          margin: '2px 0 4px',
        }}
      >
        <span style={{ color: '#6b7280' }}>{a.label}</span>
        {a.query && (
          <span style={{ color: '#111827', fontWeight: 600 }}>「{a.query}」</span>
        )}
        {a.url && (
          <button
            class="settings-link"
            style={{ marginLeft: 'auto', fontSize: '11px' }}
            onClick={openUrl}
          >
            ↗ 重新打开
          </button>
        )}
      </div>
      {/* ✏️ instruct records carry the conversation — Q as summary, A inside. */}
      {item.qa.length > 0 && (
        <div style={{ fontSize: '12px', margin: '2px 0 4px' }}>
          {item.qa.map((q) => (
            <details key={q.id} style={{ marginBottom: '4px' }}>
              <summary style={{ cursor: 'pointer', color: '#374151' }}>{q.question}</summary>
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  color: '#4b5563',
                  marginTop: '4px',
                  maxHeight: '220px',
                  overflowY: 'auto',
                }}
              >
                {q.answer}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

interface HighlightCardProps {
  highlight: Highlight;
  focused: boolean;
  refFn: (el: HTMLDivElement | null) => void;
  onDelete: () => void;
  onSyncDesktop: () => Promise<void>;
}

function HighlightCard({
  highlight,
  focused,
  refFn,
  onDelete,
  onSyncDesktop,
}: HighlightCardProps) {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const url = highlight.url;
  const id = highlight.id;
  const action = highlight.action;
  const actionBadge =
    action?.kind === 'search'
      ? '🔍 搜索'
      : action?.kind === 'shopping'
        ? '🛒 购物'
        : action?.kind === 'generate'
          ? '🎨 生成'
          : action?.kind === 'save'
            ? '💡 保存'
            : action?.kind === 'instruct'
              ? '✏️ 指令'
              : null;

  const submit = useCallback(async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setError(null);
    try {
      const settings = await getSettings();
      if (!settings.apiKey && providerNeedsApiKey(settings.provider)) {
        throw new Error(
          'AI key not set. Click ⚙ above and paste your API key.',
        );
      }

      const seed = await appendQA(url, id, q);
      if (!seed) throw new Error('Highlight vanished before we could ask.');
      setQuestion('');

      // Strip the data-URL prefix — Anthropic wants pure base64.
      const b64 = highlight.thumbnailDataUrl.replace(/^data:[^,]+,/, '');
      const mime = highlight.thumbnailDataUrl.match(/^data:([^;]+);/)?.[1] ?? 'image/png';

      let full = '';
      await callAI(
        settings.provider,
        settings.apiKey,
        settings.model.explain,
        buildPromptFor(q, highlight.pageTitle),
        (chunk) => {
          full += chunk;
          // Debounced-ish update: just write on every chunk. Storage
          // writes are async but fast enough for this cadence.
          void updateQA(url, id, seed.qaId, {
            answer: full,
            streaming: true,
          });
        },
        undefined,
        { base64: b64, mime },
      );
      await updateQA(url, id, seed.qaId, {
        answer: full,
        streaming: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  }, [question, asking, url, id, highlight.thumbnailDataUrl, highlight.pageTitle]);

  return (
    <div class={`card ${focused ? 'focused' : ''}`} ref={refFn}>
      <img
        src={highlight.thumbnailDataUrl}
        alt="Screenshot"
        class="card-thumb"
        onClick={() => {
          if (action?.url) chrome.tabs.create({ url: action.url });
          else if (!action) scrollPageToRegion(highlight);
          // Generated image: already shown inline; nothing to navigate to.
        }}
        title={
          action?.url
            ? '点击重新打开'
            : action
              ? '生成的图片'
              : 'Click to scroll page to this region'
        }
      />
      <div class="card-meta">
        <span>{new Date(highlight.createdAt).toLocaleString()}</span>
        {actionBadge && <span class="badge">{actionBadge}</span>}
        <span class={`badge ${highlight.syncedToNodx ? 'synced' : ''}`}>
          {highlight.syncedToNodx ? '✓ nodx' : '💡 Lens'}
        </span>
        {!highlight.syncedToNodx && (
          <button
            class="settings-link"
            style={{ marginLeft: 'auto', fontSize: '10px' }}
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try {
                await onSyncDesktop();
              } finally {
                setSyncing(false);
              }
            }}
          >
            {syncing ? '…' : '⇥ nodx desktop'}
          </button>
        )}
        <button class="del" title="Delete this highlight" onClick={onDelete}>
          ✕
        </button>
      </div>

      {action && (action.kind === 'search' || action.kind === 'shopping' || action.kind === 'instruct') && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
            fontSize: '12px',
            margin: '2px 0 6px',
          }}
        >
          <span style={{ color: '#6b7280' }}>{action.label}</span>
          {action.query && (
            <span style={{ color: '#111827', fontWeight: 600 }}>
              「{action.query}」
            </span>
          )}
          {action.url && (
            <button
              class="settings-link"
              style={{ marginLeft: 'auto', fontSize: '11px' }}
              onClick={() => action.url && chrome.tabs.create({ url: action.url })}
            >
              ↗ 重新打开
            </button>
          )}
        </div>
      )}

      {highlight.qa.length > 0 && (
        <div class="qa-list">
          {highlight.qa.map((q) => (
            <div class="qa" key={q.id}>
              <div class="q">{q.question}</div>
              {q.answer ? (
                <div
                  class={`a md ${q.streaming ? 'streaming' : ''}`}
                  dangerouslySetInnerHTML={{ __html: mdToHtml(q.answer) }}
                />
              ) : (
                <div class={`a ${q.streaming ? 'streaming' : ''}`}>
                  {q.streaming ? '' : q.error ?? ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div class="ask-row">
        <textarea
          value={question}
          disabled={asking}
          placeholder="Ask about this screenshot…  Cmd/Ctrl+Enter"
          rows={1}
          onInput={(e) =>
            setQuestion((e.target as HTMLTextAreaElement).value)
          }
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button
          class="ask-btn"
          disabled={asking || !question.trim()}
          onClick={() => void submit()}
        >
          {asking ? '…' : 'Ask'}
        </button>
      </div>
      {error && <div class="err">{error}</div>}
    </div>
  );
}

function buildPromptFor(question: string, pageTitle: string): string {
  return `You're looking at a screenshot the user took on the page: "${pageTitle}".
Please answer the user's question about what's in the image. Be concise (2–5 sentences unless they ask for more). If numbers, UI labels, or key phrases appear in the image, quote them exactly.
Question: ${question}`;
}

function scrollPageToRegion(highlight: Highlight): void {
  // The side panel lives in its own frame — we can't scroll the page
  // directly. Ask the content script to do it, and open the side panel
  // if it isn't already.
  void chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId == null) return;
    chrome.tabs.sendMessage(tabId, {
      type: 'SCROLL_TO_HIGHLIGHT',
      highlightId: highlight.id,
      x: highlight.region.x,
      y: highlight.region.y,
    });
  });
}

render(<App />, document.getElementById('root')!);

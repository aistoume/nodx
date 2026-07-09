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
import { getSettings } from '../shared/settings.js';
import {
  appendQA,
  deleteHighlight,
  listForUrl,
  normalizeUrl,
  subscribe,
  updateQA,
  updateHighlight,
  type Highlight,
} from '../shared/highlights.js';
import { callAnthropic } from '../shared/providers.js';
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
  const [syncToNodx, setSyncToNodx] = useState(true);
  const [focusedId, setFocusedId] = useState<string | null>(null);
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

  // ── Live-refresh on storage changes for this tab's URL. ───────────
  useEffect(() => {
    if (!tab?.url) return;
    const unsub = subscribe(tab.url, (hs) => setHighlights(hs));
    return unsub;
  }, [tab?.url]);

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
            ⚙
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
        <label class="sync-row">
          <input type="checkbox" checked={syncToNodx} onChange={toggleSync} />
          <span>Also send screenshots to nodx desktop</span>
        </label>
      </header>

      <div class="panel-body">
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
      </div>
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

  const submit = useCallback(async () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setError(null);
    try {
      const settings = await getSettings();
      if (!settings.apiKey) {
        throw new Error(
          "AI key not set. Click ⚙ above and paste your Anthropic API key.",
        );
      }
      if (settings.provider !== 'anthropic') {
        throw new Error(
          'Image Q&A currently only supports Anthropic. Change provider in ⚙ settings.',
        );
      }

      const seed = await appendQA(url, id, q);
      if (!seed) throw new Error('Highlight vanished before we could ask.');
      setQuestion('');

      // Strip the data-URL prefix — Anthropic wants pure base64.
      const b64 = highlight.thumbnailDataUrl.replace(/^data:[^,]+,/, '');
      const mime = highlight.thumbnailDataUrl.match(/^data:([^;]+);/)?.[1] ?? 'image/png';

      let full = '';
      await callAnthropic(
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
        onClick={() => scrollPageToRegion(highlight)}
        title="Click to scroll page to this region"
      />
      <div class="card-meta">
        <span>{new Date(highlight.createdAt).toLocaleString()}</span>
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

      {highlight.qa.length > 0 && (
        <div class="qa-list">
          {highlight.qa.map((q) => (
            <div class="qa" key={q.id}>
              <div class="q">{q.question}</div>
              <div class={`a ${q.streaming ? 'streaming' : ''}`}>
                {q.answer || (q.streaming ? '' : q.error ?? '')}
              </div>
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

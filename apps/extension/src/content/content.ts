/**
 * nodx Lens — content script
 *
 * Flow:
 *  1. User selects text → floating "🔍 解释" trigger above selection
 *  2. Click trigger → Shadow DOM panel, streams from background SW
 *  3. On stream completion → persistent "underline" annotation is created
 *     under the selected text. Panel close (Esc / outside click) does NOT
 *     remove the underline.
 *  4. Click an underline → panel re-opens at that location with the stored
 *     explanation (no re-fetch). Right-click → remove annotation.
 *  5. Underlines re-position on window scroll / resize.
 *
 * Annotations are in-memory only for V1 (cleared on page reload). Persisting
 * across reloads (re-anchoring to DOM after React rerender) is V2.
 */

import { getSettings } from '../shared/settings.js';
import { setLocale, t } from '../shared/i18n.js';
import { openDownloadPage } from '../shared/save-hook.js';
import { postTextToNodx } from '../shared/capture.js';
import {
  installMarqueeListener,
  recordTextAction,
  runGenerateFromSubject,
  showToast,
} from './marquee.js';
import { installHighlightsLayer } from './highlights-layer.js';
import { showRadialMenu, TEXT_OPTIONS, type RadialChoice } from './radial-menu.js';
import { mdToHtml } from '../shared/markdown.js';

/**
 * Swallow "Extension context invalidated" globally (v0.8.3).
 *
 * When the user reloads the extension in chrome://extensions, existing
 * content scripts are orphaned — they keep running but any chrome.* API
 * call (chrome.storage.local.set, chrome.runtime.sendMessage, etc.)
 * throws that specific error. The old script can't recover; the user
 * just needs to refresh the tab to pick up the fresh injection.
 *
 * The error itself is harmless (the save / explain flows always finish
 * their user-visible side effects BEFORE the storage-touching cleanup
 * that fails), but Chrome surfaces it as a bright red uncaught rejection
 * on chrome://extensions which looks alarming. Filter it here.
 */
window.addEventListener('unhandledrejection', (event) => {
  const msg = String(
    (event.reason as { message?: string })?.message ?? event.reason ?? '',
  );
  if (msg.includes('Extension context invalidated')) {
    event.preventDefault();
    // eslint-disable-next-line no-console
    console.warn(
      '[nodx Lens] extension was reloaded; refresh this tab to reactivate.',
    );
  }
});

// Marquee-screenshot listener (v0.6.0). Registers a chrome.runtime.onMessage
// handler for BEGIN_MARQUEE — no side effects until the popup / service
// worker actually asks us to enter capture mode.
installMarqueeListener();

// Persistent yellow-box highlights (v0.7.0). Reads chrome.storage,
// re-draws every saved highlight for the current URL, and listens for
// updates so cross-tab edits stay in sync.
installHighlightsLayer();

const HIDE_DELAY_MS = 300;
const SELECTION_DEBOUNCE_MS = 120;
const SCROLL_THROTTLE_MS = 50;

let hostElement: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let triggerHideTimer: number | null = null;
let selectionDebounce: number | null = null;
let activePort: chrome.runtime.Port | null = null;

/** Which annotation is currently shown in the open panel (if any). */
let activeAnnotationId: string | null = null;

interface Annotation {
  id: string;
  text: string;
  explanation: string;
  range: Range;
}

const annotations = new Map<string, Annotation>();
const annotationDivs = new Map<string, HTMLDivElement[]>();

interface UiSettings {
  triggerOnSelection: boolean;
  minLength: number;
  maxLength: number;
}

let uiCache: UiSettings = {
  triggerOnSelection: true,
  minLength: 2,
  maxLength: 500,
};

/**
 * Returns true if our extension context is still alive. After an extension
 * reload (or update), the OLD content script in already-open tabs becomes
 * "orphaned" — chrome.runtime.id goes undefined and any chrome.* API call
 * throws "Extension context invalidated". We guard every chrome.* boundary
 * with this check and degrade gracefully (hide UI, show a one-time toast).
 */
function isExtensionValid(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

let invalidated = false;

function handleInvalidation() {
  if (invalidated) return;
  invalidated = true;
  // Clear all UI
  hideTrigger();
  hidePanel();
  for (const id of Array.from(annotations.keys())) removeAnnotation(id);
  // One-time toast so the user understands why nodx Lens stopped working
  if (!shadowRoot) return;
  const toast = document.createElement('div');
  toast.style.cssText = [
    'position:fixed', 'bottom:20px', 'right:20px',
    'z-index:2147483647', 'pointer-events:auto',
    'background:#1a1a1a', 'color:#fff',
    'padding:10px 14px', 'border-radius:8px',
    'font-size:12px', 'box-shadow:0 4px 14px rgba(0,0,0,0.25)',
    'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",system-ui,sans-serif',
  ].join(';');
  toast.textContent = t('extReloadedToast');
  shadowRoot.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

// Initial settings load (and listener registration) — both can throw if
// the extension context is already invalidated when this script ran.
void getSettings()
  .then((s) => {
    uiCache = s.ui;
    setLocale(s.language);
  })
  .catch(() => { /* extension may be invalidated; nothing to do */ });

try {
  chrome.storage.onChanged.addListener((changes) => {
    const next = changes.settings?.newValue;
    if (next?.ui) uiCache = next.ui;
    if (next?.language) setLocale(next.language);
  });
} catch {
  /* extension context invalidated; storage listener will not fire */
}

// ============================================================================
// Shadow DOM host & styles
// ============================================================================

function ensureHost(): ShadowRoot {
  if (shadowRoot) return shadowRoot;
  hostElement = document.createElement('div');
  hostElement.id = 'nodx-lens-host';
  hostElement.style.cssText =
    'position:fixed;top:0;left:0;z-index:2147483647;pointer-events:none;';
  document.documentElement.appendChild(hostElement);
  shadowRoot = hostElement.attachShadow({ mode: 'open' });
  shadowRoot.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif; }

      .trigger-bar {
        position: fixed; z-index: 2147483647;
        pointer-events: auto;
        display: inline-flex; align-items: stretch;
        border-radius: 999px;
        background: #1a1a1a; color: #fff;
        font-size: 12px; font-weight: 500;
        box-shadow: 0 4px 14px rgba(0,0,0,0.25);
        user-select: none; overflow: hidden;
        opacity: 0; transform: translateY(4px);
        transition: opacity 120ms ease, transform 120ms ease;
      }
      .trigger-bar.show { opacity: 1; transform: translateY(0); }
      .trigger-btn {
        padding: 5px 11px;
        cursor: pointer;
        display: inline-flex; align-items: center;
        transition: background 120ms ease;
      }
      .trigger-btn:hover { background: #2C5282; }
      .trigger-divider {
        width: 1px; background: rgba(255,255,255,0.18);
      }
      .trigger-btn.quick:hover { background: #F59E0B; color: #1a1a1a; }

      .panel {
        position: fixed; z-index: 2147483647;
        pointer-events: auto;
        width: 360px; max-height: 280px;
        background: #fff; color: #1a1a1a;
        border-radius: 10px;
        box-shadow: 0 10px 32px rgba(0,0,0,0.18);
        padding: 14px 16px;
        font-size: 13px; line-height: 1.55;
        overflow-y: auto;
        opacity: 0; transform: translateY(4px);
        transition: opacity 140ms ease, transform 140ms ease,
                    width 160ms ease, max-height 160ms ease;
      }
      .panel.show { opacity: 1; transform: translateY(0); }
      .panel.deepened { width: 480px; max-height: 480px; }
      .panel-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
      .panel-title { font-weight: 600; font-size: 12px; color: #888; }
      .panel-close { cursor: pointer; color: #888; font-size: 14px; line-height: 1; padding: 0 4px; }
      .panel-close:hover { color: #000; }
      .panel-body { white-space: pre-wrap; }
      .panel-body .cursor { display:inline-block; width: 6px; background: #2C5282; opacity: 0.6;
                            animation: blink 1s steps(2, start) infinite; margin-left: 1px; }
      @keyframes blink { to { opacity: 0; } }
      .panel-footer { display:flex; gap:6px; margin-top: 10px; padding-top:10px; border-top: 1px solid #eee; }
      .panel-btn {
        font-size: 11px; padding: 4px 8px; border-radius: 6px;
        background: #f4f4f4; cursor: pointer; border: 0; color: #1a1a1a;
        font-family: inherit;
      }
      .panel-btn:hover { background: #e8e8e8; }
      .loading { color: #aaa; font-style: italic; }
      .error { color: #c53030; }

      /* Persistent underline annotations.
         A semi-transparent overlay sitting on top of the original text. The
         bottom 35% is a colored band that reads as an "underline", and the
         whole area is hover/click-targetable. */
      .ann-underline {
        position: fixed; z-index: 2147483646;
        pointer-events: auto;
        cursor: pointer;
        background: linear-gradient(180deg,
          transparent 0%,
          transparent 65%,
          rgba(44,82,130,0.55) 65%,
          rgba(44,82,130,0.55) 95%,
          transparent 95%);
        transition: background 100ms ease;
        animation: ann-fade-in 240ms ease both;
      }
      .ann-underline:hover {
        background: linear-gradient(180deg,
          rgba(44,82,130,0.08) 0%,
          rgba(44,82,130,0.08) 65%,
          rgba(44,82,130,0.85) 65%,
          rgba(44,82,130,0.85) 95%,
          transparent 95%);
      }
      @keyframes ann-fade-in {
        from { opacity: 0; transform: translateY(2px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    </style>
  `;
  return shadowRoot;
}

// ============================================================================
// Trigger button (floating "🔍 解释" above selection)
// ============================================================================

function hideTrigger() {
  shadowRoot?.querySelector('.trigger-bar')?.remove();
}

function showTrigger(rect: DOMRect, selectedText: string, range: Range) {
  const root = ensureHost();
  hideTrigger();
  const bar = document.createElement('div');
  bar.className = 'trigger-bar';
  bar.style.top = `${Math.max(8, rect.top - 36)}px`;
  bar.style.left = `${Math.max(8, Math.min(window.innerWidth - 90, rect.right - 60))}px`;

  const explainBtn = document.createElement('div');
  explainBtn.className = 'trigger-btn explain';
  explainBtn.textContent = t('triggerLabel');
  explainBtn.title = t('triggerExplainTitle');

  bar.append(explainBtn);
  root.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add('show'));

  // Prevent selection collapse on mousedown
  bar.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  explainBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = explainBtn.getBoundingClientRect();
    const mx = r.left + r.width / 2;
    const my = r.top + r.height / 2;
    hideTrigger();
    void showRadialMenu(mx, my, TEXT_OPTIONS).then((choice) =>
      handleTextChoice(choice, selectedText, range),
    );
  });
}

// ============================================================================
// Panel (the explanation popover; can be opened/closed/reopened)
// ============================================================================

function getPanel(): HTMLDivElement | null {
  return shadowRoot?.querySelector('.panel') as HTMLDivElement | null;
}

function hidePanel() {
  shadowRoot?.querySelector('.panel')?.remove();
  abortActivePort();
  activeAnnotationId = null;
}

function abortActivePort() {
  if (activePort) {
    try {
      activePort.disconnect();
    } catch {
      /* already gone */
    }
    activePort = null;
  }
}

function createPanelAt(top: number, left: number, deepened: boolean): HTMLDivElement {
  const root = ensureHost();
  hidePanel();
  const panel = document.createElement('div');
  panel.className = deepened ? 'panel deepened' : 'panel';
  const width = deepened ? 500 : 380;
  panel.style.top = `${Math.min(window.innerHeight - 200, Math.max(8, top))}px`;
  panel.style.left = `${Math.min(window.innerWidth - width, Math.max(8, left))}px`;
  panel.innerHTML = `
    <div class="panel-header">
      <span class="panel-title"></span>
      <span class="panel-close" data-action="close">✕</span>
    </div>
    <div class="panel-body"></div>
    <div class="panel-footer" style="display:none">
      <button class="panel-btn" data-action="deepen"></button>
      <button class="panel-btn" data-action="save"></button>
      <button class="panel-btn" data-action="copy"></button>
    </div>
  `;
  (panel.querySelector('.panel-title') as HTMLElement).textContent = t('panelTitle');
  const [deepBtn, saveBtn, copyBtn] = Array.from(panel.querySelectorAll('.panel-btn')) as HTMLButtonElement[];
  deepBtn.textContent = t('deepen');
  saveBtn.textContent = t('saveExplain');
  copyBtn.textContent = t('copy');
  root.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('show'));
  return panel;
}

function openPanelForNewSelection(
  selectedText: string,
  range: Range,
  mode: 'short' | 'deep' = 'short',
) {
  const rects = range.getClientRects();
  if (rects.length === 0) return;
  const firstRect = rects[0];
  const panel = createPanelAt(firstRect.bottom + 8, firstRect.left, mode === 'deep');
  wirePanelClicks(panel, selectedText, range);
  startStream(panel, selectedText, mode, range);
}

/**
 * Route a text-selection radial pick. The menu mirrors the image menu:
 *   🔍 解释 / 搜索 · 💡 保存 · 🛒 Shopping / Amazon · 🎨 生成
 * The selected text is the query/prompt, so no "identify" step is needed.
 * (深入 / 复制 stay on the explanation panel's footer.)
 */
function handleTextChoice(choice: RadialChoice, text: string, range: Range): void {
  switch (choice) {
    case 'txt-explain':
      openPanelForNewSelection(text, range, 'short');
      break;
    case 'txt-deepen':
      openPanelForNewSelection(text, range, 'deep');
      break;
    case 'txt-search': {
      const url = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      recordTextAction(
        { kind: 'search', label: '文字搜索 · Google', query: text, url },
        text,
      );
      break;
    }
    case 'txt-shopping-google': {
      const url = `https://www.google.com/search?udm=28&q=${encodeURIComponent(text)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      recordTextAction(
        { kind: 'shopping', label: 'Google Shopping', query: text, url },
        text,
      );
      break;
    }
    case 'txt-shopping-amazon': {
      const url = `https://www.amazon.com/s?k=${encodeURIComponent(text)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      recordTextAction(
        { kind: 'shopping', label: 'Amazon', query: text, url },
        text,
      );
      break;
    }
    case 'txt-save':
      void saveTextToPool(text);
      break;
    case 'txt-generate':
      // The selected text IS the subject — skip the image-认图 step. On
      // success, underline the source text like an explain annotation so
      // the page shows what was generated from (click → note, right-click
      // → remove).
      void runGenerateFromSubject(text)
        .then(() => {
          createAnnotation(text, t('generatedForText'), range);
        })
        .catch((e) => {
          console.error('[nodx Lens] text generate failed:', e);
          showToast(`生成失败: ${e instanceof Error ? e.message : e}`);
        });
      break;
    case 'txt-copy':
      void navigator.clipboard.writeText(text);
      break;
    default:
      // 'cancel' or an image-only choice — nothing to do here.
      break;
  }
}

/**
 * 💡 保存: hand the raw selection to the *running* nodx desktop's 灵感池 via
 * the local gateway (NOT the `nodx://` scheme, which the OS may route to a
 * stale install).
 */
async function saveTextToPool(text: string): Promise<void> {
  const busy = showToast('保存到 nodx…', { spinner: true, persistent: true });
  const outcome = await postTextToNodx(text, {
    sourceUrl: location.href,
    sourceTitle: document.title,
  });
  busy.close();
  if (outcome.ok) {
    showToast('✓ 已存入 nodx 灵感池');
    // Mirror the save into the side-panel history so text saves are as
    // traceable as image ones (desktop pool + a local record card).
    recordTextAction({ kind: 'save', label: '存入灵感池', query: text }, text);
  } else if (outcome.appMissing) {
    showToast('nodx 桌面未运行，无法保存');
  } else {
    showToast(`保存失败: ${outcome.error ?? ''}`);
  }
}

function openPanelForAnnotation(ann: Annotation) {
  const rects = ann.range.getClientRects();
  if (rects.length === 0) return;
  const firstRect = rects[0];
  const panel = createPanelAt(firstRect.bottom + 8, firstRect.left, false);
  const body = panel.querySelector('.panel-body') as HTMLDivElement;
  body.textContent = ann.explanation;
  const footer = panel.querySelector('.panel-footer') as HTMLDivElement;
  footer.style.display = 'flex';
  activeAnnotationId = ann.id;
  wirePanelClicks(panel, ann.text, ann.range);
}

function wirePanelClicks(panel: HTMLDivElement, selectedText: string, range: Range) {
  panel.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    const action = target?.dataset.action;
    if (!action) return;
    if (action === 'close') hidePanel();
    else if (action === 'deepen') startStream(panel, selectedText, 'deep', range);
    else if (action === 'copy') {
      const body = panel.querySelector('.panel-body');
      if (body?.textContent) void navigator.clipboard.writeText(body.textContent);
    } else if (action === 'save') {
      void handleSaveExplanation(panel, selectedText);
    }
  });
}

/**
 * "Save explanation" — hands the current snippet + explanation to a local
 * companion app via the nodx:// URL scheme. If the app isn't installed we
 * degrade gracefully to a one-tap link that opens the download page.
 *
 * We never *require* the local app: this is a hand-off convenience, and
 * the explanation is already in the panel + copy button + local history.
 */
async function handleSaveExplanation(panel: HTMLDivElement, selectedText: string) {
  const bodyEl = panel.querySelector('.panel-body');
  const explanation = (bodyEl?.textContent ?? '').trim();
  if (!explanation) return;

  const footer = panel.querySelector('.panel-footer') as HTMLDivElement | null;
  const saveBtn = panel.querySelector('[data-action="save"]') as HTMLButtonElement | null;
  const setBtn = (text: string, disabled = false) => {
    if (saveBtn) {
      saveBtn.textContent = text;
      saveBtn.disabled = disabled;
    }
  };

  setBtn(t('saveSending'), true);
  // Go through the running app's local gateway (same channel as image
  // captures) rather than the `nodx://` scheme, so the snippet lands in the
  // install that's actually open.
  const outcome = await postTextToNodx(selectedText, {
    explanation,
    sourceUrl: location.href,
    sourceTitle: document.title,
  });

  if (outcome.ok) {
    setBtn(t('saveSuccess'), true);
    setTimeout(() => setBtn(t('saveExplain'), false), 2400);
    return;
  }

  // Not running / not installed → inline "get it" hint; any other error
  // just reverts the button.
  setBtn(t('saveExplain'), false);
  if (outcome.appMissing) showAppMissingHint(footer);
}

/**
 * When we suspect the companion isn't installed, replace the footer with
 * a small "Get nodx" hint the user can click to visit the download page.
 * Auto-reverts to the normal footer after ~4 s.
 */
function showAppMissingHint(footer: HTMLDivElement | null) {
  if (!footer) return;
  const original = footer.innerHTML;
  footer.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:8px',
    'font-size:11px',
    'color:#666',
    'width:100%',
  ].join(';');
  const text = document.createElement('span');
  text.textContent = t('saveAppMissing');
  const link = document.createElement('a');
  link.textContent = t('saveAppGetLink');
  link.href = 'https://aicon.solutions/nodx/';
  link.style.cssText = 'color:#2C5282;text-decoration:underline;cursor:pointer;';
  link.addEventListener('click', (e) => {
    e.preventDefault();
    openDownloadPage();
  });
  wrap.append(text, link);
  footer.appendChild(wrap);
  setTimeout(() => {
    if (footer.contains(wrap)) footer.innerHTML = original;
  }, 4200);
}

// ============================================================================
// Streaming via background port. On DONE we create/update an annotation.
// ============================================================================

function startStream(
  panel: HTMLDivElement,
  selectedText: string,
  mode: 'short' | 'deep',
  range: Range,
) {
  if (mode === 'deep') panel.classList.add('deepened');
  const body = panel.querySelector('.panel-body') as HTMLDivElement;
  const footer = panel.querySelector('.panel-footer') as HTMLDivElement;
  body.classList.remove('error');
  body.classList.add('loading');
  body.textContent = t('connecting');
  footer.style.display = 'none';

  abortActivePort();
  if (!isExtensionValid()) {
    body.classList.remove('loading');
    body.classList.add('error');
    body.textContent = t('extReloadedInline');
    handleInvalidation();
    return;
  }
  let port: chrome.runtime.Port;
  try {
    port = chrome.runtime.connect({ name: 'EXPLAIN' });
  } catch {
    body.classList.remove('loading');
    body.classList.add('error');
    body.textContent = t('extInvalidatedInline');
    handleInvalidation();
    return;
  }
  activePort = port;

  let received = '';
  let firstChunk = true;

  port.onMessage.addListener((msg: { type: string; text?: string; error?: string }) => {
    if (msg.type === 'CHUNK' && typeof msg.text === 'string') {
      if (firstChunk) {
        firstChunk = false;
        body.classList.remove('loading');
        body.textContent = '';
      }
      received += msg.text;
      body.textContent = received;
      const caret = document.createElement('span');
      caret.className = 'cursor';
      caret.textContent = ' ';
      body.appendChild(caret);
    } else if (msg.type === 'DONE') {
      body.classList.remove('loading');
      body.querySelector('.cursor')?.remove();
      // Final render: convert the model's Markdown into readable HTML
      // (mdToHtml escapes input first, so this is injection-safe).
      body.innerHTML = mdToHtml(received);
      footer.style.display = 'flex';
      activePort = null;
      if (mode === 'short') {
        // Create persistent annotation under the original selection
        const id = createAnnotation(selectedText, received, range);
        activeAnnotationId = id;
      } else if (activeAnnotationId) {
        // Update the existing annotation's stored explanation to the deepened version
        const ann = annotations.get(activeAnnotationId);
        if (ann) ann.explanation = received;
      }
    } else if (msg.type === 'ERROR') {
      body.classList.remove('loading');
      body.classList.add('error');
      body.textContent = t('errorPrefix', { msg: msg.error ?? 'unknown' });
      activePort = null;
    }
  });

  port.onDisconnect.addListener(() => {
    if (firstChunk) {
      body.classList.remove('loading');
      body.classList.add('error');
      body.textContent = t('connectionBroken');
    }
    activePort = null;
  });

  port.postMessage({
    type: 'START',
    text: selectedText,
    mode,
    url: location.href,
    title: document.title,
  });
}

// ============================================================================
// Annotations: persistent underlines under explained text
// ============================================================================

function createAnnotation(text: string, explanation: string, range: Range): string {
  const id = crypto.randomUUID();
  const cloned = range.cloneRange();
  annotations.set(id, { id, text, explanation, range: cloned });
  renderAnnotation(id);
  return id;
}

function renderAnnotation(id: string) {
  const ann = annotations.get(id);
  if (!ann) return;
  const root = ensureHost();

  annotationDivs.get(id)?.forEach((d) => d.remove());

  let rects: DOMRectList;
  try {
    rects = ann.range.getClientRects();
  } catch {
    removeAnnotation(id);
    return;
  }
  if (rects.length === 0) {
    removeAnnotation(id);
    return;
  }

  const divs: HTMLDivElement[] = [];
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    if (rect.width === 0 || rect.height === 0) continue;
    const div = document.createElement('div');
    div.className = 'ann-underline';
    div.dataset.annId = id;
    div.title = t('annotationTitle');
    div.style.top = `${rect.top}px`;
    div.style.left = `${rect.left}px`;
    div.style.width = `${rect.width}px`;
    div.style.height = `${rect.height}px`;

    div.addEventListener('mousedown', (e) => {
      // Prevent the underline click from clearing any current selection
      e.stopPropagation();
    });
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = annotations.get(id);
      if (a) openPanelForAnnotation(a);
    });
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeAnnotation(id);
      if (activeAnnotationId === id) hidePanel();
    });

    root.appendChild(div);
    divs.push(div);
  }
  annotationDivs.set(id, divs);
}

function removeAnnotation(id: string) {
  annotationDivs.get(id)?.forEach((d) => d.remove());
  annotationDivs.delete(id);
  annotations.delete(id);
}

function updateAllAnnotationPositions() {
  for (const id of Array.from(annotations.keys())) {
    renderAnnotation(id);
  }
}

function throttle<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let last = 0;
  let timer: number | null = null;
  return ((...args: unknown[]) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else if (timer === null) {
      timer = window.setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  }) as T;
}

const updatePositionsThrottled = throttle(updateAllAnnotationPositions, SCROLL_THROTTLE_MS);
window.addEventListener('scroll', updatePositionsThrottled, { capture: true, passive: true });
window.addEventListener('resize', updatePositionsThrottled);

// ============================================================================
// Selection handling
// ============================================================================

function handleSelection() {
  if (invalidated) return;
  if (!uiCache.triggerOnSelection) {
    hideTrigger();
    return;
  }
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    if (triggerHideTimer) window.clearTimeout(triggerHideTimer);
    triggerHideTimer = window.setTimeout(hideTrigger, HIDE_DELAY_MS);
    return;
  }
  const text = sel.toString().trim();
  if (text.length < uiCache.minLength || text.length > uiCache.maxLength) {
    hideTrigger();
    return;
  }
  const range = sel.getRangeAt(0);
  // Ignore selection inside our own UI
  if (hostElement && range.intersectsNode(hostElement)) {
    hideTrigger();
    return;
  }
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    hideTrigger();
    return;
  }
  showTrigger(rect, text, range);
}

document.addEventListener('selectionchange', () => {
  if (selectionDebounce) window.clearTimeout(selectionDebounce);
  selectionDebounce = window.setTimeout(handleSelection, SELECTION_DEBOUNCE_MS);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideTrigger();
    hidePanel();
  }
});

// Outside-click closes the panel — annotations stay visible.
document.addEventListener('mousedown', (e) => {
  if (!hostElement) return;
  if (hostElement.contains(e.target as Node)) return;
  if (getPanel()) hidePanel();
});

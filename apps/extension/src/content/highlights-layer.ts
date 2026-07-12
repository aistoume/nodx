/**
 * Persistent highlight overlays — the yellow boxes that stay on the page
 * for every marquee-capture the user has ever done on this URL.
 *
 * ─── How positioning works ────────────────────────────────────────────
 * Highlight.region is in DOCUMENT coords (x, y are absolute — added
 * window.scrollX/Y at capture time). We render each box as an absolutely-
 * positioned <div> parented to a container fixed to the viewport, with a
 * transform that offsets by -scrollY so it scrolls with the page.
 *
 * Why not just use `position: absolute` on <body>? Some sites replace
 * <body> or intercept scroll on their own scroll container. A fixed
 * container transformed via `translate3d` bypasses layout entirely and
 * survives most page-level shenanigans.
 *
 * ─── Interaction ──────────────────────────────────────────────────────
 * Hovering a box shows a small chip with the capture time + a "💬 N"
 * counter. Clicking asks the service worker to open the side panel and
 * focus that highlight's card.
 */

import {
  deleteHighlight,
  listForUrl,
  normalizeUrl,
  subscribe,
  type Highlight,
} from '../shared/highlights.js';

const LAYER_ID = '__nodx_highlights_layer__';
const BOX_CLASS = '__nodx_highlight_box__';

let installed = false;
let unsubscribe: (() => void) | null = null;

interface ScrollMessage {
  type: 'SCROLL_TO_HIGHLIGHT';
  highlightId: string;
  x: number;
  y: number;
}

/**
 * Install the layer on `document.documentElement`, load the highlights
 * for the current URL, and start listening for storage changes. Idempotent.
 */
export function installHighlightsLayer(): void {
  if (installed) return;
  installed = true;

  // Side panel → content script: scroll the page to a highlight when
  // the user clicks its thumbnail in the panel.
  chrome.runtime.onMessage.addListener((msg: ScrollMessage, _sender, sendResponse) => {
    if (msg?.type !== 'SCROLL_TO_HIGHLIGHT') return false;
    // Center the region vertically; offset a bit so it's under the URL bar.
    window.scrollTo({
      left: Math.max(0, msg.x - 40),
      top: Math.max(0, msg.y - 100),
      behavior: 'smooth',
    });
    // Flash the box briefly so it's easy to find after a big jump.
    const box = document.querySelector<HTMLDivElement>(
      `[data-highlight-id="${msg.highlightId}"]`,
    );
    if (box) {
      const prev = box.style.background;
      box.style.background = 'rgba(245, 158, 11, 0.35)';
      setTimeout(() => (box.style.background = prev), 900);
    }
    sendResponse({ ok: true });
    return false;
  });

  const layer = ensureLayer();
  void refresh(layer);

  // Live-refresh when storage changes (other tabs, side panel, etc.).
  unsubscribe = subscribe(location.href, (highlights) => {
    renderAll(layer, highlights);
  });

  // Our boxes sit at a near-max z-index so they stay visible over normal
  // page content — but that also makes them float ON TOP of a site's own
  // modal/lightbox (e.g. Google Images' preview panel), covering it. Hide
  // the whole layer whenever a modal is on screen, restore it when gone.
  installModalGuard(layer);

  // Scroll: keep the layer aligned by translating it against scrollY.
  const onScroll = () => {
    layer.style.transform = `translate3d(0, ${-window.scrollY}px, 0)`;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Resize: no repositioning needed (coords are document-absolute) but a
  // long-form site that changes layout may want us to re-fetch. Cheap.
  window.addEventListener('resize', () => void refresh(layer), { passive: true });

  // History-based SPAs change location.href without a full reload; the
  // content script stays alive, so we re-fetch when the URL changes.
  let currentHref = normalizeUrl(location.href);
  const check = () => {
    const next = normalizeUrl(location.href);
    if (next !== currentHref) {
      currentHref = next;
      unsubscribe?.();
      unsubscribe = subscribe(location.href, (highlights) =>
        renderAll(layer, highlights),
      );
      void refresh(layer);
    }
  };
  window.addEventListener('popstate', check);
  // pushState/replaceState don't fire events natively — monkey-patch each.
  const origPush = history.pushState.bind(history);
  history.pushState = function (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    origPush(data, unused, url);
    queueMicrotask(check);
  };
  const origReplace = history.replaceState.bind(history);
  history.replaceState = function (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    origReplace(data, unused, url);
    queueMicrotask(check);
  };
}

/** Force a re-read from storage — used by marquee right after a write. */
export async function syncHighlightsFromStorage(): Promise<void> {
  const layer = ensureLayer();
  await refresh(layer);
}

/**
 * Paint one highlight immediately (used right after marquee-capture so
 * the user sees the box before the storage listener round-trip).
 * Idempotent: if the same id is already drawn, no-op.
 */
export function drawHighlight(h: Highlight): void {
  if (!hasPageRegion(h)) return;
  const layer = ensureLayer();
  if (layer.querySelector(`[data-highlight-id="${h.id}"]`)) return;
  layer.appendChild(makeBox(h));
}

/**
 * A record gets a page box iff it carries a real capture region. Text-only
 * records (text generate) and legacy region-less action logs have zero size
 * and draw nothing; marquee captures — including search / shopping /
 * generate actions — mark where on the page they came from.
 */
function hasPageRegion(h: Highlight): boolean {
  return h.region.width > 0 && h.region.height > 0;
}

async function refresh(layer: HTMLDivElement): Promise<void> {
  const highlights = await listForUrl(location.href);
  renderAll(layer, highlights);
}

function renderAll(layer: HTMLDivElement, highlights: Highlight[]): void {
  // Wipe & re-render — highlight count is small (< 50 per page in
  // practice) so a full swap is fine and simpler than diffing.
  layer.textContent = '';
  for (const h of highlights) {
    if (!hasPageRegion(h)) continue;
    layer.appendChild(makeBox(h));
  }
}

/**
 * Hide the highlights layer while a modal / lightbox is on screen, so our
 * near-max-z boxes don't paint over it, and restore it when the modal
 * closes. Detection uses the common modal-semantics selectors — `dialog[open]`,
 * `[aria-modal="true"]`, and reasonably-sized non-hidden `[role="dialog"]`
 * elements (Google Images' preview panel is one). A debounced
 * MutationObserver keeps it in sync as the page mutates.
 */
function installModalGuard(layer: HTMLDivElement): void {
  const isModalPresent = (): boolean => {
    if (document.querySelector('dialog[open], [aria-modal="true"]')) return true;
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    for (const d of dialogs) {
      if (d.getAttribute('aria-hidden') === 'true') continue;
      const r = d.getBoundingClientRect();
      if (r.width > 200 && r.height > 200) return true; // a real overlay
    }
    return false;
  };

  let raf = 0;
  const apply = () => {
    raf = 0;
    layer.style.display = isModalPresent() ? 'none' : '';
  };
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(apply);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['role', 'aria-modal', 'aria-hidden', 'open'],
  });
  apply(); // initial state
}

function ensureLayer(): HTMLDivElement {
  let el = document.getElementById(LAYER_ID) as HTMLDivElement | null;
  if (el) return el;
  el = document.createElement('div');
  el.id = LAYER_ID;
  Object.assign(el.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    zIndex: '2147483645',
    pointerEvents: 'none',
  } as CSSStyleDeclaration);
  // Append to <html> so <body> replacements don't nuke us.
  document.documentElement.appendChild(el);
  return el;
}

/**
 * Optional hook installed by the marquee module: clicking a box re-opens
 * the radial menu so the user can run MORE actions on the same capture
 * (search / shopping / generate / explain) without drawing a second box.
 * When unset, a box click falls back to just opening the side panel.
 */
type BoxMenuHandler = (h: Highlight, center: { x: number; y: number }) => void;
let boxMenuHandler: BoxMenuHandler | null = null;

export function setBoxMenuHandler(handler: BoxMenuHandler): void {
  boxMenuHandler = handler;
}

function makeBox(h: Highlight): HTMLDivElement {
  const box = document.createElement('div');
  box.className = BOX_CLASS;
  box.dataset.highlightId = h.id;
  Object.assign(box.style, {
    position: 'absolute',
    left: `${h.region.x}px`,
    top: `${h.region.y}px`,
    width: `${h.region.width}px`,
    height: `${h.region.height}px`,
    border: '2px solid rgba(245, 158, 11, 0.8)',
    borderRadius: '3px',
    background: 'rgba(245, 158, 11, 0.10)',
    pointerEvents: 'auto',
    cursor: 'pointer',
    transition: 'background 0.15s',
  } as CSSStyleDeclaration);

  // Small chip in the top-right corner summarising what this capture
  // became: 💬 N for Q&A turns, one emoji per distinct follow-up action,
  // 📌 for a plain save. Clicking the chip opens the side panel (the box
  // body itself re-opens the action menu).
  const chip = document.createElement('div');
  const ACTION_EMOJI: Record<string, string> = {
    search: '🔎',
    shopping: '🛒',
    generate: '🎨',
  };
  const parts: string[] = [];
  if (h.qa.length > 0) parts.push(`💬 ${h.qa.length}`);
  const allActions = [...(h.action ? [h.action] : []), ...(h.actions ?? [])];
  for (const kind of new Set(allActions.map((a) => a.kind))) {
    parts.push(ACTION_EMOJI[kind] ?? '');
  }
  chip.textContent = parts.length > 0 ? parts.join(' ') : '📌';
  chip.title = 'nodx 侧栏';
  Object.assign(chip.style, {
    position: 'absolute',
    top: '-10px',
    right: '-10px',
    padding: '2px 6px',
    background: 'rgba(217, 119, 6, 0.95)',
    color: '#fff',
    borderRadius: '10px',
    fontSize: '10px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontWeight: '600',
    letterSpacing: '0.02em',
    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
    pointerEvents: 'auto',
    cursor: 'pointer',
  } as CSSStyleDeclaration);
  chip.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({
      type: 'OPEN_SIDE_PANEL',
      highlightId: h.id,
    });
  });
  box.appendChild(chip);

  // Delete button — top-left, revealed on hover so deleting never needs a
  // trip to the side panel. Single click removes the highlight (same
  // behaviour as the side panel's ✕).
  const del = document.createElement('div');
  del.textContent = '✕';
  del.title = '删除此框选 / Delete this highlight';
  Object.assign(del.style, {
    position: 'absolute',
    top: '-10px',
    left: '-10px',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(24, 24, 27, 0.85)',
    color: '#fff',
    borderRadius: '50%',
    fontSize: '11px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    pointerEvents: 'auto',
    cursor: 'pointer',
    opacity: '0',
    transition: 'opacity 0.15s, background 0.15s',
  } as CSSStyleDeclaration);
  del.addEventListener('mouseenter', () => {
    del.style.background = 'rgba(220, 38, 38, 0.95)';
  });
  del.addEventListener('mouseleave', () => {
    del.style.background = 'rgba(24, 24, 27, 0.85)';
  });
  del.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    box.remove(); // instant feedback; storage change re-renders the rest
    void deleteHighlight(h.url, h.id);
  });
  box.appendChild(del);

  // Hover: darken; click: re-open the action menu on this box (fallback:
  // side panel when no handler is installed).
  box.addEventListener('mouseenter', () => {
    box.style.background = 'rgba(245, 158, 11, 0.20)';
    del.style.opacity = '1';
  });
  box.addEventListener('mouseleave', () => {
    box.style.background = 'rgba(245, 158, 11, 0.10)';
    del.style.opacity = '0';
  });
  box.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (boxMenuHandler) {
      // Center of the box in viewport coords (region is document coords).
      boxMenuHandler(h, {
        x: h.region.x + h.region.width / 2 - window.scrollX,
        y: h.region.y + h.region.height / 2 - window.scrollY,
      });
    } else {
      chrome.runtime.sendMessage({
        type: 'OPEN_SIDE_PANEL',
        highlightId: h.id,
      });
    }
  });

  return box;
}

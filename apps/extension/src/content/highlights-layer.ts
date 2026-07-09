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
  if (h.generated) return; // generated images have no page region → no box
  const layer = ensureLayer();
  if (layer.querySelector(`[data-highlight-id="${h.id}"]`)) return;
  layer.appendChild(makeBox(h));
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
    if (h.generated) continue; // no page box for generated images
    layer.appendChild(makeBox(h));
  }
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

  // Small chip in the top-right corner: N messages + open indicator.
  const chip = document.createElement('div');
  const qaCount = h.qa.length;
  chip.textContent = qaCount > 0 ? `💬 ${qaCount}` : '📌';
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
    pointerEvents: 'none',
  } as CSSStyleDeclaration);
  box.appendChild(chip);

  // Hover: darken; click: open side panel focused on this highlight.
  box.addEventListener('mouseenter', () => {
    box.style.background = 'rgba(245, 158, 11, 0.20)';
  });
  box.addEventListener('mouseleave', () => {
    box.style.background = 'rgba(245, 158, 11, 0.10)';
  });
  box.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({
      type: 'OPEN_SIDE_PANEL',
      highlightId: h.id,
    });
  });

  return box;
}

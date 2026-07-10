/**
 * Highlights — the per-page "灵感 anchor" store.
 *
 * A Highlight is created every time the user marquee-selects a region on
 * a page. It records:
 *   - the page-coordinate rect (so we can redraw the yellow box even
 *     after scroll / reload)
 *   - a small thumbnail (the cropped screenshot as a data URL)
 *   - a running Q&A log the user carried on about that specific region
 *
 * All highlights live in chrome.storage.local, keyed by a hash of the
 * page URL. Reason for the hash: chrome.storage keys are exposed to any
 * extension debugging tool, and full URLs may contain long tracking
 * strings; a short hex hash keeps the store scannable.
 *
 * ─── Cross-session persistence ────────────────────────────────────────
 * On page load, content.ts calls `listForUrl(currentUrl)` and re-draws
 * every yellow box on the page. The user's browsing history and the
 * highlight store are decoupled — deleting a highlight in the side panel
 * removes the box on refresh; adding a new one in a different tab
 * broadcasts via chrome.storage.onChanged.
 */

export interface HighlightRegion {
  /** CSS pixel coords, relative to the DOCUMENT (not the viewport). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Page height at capture time — used to spot-check if page reflowed. */
  documentHeight: number;
}

export interface HighlightQA {
  id: string;
  question: string;
  answer: string;
  createdAt: number;
  /** True while a stream is in flight; the a/answer is partial. */
  streaming?: boolean;
  /** Populated on failure so the side panel can render a retry hint. */
  error?: string;
}

export type HighlightActionKind = 'search' | 'shopping' | 'generate' | 'save';

export interface HighlightAction {
  /** Which action produced this record. */
  kind: HighlightActionKind;
  /** Short human label, e.g. '以图搜索 · 图片' / 'Google Shopping' / 'Amazon' / '生成图片'. */
  label: string;
  /** Query Sonnet derived (search / shopping), if any. */
  query?: string;
  /** Result page to re-open (search / shopping). Generate has none. */
  url?: string;
}

export interface Highlight {
  id: string;
  url: string;
  /** The document title at capture time. */
  pageTitle: string;
  createdAt: number;
  region: HighlightRegion;
  /** Small crop, PNG data URL. Kept < 200 KB to stay under storage caps. */
  thumbnailDataUrl: string;
  /** Full-size dimensions of the crop in device pixels. */
  imageWidth: number;
  imageHeight: number;
  qa: HighlightQA[];
  /** True after the user explicitly forwarded this to nodx desktop. */
  syncedToNodx: boolean;
  /** Id the desktop side assigned, if any (letting us dedup future syncs). */
  syncedAttentionId?: string;
  /**
   * True when this card is an AI-generated image rather than a page
   * screenshot. It has no real page region, so the highlight layer must
   * NOT draw a yellow box for it.
   */
  generated?: boolean;
  /**
   * Present when this card LOGS a search / shopping / generate action
   * rather than anchoring a page annotation. The highlight layer draws no
   * page box for it; the side panel renders it as an action card with a
   * re-open link so the user can repeat or re-view it later.
   */
  action?: HighlightAction;
  /**
   * Follow-up actions performed ON this page box after it was created
   * (click a box → radial menu → search / shopping / generate). Each run
   * also logs a card in the global action list; this array is what the
   * box's corner chip summarises so one region never grows a second box.
   */
  actions?: HighlightAction[];
}

const STORAGE_PREFIX = 'nodx.highlights.';

/**
 * Normalize a URL so different tabs looking at the same page share the
 * same bucket. Strips the fragment (#…) — hash-based routing pages will
 * therefore merge across sub-routes; that's fine for our use case
 * (screenshot annotations live on the visible layout, not the route).
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

/** Small non-crypto hash → 8-hex chars. Same URL always yields same key. */
function hashKey(url: string): string {
  let h = 2166136261 >>> 0; // FNV-1a
  const s = normalizeUrl(url);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function storageKey(url: string): string {
  return STORAGE_PREFIX + hashKey(url);
}

interface Bucket {
  url: string;
  highlights: Highlight[];
}

async function readBucket(url: string): Promise<Bucket> {
  const key = storageKey(url);
  const raw = await chrome.storage.local.get(key);
  const value = raw[key] as Bucket | undefined;
  if (value && Array.isArray(value.highlights)) return value;
  return { url: normalizeUrl(url), highlights: [] };
}

async function writeBucket(url: string, bucket: Bucket): Promise<void> {
  const key = storageKey(url);
  await chrome.storage.local.set({ [key]: bucket });
}

export async function listForUrl(url: string): Promise<Highlight[]> {
  const bucket = await readBucket(url);
  return bucket.highlights;
}

export async function addHighlight(h: Highlight): Promise<void> {
  const bucket = await readBucket(h.url);
  bucket.highlights.unshift(h);
  await writeBucket(h.url, bucket);
}

export async function updateHighlight(
  h: Pick<Highlight, 'id' | 'url'> & Partial<Highlight>,
): Promise<Highlight | null> {
  const bucket = await readBucket(h.url);
  const idx = bucket.highlights.findIndex((x) => x.id === h.id);
  if (idx === -1) return null;
  const merged: Highlight = { ...bucket.highlights[idx]!, ...h } as Highlight;
  bucket.highlights[idx] = merged;
  await writeBucket(h.url, bucket);
  return merged;
}

export async function deleteHighlight(url: string, id: string): Promise<void> {
  const bucket = await readBucket(url);
  bucket.highlights = bucket.highlights.filter((h) => h.id !== id);
  await writeBucket(url, bucket);
}

/**
 * Append a new QA turn (question) in "streaming" state so the UI can
 * render the empty answer bubble immediately, then updateQA(...) as
 * the model streams. Returns the QA id so the caller can update it.
 */
export async function appendQA(
  url: string,
  highlightId: string,
  question: string,
): Promise<{ qaId: string; highlight: Highlight } | null> {
  const bucket = await readBucket(url);
  const idx = bucket.highlights.findIndex((x) => x.id === highlightId);
  if (idx === -1) return null;
  const qaId = crypto.randomUUID();
  const qa: HighlightQA = {
    id: qaId,
    question,
    answer: '',
    createdAt: Date.now(),
    streaming: true,
  };
  bucket.highlights[idx]!.qa.push(qa);
  await writeBucket(url, bucket);
  return { qaId, highlight: bucket.highlights[idx]! };
}

export async function updateQA(
  url: string,
  highlightId: string,
  qaId: string,
  patch: Partial<HighlightQA>,
): Promise<void> {
  const bucket = await readBucket(url);
  const h = bucket.highlights.find((x) => x.id === highlightId);
  if (!h) return;
  const q = h.qa.find((x) => x.id === qaId);
  if (!q) return;
  Object.assign(q, patch);
  await writeBucket(url, bucket);
}

/**
 * Log a follow-up action performed on an existing page box (click box →
 * radial menu → search / shopping / generate). The box's chip re-renders
 * via the storage subscription.
 */
export async function appendHighlightAction(
  url: string,
  highlightId: string,
  action: HighlightAction,
): Promise<void> {
  const bucket = await readBucket(url);
  const h = bucket.highlights.find((x) => x.id === highlightId);
  if (!h) return;
  h.actions = [...(h.actions ?? []), action];
  await writeBucket(url, bucket);
}

/**
 * ─── Global action log ────────────────────────────────────────────────
 * Search / shopping / generate records are NOT tied to a page bucket:
 * a search opens a NEW tab, and the side panel follows the active tab, so
 * a per-URL record would be invisible on the results page. Instead they
 * live in one flat, page-independent list shown on every page.
 */
const ACTIONS_KEY = 'nodx.actions';
const ACTIONS_CAP = 100;

export async function listActions(): Promise<Highlight[]> {
  const raw = await chrome.storage.local.get(ACTIONS_KEY);
  const value = raw[ACTIONS_KEY] as Highlight[] | undefined;
  return Array.isArray(value) ? value : [];
}

export async function addAction(h: Highlight): Promise<void> {
  const list = await listActions();
  list.unshift(h);
  if (list.length > ACTIONS_CAP) list.length = ACTIONS_CAP;
  await chrome.storage.local.set({ [ACTIONS_KEY]: list });
}

export async function deleteAction(id: string): Promise<void> {
  const list = await listActions();
  await chrome.storage.local.set({ [ACTIONS_KEY]: list.filter((x) => x.id !== id) });
}

/** Subscribe to the global action log — fires on add/delete. */
export function subscribeActions(cb: (list: Highlight[]) => void): () => void {
  void listActions().then(cb);
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: chrome.storage.AreaName,
  ) => {
    if (area !== 'local' || !changes[ACTIONS_KEY]) return;
    const next = changes[ACTIONS_KEY].newValue as Highlight[] | undefined;
    cb(Array.isArray(next) ? next : []);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** Subscribe to any bucket for the given URL — fires on add/update/delete. */
export function subscribe(
  url: string,
  cb: (highlights: Highlight[]) => void,
): () => void {
  const key = storageKey(url);
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: chrome.storage.AreaName,
  ) => {
    if (area !== 'local' || !changes[key]) return;
    const next = changes[key].newValue as Bucket | undefined;
    cb(next?.highlights ?? []);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

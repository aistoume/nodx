/**
 * Customizable action wheel — the shared "wheel-config v1" schema (same
 * JSON shape as the Android app's WheelConfig.kt, so configs stay
 * portable across platforms).
 *
 * Exactly 4 spokes (up/right/down/left). A spoke either carries an action
 * or 1–3 children. Every button's emoji / label / action / params are
 * user-editable in the options page; colours stay fixed per position.
 */

export type WheelAction =
  | { kind: 'prompt'; prompt: string }
  /** ✏️ Ask the user to TYPE an instruction at use time (input popover),
   *  then run it as the vision prompt — like `prompt` minus the template. */
  | { kind: 'instruct' }
  | { kind: 'search'; urlPrefix: string }
  | { kind: 'save' }
  | {
      kind: 'generate';
      /** One clean image, or the four-style 2×2 grid. */
      layout: 'single' | 'grid';
      /** Style template; `{subject}` is replaced by the AI's image description. */
      stylePrompt: string;
    };

export interface WheelItem {
  emoji: string;
  label: string;
  /** Custom button colour (#rrggbb). Unset → the fixed position colour;
   *  children without a colour inherit their parent spoke's. */
  color?: string;
  action: WheelAction | null;
  children: WheelItem[];
}

/** Position default colours (up/right/down/left) as hex — the editor's
 *  colour inputs and the renderers' fallbacks both derive from these. */
export const SPOKE_COLORS_HEX = ['#3b82f6', '#d97706', '#10b981', '#a855f7'];

/** hex → the wheel's standard rgba(…, 0.95) button background. */
export function wheelBg(hex: string | undefined, fallback: string): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return fallback;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.95)`;
}

export interface WheelConfigV1 {
  version: 1;
  spokes: WheelItem[]; // length 4: up, right, down, left
}

export const DEFAULT_EXPLAIN_PROMPT =
  'What is this? Answer concisely (2–4 sentences), quoting key numbers/text exactly.';
export const DEFAULT_IMAGE_SEARCH_PREFIX = 'https://www.google.com/search?udm=2&q=';

/** 2×2 four-style grid — the Lens 0.9 behaviour, now a user-editable template. */
export const DEFAULT_GRID_STYLE_PROMPT = `Create ONE single image composed as a clean 2×2 grid of four equal quadrants. Each quadrant shows the SAME subject rendered in a different visual style. Keep the subject identical across all four quadrants.

Subject: {subject}

- Top-left quadrant: a realistic e-commerce PRODUCT PHOTOGRAPH of the subject as a physical, purchasable object on a plain seamless white studio background, soft even lighting, sharp focus, realistic materials.
- Top-right quadrant: a hand-drawn ink-and-watercolour illustration.
- Bottom-left quadrant: a polished 3D render with soft global illumination and subtle reflections.
- Bottom-right quadrant: minimalist black line art on a plain white background, a few clean strokes, no shading.

Lay the four quadrants out as an even, clearly separated 2×2 grid. Keep it a small, compact graphic.`;

export const DEFAULT_SINGLE_STYLE_PROMPT = `Create ONE single, polished image of the subject below. Clean composition, soft lighting, simple uncluttered background, sharp focus. Keep it a small, compact graphic.

Subject: {subject}`;

/** Old default labels renamed in place — only exact matches (i.e. the
 *  user never touched them) are migrated. */
const LEGACY_LABEL_MAP: Record<string, string> = { Shopping: 'Google shop' };

export function upgradeLabel(label: string): string {
  return LEGACY_LABEL_MAP[label] ?? label;
}

/** Fill in fields older stored configs (or hand-written JSON) may miss. */
export function normalizeAction(a: WheelAction | null): WheelAction | null {
  if (a?.kind === 'generate') {
    return {
      kind: 'generate',
      layout: a.layout === 'single' ? 'single' : 'grid',
      stylePrompt:
        a.stylePrompt?.trim() ||
        (a.layout === 'single' ? DEFAULT_SINGLE_STYLE_PROMPT : DEFAULT_GRID_STYLE_PROMPT),
    };
  }
  return a;
}

/** The stock wheel — mirrors Lens 0.9 exactly. */
export function defaultWheel(): WheelConfigV1 {
  return {
    version: 1,
    spokes: [
      {
        emoji: '🔍', label: 'Search', action: null,
        children: [
          { emoji: '📖', label: 'Explain', action: { kind: 'prompt', prompt: DEFAULT_EXPLAIN_PROMPT }, children: [] },
          { emoji: '🔎', label: 'Web search', action: { kind: 'search', urlPrefix: DEFAULT_IMAGE_SEARCH_PREFIX }, children: [] },
          { emoji: '💡', label: 'Save', action: { kind: 'save' }, children: [] },
        ],
      },
      // Right spoke IS the instruct entry — one tap from the wheel to the
      // type-your-own-instruction box (Save moved into 🔍's submenu).
      { emoji: '✏️', label: 'Instruct', action: { kind: 'instruct' }, children: [] },
      {
        emoji: '🛒', label: 'Shopping', action: null,
        children: [
          { emoji: '🏷', label: 'Google shop', action: { kind: 'search', urlPrefix: 'https://www.google.com/search?udm=28&q=' }, children: [] },
          { emoji: '📦', label: 'Amazon', action: { kind: 'search', urlPrefix: 'https://www.amazon.com/s?k=' }, children: [] },
        ],
      },
      {
        emoji: '🎨', label: 'Generate',
        action: { kind: 'generate', layout: 'grid', stylePrompt: DEFAULT_GRID_STYLE_PROMPT },
        children: [],
      },
    ],
  };
}

/**
 * Config migration: wheels saved before the instruct release have no ✏️
 * entry anywhere, so upgraded users literally can't find the new action.
 * Inject one into a submenu with a free slot (schema max 3 children) —
 * their own customization stays untouched. Returns true when it changed.
 */
function ensureInstructEntry(cfg: WheelConfigV1): boolean {
  const hasInstruct = cfg.spokes.some(
    (s) =>
      s.action?.kind === 'instruct' ||
      s.children.some((c) => c.action?.kind === 'instruct'),
  );
  if (hasInstruct) return false;
  const slot = cfg.spokes.find((s) => s.children.length > 0 && s.children.length < 3);
  if (!slot) return false; // every submenu full — user can add it in Settings
  slot.children.push({
    emoji: '✏️',
    label: 'Instruct',
    action: { kind: 'instruct' },
    children: [],
  });
  return true;
}

export async function getWheelConfig(): Promise<WheelConfigV1> {
  // Orphaned content scripts (extension reloaded, tab not refreshed) lose
  // chrome.storage entirely — return defaults instead of TypeError-ing.
  if (!chrome?.storage?.local) return defaultWheel();
  const stored = await chrome.storage.local.get('wheelConfig');
  const cfg = stored.wheelConfig as WheelConfigV1 | undefined;
  if (!cfg || cfg.version !== 1 || !Array.isArray(cfg.spokes) || cfg.spokes.length !== 4) {
    return defaultWheel();
  }
  // Normalize actions saved by older versions (e.g. bare {kind:'generate'}).
  const normalized: WheelConfigV1 = {
    ...cfg,
    spokes: cfg.spokes.map((s) => ({
      ...s,
      label: upgradeLabel(s.label),
      action: normalizeAction(s.action),
      children: s.children.map((c) => ({
        ...c,
        label: upgradeLabel(c.label),
        action: normalizeAction(c.action),
      })),
    })),
  };
  if (ensureInstructEntry(normalized)) {
    // Persist so the injected entry is stable (and editable) from now on.
    try {
      await setWheelConfig(normalized);
    } catch {
      /* read-only contexts still get the in-memory migration */
    }
  }
  return normalized;
}

export async function setWheelConfig(cfg: WheelConfigV1): Promise<void> {
  await chrome.storage.local.set({ wheelConfig: cfg });
}

export async function resetWheelConfig(): Promise<void> {
  await chrome.storage.local.remove('wheelConfig');
}

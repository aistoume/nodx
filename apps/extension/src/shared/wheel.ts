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
  action: WheelAction | null;
  children: WheelItem[];
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
        emoji: '🔍', label: '', action: null,
        children: [
          { emoji: '📖', label: 'Explain', action: { kind: 'prompt', prompt: DEFAULT_EXPLAIN_PROMPT }, children: [] },
          { emoji: '🔎', label: 'Search', action: { kind: 'search', urlPrefix: DEFAULT_IMAGE_SEARCH_PREFIX }, children: [] },
        ],
      },
      { emoji: '💡', label: '', action: { kind: 'save' }, children: [] },
      {
        emoji: '🛒', label: '', action: null,
        children: [
          { emoji: '🏷', label: 'Google shop', action: { kind: 'search', urlPrefix: 'https://www.google.com/search?udm=28&q=' }, children: [] },
          { emoji: '📦', label: 'Amazon', action: { kind: 'search', urlPrefix: 'https://www.amazon.com/s?k=' }, children: [] },
        ],
      },
      {
        emoji: '🎨', label: '',
        action: { kind: 'generate', layout: 'grid', stylePrompt: DEFAULT_GRID_STYLE_PROMPT },
        children: [],
      },
    ],
  };
}

export async function getWheelConfig(): Promise<WheelConfigV1> {
  const stored = await chrome.storage.local.get('wheelConfig');
  const cfg = stored.wheelConfig as WheelConfigV1 | undefined;
  if (!cfg || cfg.version !== 1 || !Array.isArray(cfg.spokes) || cfg.spokes.length !== 4) {
    return defaultWheel();
  }
  // Normalize actions saved by older versions (e.g. bare {kind:'generate'}).
  return {
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
}

export async function setWheelConfig(cfg: WheelConfigV1): Promise<void> {
  await chrome.storage.local.set({ wheelConfig: cfg });
}

export async function resetWheelConfig(): Promise<void> {
  await chrome.storage.local.remove('wheelConfig');
}

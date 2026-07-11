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
  | { kind: 'generate' };

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
  '这是什么？简洁回答（2–4 句），关键数字/文字精确引用。';
export const DEFAULT_IMAGE_SEARCH_PREFIX = 'https://www.google.com/search?udm=2&q=';

/** The stock wheel — mirrors Lens 0.9 exactly. */
export function defaultWheel(): WheelConfigV1 {
  return {
    version: 1,
    spokes: [
      {
        emoji: '🔍', label: '', action: null,
        children: [
          { emoji: '📖', label: '解释', action: { kind: 'prompt', prompt: DEFAULT_EXPLAIN_PROMPT }, children: [] },
          { emoji: '🔎', label: '搜索', action: { kind: 'search', urlPrefix: DEFAULT_IMAGE_SEARCH_PREFIX }, children: [] },
        ],
      },
      { emoji: '💡', label: '', action: { kind: 'save' }, children: [] },
      {
        emoji: '🛒', label: '', action: null,
        children: [
          { emoji: '🏷', label: 'Shopping', action: { kind: 'search', urlPrefix: 'https://www.google.com/search?udm=28&q=' }, children: [] },
          { emoji: '📦', label: 'Amazon', action: { kind: 'search', urlPrefix: 'https://www.amazon.com/s?k=' }, children: [] },
        ],
      },
      { emoji: '🎨', label: '', action: { kind: 'generate' }, children: [] },
    ],
  };
}

export async function getWheelConfig(): Promise<WheelConfigV1> {
  const stored = await chrome.storage.local.get('wheelConfig');
  const cfg = stored.wheelConfig as WheelConfigV1 | undefined;
  if (!cfg || cfg.version !== 1 || !Array.isArray(cfg.spokes) || cfg.spokes.length !== 4) {
    return defaultWheel();
  }
  return cfg;
}

export async function setWheelConfig(cfg: WheelConfigV1): Promise<void> {
  await chrome.storage.local.set({ wheelConfig: cfg });
}

export async function resetWheelConfig(): Promise<void> {
  await chrome.storage.local.remove('wheelConfig');
}

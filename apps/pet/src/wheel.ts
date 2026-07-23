/**
 * Customizable action wheel for the desktop pet.
 *
 * Same spirit as the browser extension / Android "wheel-config v1": four
 * fixed spokes (up / right / down / left), each with a user-chosen icon,
 * name, action kind and parameter. Colours stay tied to the position so
 * muscle memory survives re-labelling.
 */

export type WheelKind =
  | 'prompt' // send a custom prompt with whatever context is loaded
  | 'search' // open `urlPrefix + <selection>` in the browser
  | 'ask' // open the card and let the user type
  | 'shot'; // region screenshot, then ask

export interface WheelSpoke {
  emoji: string;
  label: string;
  kind: WheelKind;
  /** prompt text (kind=prompt) or URL prefix (kind=search). */
  param: string;
}

export interface WheelConfig {
  version: 1;
  spokes: [WheelSpoke, WheelSpoke, WheelSpoke, WheelSpoke];
}

const KEY = 'nodx-pet-wheel-v1';

export const DEFAULT_EXPLAIN_PROMPT = '解释一下这段内容，简明扼要。';

/** Position colours (up/right/down/left) — mirrors the extension. */
export const SPOKE_COLORS = [
  'rgba(59, 130, 246, 0.95)',
  'rgba(217, 119, 6, 0.95)',
  'rgba(16, 185, 129, 0.95)',
  'rgba(168, 85, 247, 0.95)',
];

export const SPOKE_POS = ['up', 'right', 'down', 'left'] as const;
export const SPOKE_POS_LABEL = ['上（蓝）', '右（琥珀）', '下（绿）', '左（紫）'];

export const KIND_LABEL: Record<WheelKind, string> = {
  prompt: 'AI 回答（自定义提示词）',
  search: '打开网址搜索',
  ask: '打开对话框自己问',
  shot: '框选截屏后提问',
};

/** Common search destinations — same list the extension ships. */
export const SEARCH_PRESETS: { label: string; url: string }[] = [
  { label: 'Google', url: 'https://www.google.com/search?q=' },
  { label: 'Google 图片', url: 'https://www.google.com/search?udm=2&q=' },
  { label: 'Google Shopping', url: 'https://www.google.com/search?udm=28&q=' },
  { label: 'Amazon', url: 'https://www.amazon.com/s?k=' },
  { label: '淘宝', url: 'https://s.taobao.com/search?q=' },
  { label: '京东', url: 'https://search.jd.com/Search?keyword=' },
  { label: '小红书', url: 'https://www.xiaohongshu.com/search_result?keyword=' },
  { label: 'YouTube', url: 'https://www.youtube.com/results?search_query=' },
  { label: 'Wikipedia', url: 'https://zh.wikipedia.org/w/index.php?search=' },
  { label: 'Perplexity', url: 'https://www.perplexity.ai/search?q=' },
];

export function defaultWheel(): WheelConfig {
  return {
    version: 1,
    spokes: [
      { emoji: '📖', label: '解释', kind: 'prompt', param: DEFAULT_EXPLAIN_PROMPT },
      { emoji: '🔎', label: '搜索', kind: 'search', param: SEARCH_PRESETS[0]!.url },
      { emoji: '💬', label: '追问', kind: 'ask', param: '' },
      { emoji: '🖼', label: '截屏', kind: 'shot', param: '' },
    ],
  };
}

export function loadWheel(): WheelConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultWheel();
    const cfg = JSON.parse(raw) as WheelConfig;
    if (cfg?.version !== 1 || !Array.isArray(cfg.spokes) || cfg.spokes.length !== 4) {
      return defaultWheel();
    }
    // Fill gaps from older/hand-edited configs so the wheel never renders blank.
    const d = defaultWheel();
    cfg.spokes = cfg.spokes.map((s, i) => ({
      emoji: s?.emoji?.trim() || d.spokes[i]!.emoji,
      label: s?.label ?? d.spokes[i]!.label,
      kind: (['prompt', 'search', 'ask', 'shot'] as WheelKind[]).includes(s?.kind)
        ? s.kind
        : d.spokes[i]!.kind,
      param: s?.param ?? '',
    })) as WheelConfig['spokes'];
    return cfg;
  } catch {
    return defaultWheel();
  }
}

export function saveWheel(cfg: WheelConfig): void {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

export function resetWheel(): void {
  localStorage.removeItem(KEY);
}

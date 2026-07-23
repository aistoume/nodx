/**
 * Customizable action wheel for the desktop pet.
 *
 * Same spirit as the browser extension / Android "wheel-config v1": four
 * fixed spokes (up / right / down / left), each with a user-chosen icon,
 * name, action kind and parameter. Colours stay tied to the position so
 * muscle memory survives re-labelling.
 */

import { t } from './i18n';

export type WheelKind =
  | 'prompt' // send a custom prompt with whatever context is loaded
  | 'search' // open `urlPrefix + <selection>` in the browser
  | 'ask' // open the card and let the user type
  | 'shot' // region screenshot, then ask
  | 'cli'; // run a user-configured external command with the context

export interface WheelSpoke {
  emoji: string;
  label: string;
  kind: WheelKind;
  /**
   * prompt text (kind=prompt), URL prefix (kind=search), or a command
   * template (kind=cli) where `{input}` is replaced by the context.
   */
  param: string;
}

export interface WheelConfig {
  version: 1;
  spokes: [WheelSpoke, WheelSpoke, WheelSpoke, WheelSpoke];
}

const KEY = 'nodx-pet-wheel-v1';



/** Position colours (up/right/down/left) — mirrors the extension. */
export const SPOKE_COLORS = [
  'rgba(59, 130, 246, 0.95)',
  'rgba(217, 119, 6, 0.95)',
  'rgba(16, 185, 129, 0.95)',
  'rgba(168, 85, 247, 0.95)',
];

export const SPOKE_POS = ['up', 'right', 'down', 'left'] as const;
export const spokePosLabels = (): string[] => [t('posUp'), t('posRight'), t('posDown'), t('posLeft')];

export const kindLabel = (k: WheelKind): string =>
  ({
    prompt: t('kindPrompt'),
    search: t('kindSearch'),
    ask: t('kindAsk'),
    shot: t('kindShot'),
    cli: t('kindCli'),
  })[k];

/** Ready-made command templates for the CLI action. */
export const CLI_PRESETS: { label: string; cmd: string }[] = [
  { label: 'Claude Code', cmd: 'claude -p {input}' },
  { label: 'Codex CLI', cmd: 'codex exec {input}' },
  { label: 'Gemini CLI', cmd: 'gemini -p {input}' },
  { label: 'Ollama (local)', cmd: 'ollama run llama3 {input}' },
  { label: 'Speak (macOS say)', cmd: 'say {input}' },
  { label: 'Shortcuts', cmd: 'shortcuts run MyShortcut -i {input}' },
];

/** Common search destinations — same list the extension ships. */
export const SEARCH_PRESETS: { label: string; url: string }[] = [
  { label: 'Google', url: 'https://www.google.com/search?q=' },
  { label: 'Google Images', url: 'https://www.google.com/search?udm=2&q=' },
  { label: 'Google Shopping', url: 'https://www.google.com/search?udm=28&q=' },
  { label: 'Amazon', url: 'https://www.amazon.com/s?k=' },
  { label: 'Taobao 淘宝', url: 'https://s.taobao.com/search?q=' },
  { label: 'JD 京东', url: 'https://search.jd.com/Search?keyword=' },
  { label: 'Xiaohongshu 小红书', url: 'https://www.xiaohongshu.com/search_result?keyword=' },
  { label: 'YouTube', url: 'https://www.youtube.com/results?search_query=' },
  { label: 'Wikipedia', url: 'https://zh.wikipedia.org/w/index.php?search=' },
  { label: 'Perplexity', url: 'https://www.perplexity.ai/search?q=' },
];

export function defaultWheel(): WheelConfig {
  return {
    version: 1,
    spokes: [
      { emoji: '📖', label: t('spokeExplain'), kind: 'prompt', param: t('defaultExplainPrompt') },
      { emoji: '🔎', label: t('spokeSearch'), kind: 'search', param: SEARCH_PRESETS[0]!.url },
      { emoji: '💬', label: t('spokeFollow'), kind: 'ask', param: '' },
      { emoji: '🖼', label: t('spokeShot'), kind: 'shot', param: '' },
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
      kind: (['prompt', 'search', 'ask', 'shot', 'cli'] as WheelKind[]).includes(s?.kind)
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

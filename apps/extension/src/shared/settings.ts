/**
 * Settings persisted to chrome.storage.local.
 */

import type { Language } from './i18n.js';

export type Provider = 'anthropic' | 'openai' | 'google';

export interface Settings {
  language: Language;          // 'auto' | 'zh' | 'en'
  provider: Provider;
  apiKey: string;
  model: {
    explain: string;
    deepen: string;
  };
  ui: {
    triggerOnSelection: boolean;
    minLength: number;
    maxLength: number;
    hotkey?: string;
  };
  /**
   * Image generation (the "🎨 generate" radial action). A SEPARATE Google
   * AI key + model — the main provider is usually Anthropic, which can't
   * generate images. Sonnet still writes the prompt from the screenshot.
   */
  imageGen: {
    apiKey: string;
    model: string;
  };
}

const DEFAULT_SETTINGS: Settings = {
  language: 'auto',
  provider: 'anthropic',
  apiKey: '',
  model: {
    explain: 'claude-haiku-4-5',
    deepen: 'claude-sonnet-5',
  },
  ui: {
    triggerOnSelection: true,
    minLength: 2,
    maxLength: 500,
  },
  imageGen: {
    apiKey: '',
    model: 'gemini-3.1-flash-image',
  },
};

/**
 * Stored settings can carry model ids that have since been retired or
 * superseded — map them forward so old installs keep working
 * (gemini-2.5-flash-image shuts down 2026-08-17).
 */
const LEGACY_MODEL_MAP: Record<string, string> = {
  'claude-opus-4-6': 'claude-opus-4-8',
  'gpt-4o-mini': 'gpt-5.6-luna',
  'gpt-4o': 'gpt-5.6-sol',
  'gpt-5': 'gpt-5.6-sol',
  'gemini-2.5-flash': 'gemini-3.5-flash',
  'gemini-2.5-pro': 'gemini-3-pro',
  'gemini-2.5-flash-image': 'gemini-3.1-flash-image',
};

function upgradeModel(id: string): string {
  return LEGACY_MODEL_MAP[id] ?? id;
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings');
  const s: Settings = { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) };
  s.model = {
    explain: upgradeModel(s.model.explain),
    deepen: upgradeModel(s.model.deepen),
  };
  s.imageGen = { ...s.imageGen, model: upgradeModel(s.imageGen.model) };
  return s;
}

export async function setSettings(s: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ settings: { ...current, ...s } });
}

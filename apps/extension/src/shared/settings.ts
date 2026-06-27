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
}

const DEFAULT_SETTINGS: Settings = {
  language: 'auto',
  provider: 'anthropic',
  apiKey: '',
  model: {
    explain: 'claude-haiku-4-5',
    deepen: 'claude-sonnet-4-6',
  },
  ui: {
    triggerOnSelection: true,
    minLength: 2,
    maxLength: 500,
  },
};

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) };
}

export async function setSettings(s: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ settings: { ...current, ...s } });
}

/**
 * i18n runtime for nodx desktop.
 *
 * Public surface:
 *   - `t(key, params?)` — pure lookup, safe to call from anywhere
 *   - `useT()` — React hook that re-renders when the locale changes
 *   - `useLocale()` — read + set the current locale
 *   - `initLocale()` — call once from main.tsx so we pick up the saved / system pref
 *
 * Storage: `localStorage['nodx:locale']` = `'zh' | 'en' | 'auto'`
 * (`'auto'` = follow navigator.language; resolved on read)
 */

import { useEffect, useState } from 'react';
import { STRINGS, type Locale, type StringKey } from './strings.js';

export type { Locale, StringKey };

// ── Setting ────────────────────────────────────────────────────────
export type LocaleSetting = Locale | 'auto';

const STORAGE_KEY = 'nodx:locale';
let currentSetting: LocaleSetting = 'auto';
let currentLocale: Locale = 'zh';

function detectSystem(): Locale {
  try {
    const lang =
      (typeof navigator !== 'undefined' && navigator.language) || 'en';
    return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'zh';
  }
}

function resolveSetting(setting: LocaleSetting): Locale {
  return setting === 'auto' ? detectSystem() : setting;
}

/** Load the saved preference and resolve the effective locale. */
export function initLocale(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'zh' || raw === 'en' || raw === 'auto') {
      currentSetting = raw;
    } else {
      currentSetting = 'auto';
    }
  } catch {
    currentSetting = 'auto';
  }
  currentLocale = resolveSetting(currentSetting);
}

// Initialise immediately so `t()` works before any component mounts.
initLocale();

/** Read the current locale. */
export function getLocale(): Locale {
  return currentLocale;
}

/** Read the raw preference (may be 'auto'). */
export function getLocaleSetting(): LocaleSetting {
  return currentSetting;
}

// ── Change notifications ───────────────────────────────────────────
const listeners = new Set<() => void>();

/** Change the language and notify subscribers. */
export function setLocaleSetting(setting: LocaleSetting): void {
  currentSetting = setting;
  currentLocale = resolveSetting(setting);
  try {
    localStorage.setItem(STORAGE_KEY, setting);
  } catch {
    /* localStorage may be blocked in some sandboxes */
  }
  for (const l of Array.from(listeners)) {
    try {
      l();
    } catch {
      /* listener errors mustn't break the loop */
    }
  }
}

/** Subscribe to locale changes. Returns unsubscribe. */
export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ── Lookup ─────────────────────────────────────────────────────────
type Params = Record<string, string | number>;

function interpolate(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : `{{${name}}}`,
  );
}

/**
 * Look up a string. Missing keys fall back to English, and if still missing
 * they render the key itself so we can spot omissions in QA.
 */
export function t(key: StringKey, params?: Params): string {
  const dict = STRINGS[currentLocale];
  const fallback = STRINGS.en;
  const raw = (dict as Record<string, string>)[key] ??
    (fallback as Record<string, string>)[key] ??
    (key as string);
  return interpolate(raw, params);
}

// ── React hook ─────────────────────────────────────────────────────

/**
 * `useT()` returns a stable `t()` binding + `locale` that triggers re-render
 * when the user switches language. Use in every component that displays
 * user-facing strings.
 */
export function useT(): {
  t: typeof t;
  locale: Locale;
  setting: LocaleSetting;
  setSetting: (s: LocaleSetting) => void;
} {
  const [, force] = useState(0);
  useEffect(() => subscribeLocale(() => force((n) => n + 1)), []);
  return {
    t,
    locale: currentLocale,
    setting: currentSetting,
    setSetting: setLocaleSetting,
  };
}

/**
 * Tiny in-process i18n for nodx Lens.
 *
 * - On script start, locale defaults to whatever the browser language is.
 * - After getSettings() resolves, call setLocale(settings.language) to refine.
 * - Components use t('key') or t('key', { msg: '...' }) for templated strings.
 */

export type Language = 'auto' | 'zh' | 'en';
export type Locale = 'zh' | 'en';

const STRINGS = {
  zh: {
    // Content script
    triggerLabel: '🔍 解释',
    triggerExplainTitle: '让 AI 解释这段',
    panelTitle: 'nodx Lens · 解释',
    connecting: '连接中…',
    loading: '加载中…',
    deepen: '📚 深入',
    copy: '📋 复制',
    saveExplain: '📌 保存',
    saveSending: '发送中…',
    saveSuccess: '✓ 已保存',
    saveAppMissing: '未检测到 nodx 桌面版',
    saveAppGetLink: '获取应用 →',
    errorPrefix: '出错了：{msg}',
    connectionBroken: '连接中断，请重试。',
    extReloadedInline: '扩展刚刚更新，请刷新本页后再试。',
    extInvalidatedInline: '扩展上下文失效，请刷新本页。',
    extReloadedToast: '🔁 nodx Lens 已更新 · 请刷新本页继续使用',
    annotationTitle: '点击查看解释 · 右键删除',

    // Service worker
    missingApiKey: '请先在 Settings 配置 API Key',

    // Options page
    optionsTitle: 'nodx Lens — Settings',
    optionsSubtitle: '所有数据仅保存在你的浏览器本地，永不上传。',
    language: '语言',
    languageAuto: '跟随浏览器',
    languageZh: '中文',
    languageEn: 'English',
    aiProvider: 'AI Provider',
    providerAnthropic: 'Anthropic (Claude)',
    providerOpenAI: 'OpenAI',
    providerGoogle: 'Google Gemini',
    apiKey: 'API Key',
    explainModelLabel: '解释模型（短）',
    deepenModelLabel: '深入模型',
    triggerSettings: '触发设置',
    triggerOnSelectionLabel: '选中文字时自动浮出解释按钮',
    selectionLengthPrefix: '选中长度限制：',
    selectionTo: '字至',
    selectionSuffix: '字',
    savedAt: '已保存',
    imageGenSection: '图片生成（🎨 生成）',
    imageGenHelp: 'Sonnet 看截图写 prompt，再用 Google Gemini 出图。需单独的 Google AI key（aistudio.google.com 免费获取）。',

    // Popup
    popupTitle: 'nodx Lens',
    settingsLink: '⚙ Settings',
    popupEmptyMain: '选中网页上的任意文字，会浮出「🔍 解释」按钮。',
    popupEmptyHint: '请先在 Settings 配好 API Key。',
    clearHistory: '清空历史',
  },
  en: {
    // Content script
    triggerLabel: '🔍 Explain',
    triggerExplainTitle: 'Have AI explain this',
    panelTitle: 'nodx Lens · Explanation',
    connecting: 'Connecting…',
    loading: 'Loading…',
    deepen: '📚 Deepen',
    copy: '📋 Copy',
    saveExplain: '📌 Save',
    saveSending: 'Sending…',
    saveSuccess: '✓ Saved',
    saveAppMissing: 'nodx desktop not detected',
    saveAppGetLink: 'Get the app →',
    errorPrefix: 'Error: {msg}',
    connectionBroken: 'Connection lost. Please try again.',
    extReloadedInline: 'Extension just updated. Please refresh this page.',
    extInvalidatedInline: 'Extension context invalidated. Please refresh this page.',
    extReloadedToast: '🔁 nodx Lens updated · refresh this page to continue',
    annotationTitle: 'Click to view · right-click to remove',

    // Service worker
    missingApiKey: 'Please set your API key in Settings first.',

    // Options page
    optionsTitle: 'nodx Lens — Settings',
    optionsSubtitle: 'All data stays on your machine. Nothing leaves your browser.',
    language: 'Language',
    languageAuto: 'Follow browser',
    languageZh: '中文',
    languageEn: 'English',
    aiProvider: 'AI Provider',
    providerAnthropic: 'Anthropic (Claude)',
    providerOpenAI: 'OpenAI',
    providerGoogle: 'Google Gemini',
    apiKey: 'API Key',
    explainModelLabel: 'Short explanation model',
    deepenModelLabel: 'Deep explanation model',
    triggerSettings: 'Trigger',
    triggerOnSelectionLabel: 'Show the explain button when text is selected',
    selectionLengthPrefix: 'Selection length:',
    selectionTo: 'to',
    selectionSuffix: 'chars',
    savedAt: 'Saved',
    imageGenSection: 'Image generation (🎨 Generate)',
    imageGenHelp: 'Sonnet writes a prompt from your screenshot, then Google Gemini renders it. Needs a separate Google AI key (free at aistudio.google.com).',

    // Popup
    popupTitle: 'nodx Lens',
    settingsLink: '⚙ Settings',
    popupEmptyMain: 'Select any text on any webpage to see the 🔍 Explain trigger.',
    popupEmptyHint: 'Set your API key in Settings first.',
    clearHistory: 'Clear history',
  },
} as const;

export type StringKey = keyof typeof STRINGS['en'];

let currentLocale: Locale = detectBrowserLocale();

function detectBrowserLocale(): Locale {
  const lang =
    (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage()) ||
    (typeof navigator !== 'undefined' && navigator.language) ||
    'en';
  return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function resolveLocale(setting: Language): Locale {
  return setting === 'auto' ? detectBrowserLocale() : setting;
}

export function setLocale(setting: Language): void {
  currentLocale = resolveLocale(setting);
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: StringKey, params?: Record<string, string>): string {
  let s = STRINGS[currentLocale][key] as string;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, v);
    }
  }
  return s;
}

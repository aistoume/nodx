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
    triggerQuickLabel: '💾 收',
    triggerExplainTitle: '让 AI 解释这段（消耗 API token）',
    triggerQuickTitle: '直接收藏到 nodx（不调用 AI · 已熟悉的词）',
    quickSavedToast: '💾 已收藏到 nodx',
    quickSavedDetail: '未调用 AI · 之后可在 nodx 里手动补解释',
    panelTitle: 'nodx Lens · 解释',
    connecting: '连接中…',
    loading: '加载中…',
    deepen: '📚 深入',
    saveToNodx: '💾 保存到 nodx',
    copy: '📋 复制',
    errorPrefix: '出错了：{msg}',
    connectionBroken: '连接中断，请重试。',
    extReloadedInline: '扩展刚刚更新，请刷新本页后再试。',
    extInvalidatedInline: '扩展上下文失效，请刷新本页。',
    extReloadedToast: '🔁 nodx Lens 已更新 · 请刷新本页继续使用',
    saveToNodxNotImpl: '「保存到 nodx」V2 实现',
    annotationTitle: '点击查看解释 · 右键删除',
    saved: '✓ 已保存',
    savedDetail: '已存为思考卡片 · Markdown 已复制到剪贴板',
    savedTryDesktop: '尝试唤起 nodx desktop…（未安装也无妨，卡片已存在本地）',
    openInNodxDesktop: '在 nodx desktop 中打开',
    nodxDesktopComing: 'nodx desktop 即将到来 — 关注 X 获得邀请',
    savedTabTitle: '已保存',
    savedEmpty: '选中文字时点「保存到 nodx」会把它存为思考卡片，等待 nodx desktop 接管时一键导入。',
    snippetsCleared: '已清空',

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
    triggerQuickLabel: '💾 Save',
    triggerExplainTitle: 'Have AI explain this (uses API tokens)',
    triggerQuickTitle: 'Just save to nodx (no AI call · for things you already understand)',
    quickSavedToast: '💾 Saved to nodx',
    quickSavedDetail: 'No AI call — you can ask for an explanation later in nodx',
    panelTitle: 'nodx Lens · Explanation',
    connecting: 'Connecting…',
    loading: 'Loading…',
    deepen: '📚 Deepen',
    saveToNodx: '💾 Save to nodx',
    copy: '📋 Copy',
    errorPrefix: 'Error: {msg}',
    connectionBroken: 'Connection lost. Please try again.',
    extReloadedInline: 'Extension just updated. Please refresh this page.',
    extInvalidatedInline: 'Extension context invalidated. Please refresh this page.',
    extReloadedToast: '🔁 nodx Lens updated · refresh this page to continue',
    saveToNodxNotImpl: '"Save to nodx" is V2.',
    annotationTitle: 'Click to view · right-click to remove',
    saved: '✓ Saved',
    savedDetail: 'Saved as a thinking card · Markdown copied to clipboard',
    savedTryDesktop: 'Trying to open nodx desktop… (works locally if not installed)',
    openInNodxDesktop: 'Open in nodx desktop',
    nodxDesktopComing: 'nodx desktop coming soon — follow on X for early invite',
    savedTabTitle: 'Saved',
    savedEmpty: 'Click "Save to nodx" while reading to capture a snippet here. nodx desktop will pick these up when it ships.',
    snippetsCleared: 'Cleared',

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

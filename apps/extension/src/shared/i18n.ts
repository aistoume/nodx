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
    triggerLabel: 'nodx',
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
    generatedForText: '🎨 已为这段文字生成图片 — 打开侧栏「生成记录」查看或保存。',

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
    providerOpenRouter: 'OpenRouter（免费模型）',
    providerNodx: 'nodx 本地（Claude Code · 免 key）',
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

    // Wheel editor (options)
    wheelSection: '动作轮自定义（截图四象菜单）',
    wheelHelp: '四个辐条（上/右/下/左）都可自定义：图标 emoji、名称、动作类型与参数；也可以改成子菜单（1–3 个子项）。「AI 回答」动作的提示词完全自定义 —— 解释、翻译、OCR 都靠它。',
    wheelPosUp: '上（蓝）',
    wheelPosRight: '右（琥珀）',
    wheelPosDown: '下（绿）',
    wheelPosLeft: '左（紫）',
    wheelModeAction: '单动作',
    wheelModeChildren: '子菜单',
    wheelKindPrompt: 'AI 回答（自定义提示词）',
    wheelKindSearch: 'AI 认图 → 打开网址',
    wheelKindSave: '保存',
    wheelKindGenerate: '生成图片',
    wheelEmojiPh: '图标',
    wheelLabelPh: '名称（可空）',
    wheelPromptPh: '随截图发送的提示词',
    wheelUrlPh: 'URL 前缀（末尾自动拼关键词），如 https://www.google.com/search?q=',
    wheelAddChild: '＋ 添加子项',
    wheelRemove: '删除',
    wheelSaveBtn: '保存动作轮',
    wheelResetBtn: '恢复默认',
    wheelInvalid: '每个按钮需要图标；提示词 / URL 不能为空；子菜单至少 1 个子项',
    wheelPreviewHint: '预览即时反映编辑效果；点带子菜单的辐条展开，点中心 ↩ 收回。',
    wheelColor: '按钮颜色',
    wheelColorReset: '恢复默认颜色',
    wheelLayoutSingle: '生成单图',
    wheelLayoutGrid: '生成 2×2 四格',
    wheelStylePh: '生成风格提示词 — {subject} 会被替换为 AI 认图出的主体描述',
    iconUpload: '上传图片…',
    iconManualPh: '或直接输入 emoji',

    // Popup
    popupTitle: 'nodx Lens',
    settingsLink: '⚙ Settings',
    popupEmptyMain: '选中网页上的任意文字，会浮出「🔍 解释」按钮。',
    popupEmptyHint: '请先在 Settings 配好 API Key。',
    clearHistory: '清空历史',
  },
  en: {
    // Content script
    triggerLabel: 'nodx',
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
    generatedForText: '🎨 An image was generated from this text — see the side panel history to view or save it.',

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
    providerOpenRouter: 'OpenRouter (free models)',
    providerNodx: 'nodx local (Claude Code · no key)',
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

    // Wheel editor (options)
    wheelSection: 'Action wheel (screenshot radial menu)',
    wheelHelp: 'All four spokes (up/right/down/left) are customizable: emoji icon, name, action kind and params — or turn a spoke into a submenu of 1–3 sub-items. The "AI answer" action takes a fully custom prompt (explain, translate, OCR…).',
    wheelPosUp: 'Up (blue)',
    wheelPosRight: 'Right (amber)',
    wheelPosDown: 'Down (green)',
    wheelPosLeft: 'Left (purple)',
    wheelModeAction: 'Single action',
    wheelModeChildren: 'Submenu',
    wheelKindPrompt: 'AI answer (custom prompt)',
    wheelKindSearch: 'AI identify → open URL',
    wheelKindSave: 'Save',
    wheelKindGenerate: 'Generate image',
    wheelEmojiPh: 'Icon',
    wheelLabelPh: 'Name (optional)',
    wheelPromptPh: 'Prompt sent with the screenshot',
    wheelUrlPh: 'URL prefix (keyword appended), e.g. https://www.google.com/search?q=',
    wheelAddChild: '+ Add sub-item',
    wheelRemove: 'Remove',
    wheelSaveBtn: 'Save wheel',
    wheelResetBtn: 'Restore defaults',
    wheelInvalid: 'Each button needs an icon; prompt/URL must not be empty; a submenu needs at least 1 sub-item',
    wheelPreviewHint: 'The preview mirrors your edits live — click a submenu spoke to fan it out, click the centre ↩ to collapse.',
    wheelColor: 'Button colour',
    wheelColorReset: 'Reset to default colour',
    wheelLayoutSingle: 'Single image',
    wheelLayoutGrid: '2×2 four-style grid',
    wheelStylePh: 'Style prompt — {subject} is replaced by the AI\'s description of the crop',
    iconUpload: 'Upload image…',
    iconManualPh: 'or type an emoji',

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

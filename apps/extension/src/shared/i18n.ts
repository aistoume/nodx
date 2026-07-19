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
    panelTitleInstruct: 'nodx Lens · 指令',
    followupPh: '追问，或下一条指令…',
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
    customPh: '你想做什么？如"给我解释一下""在淘宝打开这个"…',
    targetAiOption: '问 AI',
    targetNodxOption: 'nodx App',
    targetSending: '⏳ 发送中…',
    targetSent: '✓ 已发送',
    targetSentNodx: '📥 已发送到 nodx 灵感池',
    targetNodxMissing: 'nodx 桌面版未在运行 — 启动后重试',
    targetMissing: '发送目标不存在或 URL 为空，请到 ⚙ 设置检查「自定义发送目标」',
    targetsSection: '📮 自定义发送目标（✏️ 指令动作）',
    targetsHelp: '选中文字 → ✏️ 自定义指令时，除了问 AI，还能把「指令 + 选中文字」发到你自己的接口：本地 LLM、自动化服务、工作软件 webhook…',
    targetName: '名称',
    targetModeForward: '直接转发',
    targetModeAiForward: 'AI 先适配再转发',
    targetModeOpenAI: 'OpenAI 兼容接口',
    targetModelPh: '模型名，如 llama3.2',
    targetAdd: '添加目标',
    targetsContract: '契约：直接转发 / AI 先适配 → POST JSON {instruction, text, answer?, sourceUrl, sourceTitle, capturedAt}，响应带 reply/text/answer/output/message 字符串字段（或纯文本）时显示在结果面板。OpenAI 兼容接口 → 按 chat-completions 协议调本地端口（Ollama http://127.0.0.1:11434/v1/chat/completions、LM Studio :1234 等），回答直接进面板。',
    targetsCliHint: '💡 想用本地 Claude CLI（Claude Code 订阅、免 key）？不用配目标——终端跑 `npx nodx-lens-gateway`，再把上面 AI Provider 切到 nodx（本地网关），「问 AI」就会走 127.0.0.1:8787。装了 nodx 桌面 App 的话它自带网关，连命令都不用跑。',
    nativeSection: '本地 Claude 直连（免网关命令）',
    nativeHelp: 'Chrome 需要时自动拉起 claude CLI——无端口、无终端窗口。一次性安装：复制下面的命令在终端跑一遍（已自动带上你这个扩展的 ID），然后点「连接本地 Claude」授权。网关(:8787)不在时自动走这条路。需要 Node 18+ 和已登录的 Claude Code CLI。',
    nativeConnect: '连接本地 Claude',
    nativeChecking: '检测中…',
    nativeOk: '✓ native host 就绪 — 网关不在时自动直连本地 Claude',
    nativeNoPerm: '尚未授权 nativeMessaging — 点「连接本地 Claude」授权',
    nativeNoHost: '⚠ 已授权，但找不到 native host — 复制上面的命令在终端跑一遍再点「重新检测」；跑过还不行就重启 Chrome。（注意：商店版和开发版扩展 ID 不同，各自都要跑一次命令）',
    nativeCopyCmd: '复制安装命令',
    nativeCmdCopied: '✓ 已复制',
    nativeRecheck: '重新检测',
    optionsStaleError: '⚠ 保存失败：扩展刚重载过，这个设置页已失效 — 关闭本页后重新打开设置，再改一遍。',

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
    wheelKindInstruct: '唤起指令输入（用时现输）',
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
    wheelPresetCustom: '自定义 URL…',
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
    panelTitleInstruct: 'nodx Lens · Instruction',
    followupPh: 'Ask a follow-up, or give another instruction…',
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
    customPh: 'What do you want? e.g. "explain it to me", "open it on Amazon"…',
    targetAiOption: 'Ask AI',
    targetNodxOption: 'nodx App',
    targetSending: '⏳ Sending…',
    targetSent: '✓ Sent',
    targetSentNodx: '📥 Sent to nodx inspiration pool',
    targetNodxMissing: "nodx desktop isn't running — start it and retry",
    targetMissing: 'Send target missing or URL empty — check "Custom send targets" in ⚙ Settings',
    targetsSection: '📮 Custom send targets (✏️ instruction action)',
    targetsHelp: "When you run a ✏️ custom instruction on selected text, besides asking the AI you can send the instruction + text to your own endpoint: a local LLM, an automation server, a work tool's webhook…",
    targetName: 'Name',
    targetModeForward: 'Forward as-is',
    targetModeAiForward: 'AI adapts, then forward',
    targetModeOpenAI: 'OpenAI-compatible API',
    targetModelPh: 'model, e.g. llama3.2',
    targetAdd: 'Add target',
    targetsContract: 'Contract: forward / AI-adapt modes POST JSON {instruction, text, answer?, sourceUrl, sourceTitle, capturedAt}; a reply/text/answer/output/message string field (or plain-text body) in the response is shown in the result panel. OpenAI-compatible mode speaks chat-completions to a local port (Ollama http://127.0.0.1:11434/v1/chat/completions, LM Studio :1234, …) and shows the completion.',
    targetsCliHint: '💡 Want your local Claude CLI (Claude Code subscription, no key)? No target needed — run `npx nodx-lens-gateway` in a terminal, then switch the AI Provider above to nodx (local gateway); "Ask AI" goes through 127.0.0.1:8787. If you have the nodx desktop app, it ships the gateway built-in — no command needed.',
    nativeSection: 'Direct local Claude (no gateway command)',
    nativeHelp: 'Chrome spawns the claude CLI on demand — no port, no terminal window. One-time setup: copy the command below and run it once in a terminal (it already carries this extension\'s ID), then click "Connect local Claude". Used automatically whenever the gateway (:8787) is down. Needs Node 18+ and a logged-in Claude Code CLI.',
    nativeConnect: 'Connect local Claude',
    nativeChecking: 'Checking…',
    nativeOk: '✓ native host ready — falls back to local Claude when the gateway is down',
    nativeNoPerm: 'nativeMessaging not granted yet — click "Connect local Claude"',
    nativeNoHost: '⚠ Permission granted, but the native host was not found — copy the command above, run it once, then hit "Re-check"; restart Chrome if it still fails. (Store and unpacked installs have different extension IDs — run the command for each.)',
    nativeCopyCmd: 'Copy install command',
    nativeCmdCopied: '✓ Copied',
    nativeRecheck: 'Re-check',
    optionsStaleError: '⚠ Save failed: the extension was reloaded and this settings page is stale — close it, reopen Settings, and redo the change.',

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
    wheelKindInstruct: 'Ask for instruction (typed at use)',
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
    wheelPresetCustom: 'Custom URL…',
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

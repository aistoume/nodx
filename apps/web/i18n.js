/**
 * Lightweight site i18n. English lives in the HTML (no-JS + SEO default);
 * Chinese lives here in ZH, keyed by data-i18n on each element. Switching
 * swaps innerHTML (so inline <strong>/<a>/<code> survive) and remembers
 * the choice. Auto-selects zh on first visit for zh-* browsers.
 */
(function () {
  const KEY = 'nodx-site-lang';

  // key -> Chinese HTML. Only translated keys need an entry; anything
  // missing falls back to the English already in the page.
  const ZH = {
    // ── shared chrome ──
    'nav.home': '首页',
    'nav.nodx': 'nodx',
    'nav.pricing': '定价',
    'meta.title': 'nodx — 决策思考工作台 · Aicon Solutions',
    // ── nodx hub ──
    'hub.crumb': '<a href="/">Aicon</a> <span>›</span> <strong>nodx</strong>',
    'hub.lead1': '在这里，阅读变成思考，思考产生复利。',
    'hub.lead2': '多数 AI 工具替你回答问题。nodx 让你更会<em>提问</em>。一个建立在四条原则上的决策思考工作台：<strong>想得更宽</strong>（网状对话，而非线性聊天）、<strong>想得更深</strong>（专家团辩论，而非一问一答）、<strong>什么都不丢</strong>（批注、卡片、轨迹全部留存）、<strong>思考产生复利</strong>（过往决策变成可检索的案例库）。',
    'hub.ctaLens': '<span>从 nodx Lens 开始 →</span><small>Chrome 入口 —— 免费，自带 API key</small>',
    'hub.ctaDesktop': '完整 nodx 桌面版 ↓',
    'hub.ctaPricing': '定价 →',
    'hub.pipelineH': '流水线：阅读 → 思考 → 决策',
    'hub.p1h': '用 Lens 捕获',
    'hub.p1p': '在任意网页选中文字或框选区域 —— 解释、搜索、比价、生成。标记会留着待用。',
    'hub.p2h': '存成思考卡',
    'hub.p2p': '一键把任何解释变成片段包：原文 + AI 注解 + 来源链接。',
    'hub.p3h': '在 nodx 桌面版决策',
    'hub.p3p': '卡片成为起点。AI 专家辩论。结论变成原子动作。',
    'hub.pipelineCap': '别的工具止步于第 1 步。nodx 是第一个带你走完全程的产品。',
    'hub.featH': 'nodx 有何不同',
    'hub.f1h': '🪜 第一性原理拆解',
    'hub.f1p': 'AI 抛出未解的问题，而不是直接给答案。深入哪条路径由你掌控。',
    'hub.f2h': '🎙 专家团协议',
    'hub.f2p': '针对每个方向，多位 AI 专家（必有一位唱反调者）进行结构化的 4 轮辩论，直到收敛出<strong>局部最优</strong>结论。',
    'hub.f3h': '📌 会留存的批注',
    'hub.f3p': '每条解释、笔记、原子动作都锚定在触发它的原文上 —— 关掉不丢，点击即回。',
    'hub.f4h': '🧠 思考库（CBR）',
    'hub.f4p': '你完成过的决策变成一个已索引、可检索的案例库。新问题可以从旧案例 fork 改写，而不必从零重想。',
    'hub.f5h': '🚀 自动递进（预览）',
    'hub.f5p': '不止步于「这里有些想法」。一个项目经理 AI 会不断派生子讨论，直到结论具体可执行 —— 每一步都有你参与。',
    'hub.f6h': '🔐 默认本地优先',
    'hub.f6p': '你的思考存在自己机器上。自带 API key。没有服务器收集你所想。',
    'hub.ecoH': 'nodx 产品矩阵',
    'hub.lensH': '🌐 nodx Lens for Chrome',
    'hub.lensP': '选中文字或框选任意区域 → 动作轮盘：解释、搜索、比价、生成图、保存。截取物留在页面上，并汇入桌面版的灵感池。<strong>免费，自带 API key，无订阅。</strong>',
    'hub.lensCta': '了解 nodx Lens →',
    'hub.deskH': '🖥 nodx 桌面版（Beta）—— macOS &amp; Windows',
    'hub.deskP': '完整工作台：ComfyUI 式网络图，含<strong>素材节点与空白画布</strong>、专家团辩论、思考库、自动递进，以及把结论变成行动清单的<strong>思考 → 执行节点拆分</strong>。内置<strong>⌥+E 全局划词解释</strong>，还有一个灵感池自动收纳你在 Lens 里捕获的一切 —— 文字、截图、生成图。',
    'hub.deskCta': '下载 .dmg（Apple Silicon）→',
    'hub.deskMeta': 'Apple Silicon · macOS 12+ · v0.5.0 · 自带 API key · <a href="https://github.com/aistoume/nodx/releases/download/v0.5.0/nodx_0.5.0_x64-setup.exe" style="color:inherit;text-decoration:underline;">Windows .exe ↓</a> · <a href="https://github.com/aistoume/nodx/releases" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">更新日志 ↗</a>',
    'hub.petH': '🐣 nodx Lens —— 桌宠',
    'hub.petP': '浮在桌面的气泡，无需安装 nodx。单击出动作轮盘，双击框选屏幕任意区域，或按 <strong>⌥+E</strong> 把选中文字直接送进提问框。追问保留上下文，轮盘完全可自定义，每个方向都能调用你自己的 CLI —— <code>claude</code>、<code>ollama</code>、快捷指令。',
    'hub.petCta': '下载 .dmg（Apple Silicon）→',
    'hub.petMeta': 'macOS 12+ · 自带 key（Claude / GPT / Gemini）· 11 种语言 · <a href="https://github.com/aistoume/nodx/releases/tag/pet-v1.0.0" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">发布说明 ↗</a>',
    'hub.andH': '🤖 nodx Lens for Android',
    'hub.andP': '动作轮盘，在手机上全局可用。悬浮球浮在任意 app 上：框选区域 → 解释、搜索、比价、生成 —— 和扩展同一套可自定义轮盘。结果显示在卡片里，每个动作连同答案和链接都被记录。<strong>一次授权，之后静默截取。</strong>',
    'hub.andCta': '从 Google Play 安装 →',
    'hub.andMeta': 'Android 8+ · arm64 · 自带 key（Claude / GPT / Gemini 免费档 / OpenRouter 免费）· <a href="/nodx/lens/" style="color:inherit;text-decoration:underline;">详情 ↗</a>',
    'hub.statusLive': 'Live',
    'hub.statusBeta': 'Beta',
    'hub.statusNew': 'New · v1.0.0',
    'hub.statusPlay': 'Google Play · 公开测试',
    'hub.footTag': '让 AI 帮你想得更多，而不是更少。',
    'foot.support': '支持',
    'foot.privacy': '隐私',
    // ── company landing ──
    'land.tagline': '为思考而造的工具。',
    'land.projectsH': '产品',
    'land.nodxDesc': '一个决策思考工作台：把 AI 当陪练，而不是替身。',
    'land.lensDesc': '把网页上看到的任何东西变成 AI 动作的 Chrome 扩展。',
  };

  const CN_LABEL = { en: 'EN', zh: '中文' };

  function detect() {
    const s = localStorage.getItem(KEY);
    if (s) return s;
    return (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  function apply(lang) {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!el.dataset.i18nEn) el.dataset.i18nEn = el.innerHTML; // cache English
      el.innerHTML = lang === 'zh' && ZH[key] != null ? ZH[key] : el.dataset.i18nEn;
    });
    // <title> / meta description via data-i18n on <title>? handle title key
    if (lang === 'zh' && ZH['meta.title']) document.title = ZH['meta.title'];
    const btn = document.getElementById('lang-toggle');
    if (btn) btn.textContent = lang === 'zh' ? 'EN' : '中文'; // shows the OTHER lang
    localStorage.setItem(KEY, lang);
  }

  function mountToggle() {
    if (document.getElementById('lang-toggle')) return;
    const b = document.createElement('button');
    b.id = 'lang-toggle';
    b.type = 'button';
    b.setAttribute('aria-label', 'Switch language / 切换语言');
    b.addEventListener('click', () => apply(detect() === 'zh' ? 'en' : 'zh'));
    document.body.appendChild(b);
  }

  function boot() {
    mountToggle();
    apply(detect());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

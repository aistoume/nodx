# nodx Lens — Chrome Web Store 上架文案（v1.0.0）

按字段直接复制粘贴到 https://chrome.google.com/webstore/devconsole/ 对应输入框。
上传包：`apps/extension/nodx-lens-1.0.0.zip`（`pnpm build` 后 `cd dist && zip -qr ../nodx-lens-1.0.0.zip .`）。

---

## v1.0.4 更新说明（What's new — 贴到 Description 开头,替换 v1.0.0 段）

```
What's new in 1.0.4 — The instruction release
• ✏️ Type your own instruction: select text (or screenshot a region), hit the new Instruct spoke, and tell the AI exactly what to do — "translate to French", "extract the dates", "rewrite formally".
• Instructions that ACT: say "search this on arXiv / Temu / GitHub" and the extension opens the real search-results page for you (21 sites' URL patterns built in, plus your own wheel destinations).
• Follow-up conversations right in the result panel — clarify, refine, or fire another instruction without reselecting.
• Every instruction run lands in the side-panel history: instruction, answer, and a reopen link, with follow-ups on the same card.
• Send instructions to YOUR endpoints: forward selection+instruction to a local LLM (Ollama / LM Studio via OpenAI-compatible mode), an automation webhook, or let the AI adapt the content first.
• Run on your local Claude with no API key: `npx nodx-lens-gateway` (Claude Code subscription), or the new one-command native host for a zero-terminal direct connection (optional permission, off by default).
• Text and screenshot wheels are now ONE customizable wheel — edit once, applies everywhere. New default layout puts Instruct on the right spoke.
```

## v1.0.0 更新说明（历史存档）

```
What's new in 1.0 — The customization release
• The action wheel is fully yours: every spoke's icon (40-emoji library or upload your own image), name, colour, action, prompt, and submenus are editable — with a live wheel preview while you edit.
• 13 built-in search destinations: Google, Google Images, Google Shopping, Amazon, eBay, Taobao, JD, Xiaohongshu, Bing, YouTube, X, Wikipedia, Perplexity — pick from a dropdown; hand-written URL prefixes are now the advanced path.
• 5 AI providers with per-provider saved keys: Anthropic Claude, OpenAI GPT, Google Gemini (free AI-Studio tier works), OpenRouter FREE models (no cost, just a free key), and your local nodx gateway via a Claude Code subscription (no key at all).
• Quick model switcher right in the side panel header — change provider and model without opening Settings.
• AI answers now render as readable formatted text: bold, lists, inline code, links.
• Image generation gets choices: one clean render or the 2×2 style grid, with an editable style prompt.
• 1 GB local history budget with oldest-first cleanup; delete any capture box right on the page.
• An Android companion app is out too — same action wheel, system-wide on your phone: https://aicon.solutions/nodx/lens/
```

## Name (最多 45 字符)

```
nodx Lens — Inline AI Explanations
```

## Short description (最多 132 字符)

```
Select text or box any page region → AI explain, search, shop, or generate images. Captures stay marked and sync to nodx desktop.
```

中文版（zh-CN 区域）：
```
选中文字或框选网页任意区域 → AI 解释、搜索、购物、生成图片。标记持久保留，可同步到 nodx 桌面。
```

## Detailed description (English — primary listing)

```
What's new in 1.0 — The customization release
• The action wheel is fully yours: every spoke's icon (40-emoji library or upload your own image), name, colour, action, prompt, and submenus are editable — with a live wheel preview while you edit.
• 13 built-in search destinations: Google, Google Images, Google Shopping, Amazon, eBay, Taobao, JD, Xiaohongshu, Bing, YouTube, X, Wikipedia, Perplexity — pick from a dropdown; hand-written URL prefixes are now the advanced path.
• 5 AI providers with per-provider saved keys: Anthropic Claude, OpenAI GPT, Google Gemini (free AI-Studio tier works), OpenRouter FREE models (no cost, just a free key), and your local nodx gateway via a Claude Code subscription (no key at all).
• Quick model switcher right in the side panel header — change provider and model without opening Settings.
• AI answers now render as readable formatted text: bold, lists, inline code, links.
• Image generation gets choices: one clean render or the 2×2 style grid, with an editable style prompt.
• 1 GB local history budget with oldest-first cleanup; delete any capture box right on the page.
• An Android companion app is out too — same action wheel, system-wide on your phone: https://aicon.solutions/nodx/lens/

nodx Lens turns anything you see on a webpage — a phrase, a product photo, a chart — into instant AI action. Select text or box any region of the page, and an action wheel appears: Explain, Search, Shop, Generate, Save. Results stream in place. No tab-switching, no new chat thread to clutter, no copy-pasting into another tool.

═══════════════════════════════════════════
WHO IT'S FOR
═══════════════════════════════════════════

- Anyone reading long AI replies in a chat tool — get a side-channel definition without polluting your main conversation.
- Knowledge workers who skim research papers, Substack essays, technical docs, and want fast context on a term they don't know.
- Shoppers and collectors — box a product photo and jump straight to Google Shopping, Amazon, Taobao, or eBay, or turn it into style-exploration images.
- People who collect annotations as they read — every explanation leaves a persistent underline, every capture leaves a marked box you can revisit and act on again.

═══════════════════════════════════════════
CORE FEATURES
═══════════════════════════════════════════

🎡 One action wheel, two ways in — now fully customizable
Select text, or box any region of the page ("📸 Screenshot region" in the side panel). Either way the same four-spoke wheel appears: 🔍 Explain / Search, 💡 Save, 🛒 Shopping (Google Shopping or Amazon), 🎨 Generate — that's the stock layout. Every spoke is yours to change: icon (emoji library or your own uploaded image), name, colour, action kind, prompt text, and whether it fans out into a submenu of up to 3 sub-items. A live preview mirrors your edits as you type.

🔍 Select-to-explain
Highlight 2–500 characters on any webpage, pick Explain, and a panel slides in below the highlight with a streaming explanation — 50–150 words by default, tuned to be a quick definition with one concrete example. Answers render as formatted text: bold, lists, links.

👁 Vision on any region
Box a product photo, a chart, a UI — ask "what is this?" about the exact pixels. Visual search uses Google Lens when the region is a real image, and AI recognition + image search otherwise. Shopping lets the AI name the product, then opens your chosen destination with that query.

🧭 13 search destinations built in
The "AI identify → open URL" action ships with a preset library: Google Search, Google Images, Google Shopping, Amazon, eBay, Taobao, JD, Xiaohongshu, Bing, YouTube, X (Twitter), Wikipedia, Perplexity. Pick from a dropdown — or switch to "Custom URL…" and paste any search URL prefix you like.

🎨 Image generation
From selected text or a boxed region, generate one clean image or a 2×2 style grid — product photo, watercolor, 3D render, and line art — powered by Gemini's image model with your own key. The style prompt is an editable template, so you can define your own four styles.

📦 Boxes are action hubs
Every capture leaves a yellow highlight box on the page. Click the box to reopen the wheel and run more actions on the same capture — no re-selecting, no duplicate boxes. The corner badge summarizes what happened there: 💬 3 🔎 🎨 means three Q&A turns, a search, and a generated image. Click the badge to open that capture's card in the side panel. Hover a box to reveal a ✕ that deletes it right there.

🗂 The side panel remembers everything
Captures from the current page stay on top, each with its own Q&A thread for follow-up questions. A collapsible global history logs every search, shopping trip, and generated image with a "reopen" link. Text actions are logged too, as quote-card thumbnails. History self-manages within a 1 GB local budget, cleaning oldest entries first.

⚡ Switch models without leaving the page
The side panel header has a provider + model quick-switcher, synced two-way with Settings. Ask one question on Haiku, the next on Sonnet.

📌 Persistent underlines
When an explanation finishes, the selected text gets an underline that stays on the page. Click any underline later to bring the panel back with the same explanation (no extra API call). Right-click to delete. Text-generated images leave an underline marker on their source text as well.

📚 Deepen on demand
The panel has a "deepen" button that swaps in a longer 200–400 word explanation — mechanism, example, common misconceptions, or contrast with adjacent ideas. You decide when to spend more tokens.

🌊 Real streaming
Words appear as the model generates them. You can tell within the first sentence whether the answer is what you wanted — and close the panel early if it's off-track.

🖥 Works with nodx desktop (optional)
If the nodx desktop app is running, captures and saved snippets sync into its inspiration pool over 127.0.0.1 — your machine only, no cloud hop. The desktop's local gateway can even serve as your AI provider ("nodx local"): AI calls run through your Claude Code subscription, no API key needed. The extension is fully useful without it.

📱 And on your phone
nodx Lens for Android puts the same action wheel over any app via a floating bubble — box a region, explain / search / shop / generate, everything logged. APK and details: https://aicon.solutions/nodx/lens/

═══════════════════════════════════════════
PRIVACY
═══════════════════════════════════════════

This extension does not have a backend. We do not run a server.

✓ Your API keys, settings, captures, and history live only in chrome.storage.local on your own machine. Each provider's key is stored separately — switching providers never loses a key.
✓ When you trigger an action, the request goes directly from your browser to the AI provider you configured — never through any nodx-controlled server.
✓ Desktop sync targets 127.0.0.1 (your own computer) and can be switched off with one checkbox.
✓ No analytics, no telemetry, no third-party trackers, no ads.

Full privacy policy is linked from the listing.

═══════════════════════════════════════════
HOW IT WORKS (2-MINUTE SETUP)
═══════════════════════════════════════════

1. Install the extension.
2. Settings opens automatically on first install.
3. Pick a provider: Anthropic, OpenAI, Google, OpenRouter (free models), or nodx local.
4. Paste your own API key (from the provider's console — you keep full control of usage and billing). OpenRouter keys are free at openrouter.ai/keys; nodx local needs no key at all.
5. For image generation, add a Google AI key (Gemini image model — the free AI-Studio tier works).
6. Go to any webpage — highlight something, or open the side panel and box a region.

═══════════════════════════════════════════
WHY BRING-YOUR-OWN-KEY INSTEAD OF A SUBSCRIPTION
═══════════════════════════════════════════

- Privacy: your queries go to your provider account, not a middleman's.
- Pay-as-you-go: a typical short explanation costs a fraction of a cent on Haiku- or Flash-class models. Light users will pay less than any flat subscription would charge — and OpenRouter's free models cost nothing at all.
- Model freedom: swap providers or models any time, even mid-page from the side panel. You're never locked in.
- Transparency: you can see your own API console for exactly what was sent and what it cost.

═══════════════════════════════════════════
SUPPORTED MODELS
═══════════════════════════════════════════

- Anthropic — claude-haiku-4-5 (default for short explanations, fast and cheap), claude-sonnet-5 and claude-opus-4-8 (deep explanations and vision)
- OpenAI — gpt-5.6-luna, gpt-5.6-terra, gpt-5.6-sol
- Google — gemini-3.5-flash, gemini-3.1-flash-lite, gemini-3-pro; gemini-3.1-flash-image or gemini-3-pro-image for image generation
- OpenRouter — openrouter/free (auto-picks a capable free vision model), Gemma 4 free models, Nemotron free models — $0 with a free key
- nodx local — haiku / sonnet / opus tiers through your Claude Code subscription, no API key

You can change the picked model per provider in Settings any time — or from the side panel's quick switcher.

═══════════════════════════════════════════
PERMISSIONS, IN PLAIN ENGLISH
═══════════════════════════════════════════

- "Read and change all your data on all websites" — sounds scary; in practice, it's because the extension has to be ready to activate when you select text or box a region on whatever page you're reading. It does not read or modify page contents unless you explicitly act.
- "Storage" (incl. unlimitedStorage) — to keep your API keys, settings, captures, and history on your local machine. The extension self-enforces a 1 GB cap and cleans oldest history first.
- "Side panel" — the extension's main surface: your captures, Q&A threads, and action history.
- "Clipboard write" — the Copy button on answers.
- "Host permissions" to api.anthropic.com, api.openai.com, generativelanguage.googleapis.com, openrouter.ai — so the extension can talk directly to whichever AI provider you chose. Plus 127.0.0.1:8787 for optional sync to your own nodx desktop app.

═══════════════════════════════════════════
CONTACT / FEEDBACK
═══════════════════════════════════════════

X (Twitter): https://x.com/LaoMo9394

nodx is a small toolkit for thinking with AI as a sparring partner, not a replacement. Lens is the lightweight browser entry point. A networked decision-thinking desktop app and an Android companion ship alongside it.
```

## Detailed description (中文版 — 用作 zh-CN 区域 localization)

```
1.0 新特性 — 自定义大版本
• 动作轮完全可自定义：每个辐条的图标（40 个预设 emoji 或上传自己的图片）、名称、颜色、动作、提示词、子菜单，全部可改，配实时轮盘预览
• 内置 13 个搜索目的地：Google / 谷歌图搜 / Google Shopping / 亚马逊 / eBay / 淘宝 / 京东 / 小红书 / Bing / YouTube / X / 维基 / Perplexity——下拉即选，手写 URL 变成进阶通道
• 5 家 AI，key 各自独立保存：Claude / GPT / Gemini（AI Studio 免费档可用）/ OpenRouter 免费模型（零成本）/ nodx 本地网关（走 Claude Code 订阅，完全免 key）
• 侧栏顶部直接切换 provider 和模型，不用进设置
• AI 回答排版化显示：加粗、列表、行内代码、链接
• 生图可选单图或 2×2 四风格，风格提示词可编辑
• 本地历史 1GB 配额，自动清理最旧记录；页面上的截图框可悬停直接删除
• Android 伴生 app 同步上线——同一个动作轮，手机全局可用：https://aicon.solutions/nodx/lens/

nodx Lens 把网页上你看到的任何东西——一段文字、一张商品图、一幅图表——变成即时的 AI 行动。选中文字或框选页面任意区域，四向动作轮浮现：解释 / 搜索 / 购物 / 生成 / 保存。结果原地流式呈现，每次捕获都在页面留下标记、在侧栏留下记录。

═══════════════════════════════════════════
两个入口，同一个动作轮 —— 现在完全属于你
═══════════════════════════════════════════

✍️ 选中文字 或 📸 框选区域（侧栏「Screenshot region」），同一个轮盘浮现：
  🔍 解释 — 对文字或框住的像素问「这是什么」，流式回答带排版
  🔎 搜索 — AI 认图出关键词，13 个内置目的地任选（或自定义 URL）
  🛒 购物 — AI 认出商品名，直开 Google Shopping / 亚马逊 / 淘宝 / 京东
  🎨 生成 — 单图或 2×2 四风格（商品照 / 水彩 / 3D / 线稿），风格模板可改
  💡 保存 — 存进 nodx 桌面灵感池

以上只是出厂布局——图标、名称、颜色、提示词、子菜单全部可改，设置页有实时预览。

═══════════════════════════════════════════
框就是操作枢纽
═══════════════════════════════════════════

每次框选都会在页面留下黄色高亮框——而且框一直有用：

• 点框身 → 动作轮为这次捕获重开，解释、购物、生成随点随用，不必重新框选
• 每个动作都记在框上，角标一眼读懂：💬 3 🔎 🎨 = 三轮问答 + 一次搜索 + 一张生成图
• 同一区域永远只有一个框；悬停出 ✕ 可就地删除
• 点角标 → 侧栏打开并定位到这张卡

═══════════════════════════════════════════
侧栏记住一切
═══════════════════════════════════════════

• 当前页的捕获卡置顶，每张卡有独立问答串，可对同一张截图持续追问
• 全局记录（可折叠）留存每次搜索/购物/生成，一键「重新打开」结果页
• 侧栏顶部就能切 provider / 模型，与设置页双向同步
• 高亮框按 URL 跨会话保留；本地历史 1GB 配额自动清理最旧

═══════════════════════════════════════════
与 nodx 桌面版联动（可选）
═══════════════════════════════════════════

nodx 桌面 app 运行时，捕获与保存的内容会经 127.0.0.1 同步进它的灵感池——只在你自己的机器内流动。桌面版的本地网关还能直接当 AI 后端（「nodx local」）：AI 调用走你的 Claude Code 订阅，一个 API key 都不用填。不装桌面版，扩展本身也完整可用。

═══════════════════════════════════════════
隐私
═══════════════════════════════════════════

✅ 完全本地：API key（各家独立保存）、捕获、历史、设置都只存在你本机的 chrome.storage.local
✅ 直连：AI 调用从你的浏览器直发提供商，nodx 没有任何服务器
✅ 桌面同步只走 127.0.0.1（你自己的电脑），可随时关闭
✅ 零追踪：没有任何 analytics / telemetry / 广告

═══════════════════════════════════════════
配置（一次性 2 分钟）
═══════════════════════════════════════════

1. 安装扩展，Settings 自动打开
2. 选 provider：Anthropic / OpenAI / Google / OpenRouter（免费模型）/ nodx local
3. 贴你自己的 API key（OpenRouter 的 key 在 openrouter.ai/keys 免费领；nodx local 不用 key）
4. 想用图片生成，再配一个 Google AI key（AI Studio 免费档即可）
5. 任意网页选文字或框选区域，点动作轮开用

═══════════════════════════════════════════
支持的模型
═══════════════════════════════════════════

• Anthropic：claude-haiku-4-5（短解释）/ claude-sonnet-5、claude-opus-4-8（深入解释 + vision）
• OpenAI：gpt-5.6-luna / gpt-5.6-terra / gpt-5.6-sol
• Google：gemini-3.5-flash / gemini-3.1-flash-lite / gemini-3-pro；出图用 gemini-3.1-flash-image 或 gemini-3-pro-image
• OpenRouter：openrouter/free（自动挑带视觉的免费模型）等免费模型，零成本
• nodx local：走 Claude Code 订阅的 haiku / sonnet / opus 档

设置页或侧栏顶部随时可换。

═══════════════════════════════════════════
联系 / 反馈
═══════════════════════════════════════════

X (Twitter)：https://x.com/LaoMo9394

nodx 是一套「AI 陪你想」的工具集。Lens 是浏览器端的轻量入口，桌面端是完整的网状决策思考工作台，Android 端把动作轮带到手机全局。
```

---

## Category

```
Productivity
```

## Language

```
Primary: English
Additional: Chinese (Simplified)
```

---

## Single purpose justification (必填)

```
nodx Lens has a single purpose: let the user act on visible page content with AI. When the user selects text or boxes a region of the page they are reading, an action wheel appears and the user picks what to do with that capture — get an AI explanation, run an AI-identified search, generate an image from it, or save it. Every action is explicitly user-initiated, operates on the user's own selection, and uses the AI provider and API key the user configured in settings (Anthropic, OpenAI, Google, OpenRouter, or a local nodx gateway).
```

## Permissions justifications

### activeTab
```
We use activeTab for two features that are both directly initiated by a user click on the extension icon or a button in the side panel:

1. Inject the explanation panel and action wheel (Shadow DOM overlays) into the current page so text-selection actions appear in the right context.

2. chrome.tabs.captureVisibleTab so the user can marquee-select a region of the page they're reading. The screenshot bytes never leave the user's machine except (a) the cropped region the user submits to the AI provider they configured, and (b) optionally to the local nodx desktop app running on 127.0.0.1.

The content script never reads or modifies page contents on its own — it activates only in response to explicit user actions (text selection + clicking the trigger, or clicking "Screenshot region" in the side panel).
```

### sidePanel
```
We use Chrome's sidePanel API to show a per-tab "inspiration inbox" that lists every screenshot the user has taken on the current webpage, plus their Q&A history for each one, a collapsible global log of past searches / shopping trips / generated images, and a quick provider+model switcher. The side panel is the extension's main surface — clicking the toolbar icon opens/closes it. All data shown in the side panel comes from the user's own chrome.storage.local; nothing is fetched from a nodx server.
```

### clipboardWrite
```
Used only for explicit, user-initiated copy actions: the "Copy" button in the explanation panel (copies the AI explanation text), the copy spoke of the text-selection menu (copies the selected text), and the image hand-off flow where the user chooses to copy a captured or AI-generated image so they can paste it into an external site (e.g. an image search engine). Nothing is ever written to the clipboard without the user clicking a copy control, and the extension never reads the clipboard.
```

### scripting
```
Used exclusively to inject the extension's OWN declared content scripts: (1) into tabs that were already open when the extension is installed or updated — otherwise features would not work on existing tabs until each page is manually reloaded; and (2) as a one-time retry when messaging a tab whose content script is missing (e.g. after a service-worker restart). We only ever inject the same files listed under content_scripts in the manifest, never remote code or dynamically generated scripts.
```

### storage
```
We use storage to persist (1) the user's API keys — one slot per provider (Anthropic / OpenAI / Google / OpenRouter), so switching providers never loses a key; (2) their model preferences, language, and UI settings; (3) the user's action-wheel customization (icons, names, colours, prompts, submenus); and (4) a local history of captures with their Q&A threads and action log. All stored data lives only in chrome.storage.local on the user's own computer. We do not have a server, and keys are never transmitted anywhere except directly to the corresponding AI provider.
```

### unlimitedStorage
```
The capture history stores screenshot thumbnails and AI-generated images as data URLs, which real-world usage pushes past chrome.storage.local's default 10 MB quota within days (users hit QUOTA_BYTES errors in v0.8). unlimitedStorage removes the hard quota; the extension then enforces its OWN budget in code: total local storage is capped at 1 GB, and when the cap is reached the oldest history entries are deleted first (down to 85% of the budget). Users can also delete any individual capture or clear history manually. All of this data is local-only — nothing is uploaded anywhere.
```

### nativeMessaging (OPTIONAL permission — off by default)

Declared under optional_permissions and requested ONLY when the user explicitly clicks "Connect local Claude" in Settings. It connects to a native messaging host the user installs themselves beforehand (an open-source one-command script shown on the same Settings page), which bridges to their locally installed Claude Code CLI — so AI requests can run through the user's own local Claude session with no API key, and no data ever leaves their machine. If the user never opts in, the permission is never requested and no native host is contacted. It is never triggered by web content.

### Host permission — http://127.0.0.1:8787/*
```
Two optional integrations with the companion nodx desktop app, both strictly loopback-local:

1. Capture sync: when the desktop app is running, the extension can (toggle in the side panel) POST a captured screenshot or saved snippet to the desktop's local HTTP server so it lands in its inspiration pool. If the app isn't running, the POST silently fails and the extension is unaffected.

2. "nodx local" AI provider: the user can select their own local nodx gateway (the desktop app's built-in gateway, or a CLI gateway they run themselves) as the AI backend. AI requests then go to 127.0.0.1:8787 instead of a cloud provider, authenticated by the user's local session — useful for Claude Code subscribers who don't want to manage an API key.

127.0.0.1 traffic never leaves the user's own machine.
```

### Host permissions (api.anthropic.com / api.openai.com / generativelanguage.googleapis.com / openrouter.ai)
```
The extension calls the AI provider the user selected — Anthropic, OpenAI, Google, or OpenRouter — directly from the user's browser using the API key the user supplied. We do not proxy these calls through any nodx-controlled server. host_permissions for these four hostnames is necessary so fetch() can reach the provider from the extension's contexts. openrouter.ai was added in 1.0 to offer a zero-cost option (OpenRouter's free model tier).
```

### Why <all_urls> in content_scripts + host_permissions
```
Two reasons:

1. Content script <all_urls> — the extension's value is that "select text, get an explanation" and "screenshot a region" work on ANY webpage the user happens to be reading. We do not know in advance which sites they will read. The content script is otherwise inert — it observes selection events and installs an idle highlight-layer, but does not read page contents until the user actively clicks the "🔍 explain" floating button or the "📸 Screenshot region" button in the side panel.

2. host_permissions <all_urls> — Chrome's activeTab permission is granted only when the user directly invokes the extension via toolbar click, keyboard shortcut, or context menu. Clicking a button inside the side panel does NOT count as invocation, so activeTab is NOT available at the moment the user clicks "📸 Screenshot region" in the side panel — even though they clearly asked for a screenshot of the visible tab. host_permissions <all_urls> is required for chrome.tabs.captureVisibleTab() to work in this UX. The screenshot bytes never leave the user's machine except the cropped region the user submits to their chosen AI provider, and (optionally, toggleable) to their own nodx desktop app on 127.0.0.1.
```

### Remote code
```
No — all code ships inside the extension package. No remote scripts, no eval, no dynamically loaded code.
```

---

## Privacy practices declarations (Chrome Web Store form fields)

| Question | Answer |
|---|---|
| Does your extension collect user data? | 只勾 **Website content**（用户主动框选/选中的文字与截图区域会发给其配置的第三方 AI 提供方；nodx 无服务器、不留存） |
| Personally identifiable information (PII)? | No |
| Health information? | No |
| Financial / payment info? | No |
| Authentication info? | No（API key 仅存本机，只发往对应提供方） |
| Personal communications? | No |
| Location? | No |
| Web history? | No |
| User activity? | No |
| Certifications | ✅ Not sold to third parties ✅ Not used/transferred for unrelated purposes ✅ Not for creditworthiness/lending —— 三项全勾 |

Privacy policy URL: `https://aicon.solutions/privacy.html`

---

## 截图（1280×800，已生成在 docs/launch-assets/）

由 headless Chrome + chrome-API 桩渲染真实 dist 生成（发版可重跑，方法见 launch 文档）：

1. **lens-10-settings.png** — 设置页（5 provider + 模型选择）
2. **lens-10-wheel-editor.png** — 轮盘编辑器 + 实时预览
3. **lens-10-wheel-presets.png** — 搜索预设库下拉
4. **lens-10-sidepanel.png** — 侧栏问答卡（Markdown 渲染 + 模型切换器）合成主视觉

0.9 的页面实拍轮盘图（`apps/web/screenshots/lens-09-wheel.png`）可继续当第一张。

## 宣传素材

- Small Tile 440×280：沿用现有 `apps/web/promo/small-tile.png`
- Promotional video：https://youtu.be/V-QNjle1uBk（Android 演示，70s）

---

## 更新发版步骤（1.0 起）

```
1. bump manifest version → pnpm build → cd dist && zip -qr ../nodx-lens-<ver>.zip .
2. Dev Console → 该条目 → Package → Upload new package
3. Store listing：What's new 段替换、截图按需更新
4. Privacy 表单：权限无变化时不用动；新增 host/permission 必须补 justification
5. Submit for review（权限无新增通常 1–3 天）
```

## 上架前自检 checklist

- [ ] manifest 版本号已 bump（当前 1.0.0）
- [ ] manifest 没多余权限
- [ ] Privacy policy URL 可访问（https://aicon.solutions/privacy.html）
- [ ] icons 四档 PNG 都在 dist 里
- [ ] dist 用 prod build（pnpm build 而非 dev）
- [ ] 截图为当前版本 UI
- [ ] 描述里没提任何竞品名（FunBlocks / Glasp / Grammarly / ChatGPT 等都不要提）
- [ ] 描述里没夸大（不写"100%"、"零错误"、"最佳"）
- [ ] 各 provider 的 API key 实测能用（含 OpenRouter 免费档、nodx local）
- [ ] 在 incognito / fresh profile 测 onboarding 流程

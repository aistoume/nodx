# nodx Lens — Chrome Web Store 上架文案

按字段直接复制粘贴到 https://chrome.google.com/webstore/devconsole/ 对应输入框。

---

## v0.9.0 更新说明（What's new — 贴到 Description 开头）

```
What's new in 0.9.0 — Boxes become action hubs

• Click any highlight box to reopen the action wheel — run Explain, Visual Search, Shopping, or Image Generation on the same capture. Every action is logged onto that box (💬 🔎 🛒 🎨 badges); one region never grows duplicate boxes.
• Search, Shopping, and Generate now leave a highlight box right where you captured, with results one click away in the side panel.
• Text selections get the full action wheel too: Explain / Search / Shopping / Generate / Save — all logged with quote-card thumbnails; text-generated images leave an underline marker on the source text.
• Side panel redesigned: current-page captures stay on top; global history is collapsible.
• Fixed: highlight boxes no longer cover a site's own popups; card delete buttons no longer get clipped.
```

## Name (最多 45 字符)

```
nodx Lens — Inline AI Explanations
```

## Short description (最多 132 字符)

```
Select text or box any page region → AI explain, search, shop, or generate images. Captures stay marked and sync to nodx desktop.
```

中文版（如做 zh-CN 区域）：
```
选中文字或框选网页任意区域 → AI 解释、搜索、购物、生成图片。标记持久保留，可同步到 nodx 桌面。
```

## Detailed description (English — primary listing)

```
nodx Lens turns anything you see on a webpage — a phrase, a product photo, a chart — into instant AI action. Select text or box any region of the page, and an action wheel appears: Explain, Search, Shop, Generate, Save. Results stream in place; every capture stays marked on the page and logged in the side panel.

═══════════════════════════════════════════
TWO WAYS IN, ONE ACTION WHEEL
═══════════════════════════════════════════

✍️ Select text → the wheel offers:
  🔍 Explain — a streaming AI explanation right under the selection (short first, "deepen" for a 200–400 word version)
  🔎 Search — Google the exact phrase in a new tab
  🛒 Shop — jump to Google Shopping or Amazon with the phrase as the query
  🎨 Generate — turn the text into an AI image (a 2×2 style grid: product photo / watercolor / 3D render / line art)
  💡 Save — send the snippet to the nodx desktop inspiration pool

📸 Box a region (Screenshot region in the side panel) → the same wheel, powered by vision:
  🔍 Explain — ask the AI "what is this?" about the exact pixels you boxed
  🔎 Visual search — Google Lens when the region is a real image, AI-recognition + image search otherwise
  🛒 Shop — the AI names the product, then opens Google Shopping or Amazon with that query
  🎨 Generate — the AI describes the subject, then generates the 2×2 style grid
  💡 Save — keep the crop as an inspiration card

═══════════════════════════════════════════
BOXES ARE ACTION HUBS
═══════════════════════════════════════════

Every region capture leaves a yellow highlight box on the page — and the box stays useful:

• Click the box → the action wheel reopens for that same capture. Explain it, shop it, generate from it — no re-selecting.
• Every action is logged onto the box. Its corner badge tells the story at a glance: 💬 3 🔎 🎨 means three Q&A turns, a search, and a generated image.
• One region, one box — repeat actions never stack duplicates.
• Click the corner badge → the side panel opens focused on that capture's card.

═══════════════════════════════════════════
THE SIDE PANEL REMEMBERS EVERYTHING
═══════════════════════════════════════════

• Captures from the page you're reading stay on top, each with its own Q&A thread — keep asking follow-up questions about the same screenshot.
• A global, collapsible history logs every search, shopping trip, and generated image — with a "reopen" link to jump back to the results tab.
• Text actions are logged too, as quote-card thumbnails of the selected words.
• Highlight boxes persist per-URL across sessions; explanations re-open without a second API call.

═══════════════════════════════════════════
WORKS WITH NODX DESKTOP (OPTIONAL)
═══════════════════════════════════════════

If the nodx desktop app is running, captures and saved snippets sync into its inspiration pool over 127.0.0.1 — your machine only, no cloud hop. From there they become material for nodx's networked decision-thinking workspace. The extension is fully useful without the desktop app.

═══════════════════════════════════════════
PRIVACY
═══════════════════════════════════════════

This extension does not have a backend. We do not run a server.

✓ Your API keys, settings, captures, and history live only in chrome.storage.local on your own machine.
✓ AI requests go directly from your browser to the provider you configured — never through any nodx-controlled server.
✓ Desktop sync targets 127.0.0.1 (your own computer) and can be switched off.
✓ No analytics, no telemetry, no third-party trackers, no ads.

Full privacy policy is linked from the listing.

═══════════════════════════════════════════
HOW IT WORKS (2-MINUTE SETUP)
═══════════════════════════════════════════

1. Install the extension — Settings opens automatically.
2. Pick a provider: Anthropic, OpenAI, or Google, and paste your own API key (you keep full control of usage and billing).
3. For image generation, add a Google AI key (Gemini image model).
4. Select text or click "📸 Screenshot region" in the side panel — and pick a spoke on the wheel.

═══════════════════════════════════════════
WHY BRING-YOUR-OWN-KEY INSTEAD OF A SUBSCRIPTION
═══════════════════════════════════════════

• Privacy: your queries go to your provider account, not a middleman's.
• Pay-as-you-go: a short explanation costs a fraction of a cent on Haiku- or Flash-class models.
• Model freedom: swap providers or models any time. You're never locked in.
• Transparency: your own API console shows exactly what was sent and what it cost.

═══════════════════════════════════════════
SUPPORTED MODELS
═══════════════════════════════════════════

• Anthropic — claude-haiku-4-5 (short explanations), claude-sonnet-5 (deep explanations & vision)
• OpenAI — gpt-4o-mini, gpt-4o, gpt-5
• Google — gemini-2.5-flash, gemini-2.5-pro; gemini-2.5-flash-image for image generation

Change models per provider in Settings any time.

═══════════════════════════════════════════
PERMISSIONS, IN PLAIN ENGLISH
═══════════════════════════════════════════

• "Read and change all your data on all websites" — the extension must be ready to activate when you select text or box a region on whatever page you're reading. It does not read or modify page contents until you explicitly act.
• "Storage" — your API keys, settings, captures, and history, kept on your local machine.
• Host permissions to the AI providers — so your browser can call them directly.
• 127.0.0.1:8787 — optional sync to your own nodx desktop app.

═══════════════════════════════════════════
CONTACT / FEEDBACK
═══════════════════════════════════════════

X (Twitter): https://x.com/LaoMo9394

nodx is a small toolkit for thinking with AI as a sparring partner, not a replacement. Lens is the lightweight browser entry point; a networked decision-thinking desktop app ships alongside it.
```

## Detailed description (中文版 — 用作 zh-CN 区域 localization)

```
nodx Lens 把网页上你看到的任何东西——一段文字、一张商品图、一幅图表——变成即时的 AI 行动。选中文字或框选页面任意区域，四向动作轮浮现：解释 / 搜索 / 购物 / 生成 / 保存。结果原地流式呈现，每次捕获都在页面留下标记、在侧栏留下记录。

═══════════════════════════════════════════
两个入口，同一个动作轮
═══════════════════════════════════════════

✍️ 选中文字：
  🔍 解释 — 选区下方流式 AI 解释（先短版，「深入」换 200–400 字详解）
  🔎 搜索 — 新标签页直接 Google 这段文字
  🛒 购物 — 以文字为关键词跳 Google Shopping 或 Amazon
  🎨 生成 — 把文字变成 AI 图片（2×2 四风格：商品照 / 水彩 / 3D 渲染 / 线稿）
  💡 保存 — 存进 nodx 桌面灵感池

📸 框选区域（侧栏「Screenshot region」）：同一个轮盘，vision 加持：
  🔍 解释 — 对着框住的像素问「这是什么」
  🔎 以图搜 — 真实图片直接 Google Lens；否则 AI 认图后图片搜索
  🛒 购物 — AI 认出商品名，再开 Google Shopping / Amazon
  🎨 生成 — AI 描述主体后生成 2×2 风格图
  💡 保存 — 截图存成灵感卡

═══════════════════════════════════════════
框就是操作枢纽
═══════════════════════════════════════════

每次框选都会在页面留下黄色高亮框——而且框一直有用：

• 点框身 → 动作轮为这次捕获重开，解释、购物、生成随点随用，不必重新框选
• 每个动作都记在框上，角标一眼读懂：💬 3 🔎 🎨 = 三轮问答 + 一次搜索 + 一张生成图
• 同一区域永远只有一个框，重复操作不叠框
• 点角标 → 侧栏打开并定位到这张卡

═══════════════════════════════════════════
侧栏记住一切
═══════════════════════════════════════════

• 当前页的捕获卡置顶，每张卡有独立问答串，可对同一张截图持续追问
• 全局记录（可折叠）留存每次搜索/购物/生成，一键「重新打开」结果页
• 文字动作同样留档，缩略图是选中文字的引用卡
• 高亮框按 URL 跨会话保留；解释可原地重开，不重复扣 API 费用

═══════════════════════════════════════════
与 nodx 桌面版联动（可选）
═══════════════════════════════════════════

nodx 桌面 app 运行时，捕获与保存的内容会经 127.0.0.1 同步进它的灵感池——只在你自己的机器内流动，之后成为 nodx 网状决策思考的素材。不装桌面版，扩展本身也完整可用。

═══════════════════════════════════════════
隐私
═══════════════════════════════════════════

✅ 完全本地：API key、捕获、历史、设置都只存在你本机的 chrome.storage.local
✅ 直连：AI 调用从你的浏览器直发提供商，nodx 没有任何服务器
✅ 桌面同步只走 127.0.0.1（你自己的电脑），可随时关闭
✅ 零追踪：没有任何 analytics / telemetry / 广告

═══════════════════════════════════════════
配置（一次性 2 分钟）
═══════════════════════════════════════════

1. 安装扩展，Settings 自动打开
2. 选 provider：Anthropic / OpenAI / Google，贴你自己的 API key
3. 想用图片生成，再配一个 Google AI key（Gemini 出图模型）
4. 任意网页选文字或框选区域，点动作轮开用

═══════════════════════════════════════════
支持的模型
═══════════════════════════════════════════

• Anthropic：claude-haiku-4-5（短解释）/ claude-sonnet-5（深入解释 + vision）
• OpenAI：gpt-4o-mini / gpt-4o / gpt-5
• Google：gemini-2.5-flash / gemini-2.5-pro；出图用 gemini-2.5-flash-image

═══════════════════════════════════════════
联系 / 反馈
═══════════════════════════════════════════

X (Twitter)：https://x.com/LaoMo9394

nodx 是一套「AI 陪你想」的工具集。Lens 是浏览器端的轻量入口，桌面端是完整的网状决策思考工作台。
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
nodx Lens has a single purpose: provide on-page AI explanations for user-selected text. When the user selects text on any webpage, the extension shows a "🔍 explain" button that, on click, opens a panel containing an AI-generated explanation streamed directly from the AI provider the user configured in settings (Anthropic, OpenAI, or Google).
```

## Permissions justifications

### activeTab
```
We use activeTab for two features that are both directly initiated by a user click on the extension icon or a button in the side panel:

1. Inject the explanation panel (a Shadow DOM overlay) into the current page so text-selection explanations appear in the right context.

2. chrome.tabs.captureVisibleTab so the user can marquee-select a region of the page they're reading. The screenshot bytes never leave the user's machine except (optionally) to the local nodx desktop app running on 127.0.0.1.

The content script never reads or modifies page contents on its own — it activates only in response to explicit user actions (text selection + clicking the trigger, or clicking "Screenshot region" in the side panel).
```

### sidePanel
```
We use Chrome's sidePanel API to show a per-tab "inspiration inbox" that lists every screenshot the user has taken on the current webpage, plus their Q&A history for each one. The side panel replaces the small popup from previous versions as the extension's main surface — clicking the toolbar icon opens/closes it. All data shown in the side panel comes from the user's own chrome.storage.local; nothing is fetched from a nodx server.
```

### clipboardWrite
```
Used only for explicit, user-initiated copy actions: the "Copy" button in the explanation panel (copies the AI explanation text), the copy spoke of the text-selection menu (copies the selected text), and the image hand-off flow where the user chooses to copy a captured or AI-generated image so they can paste it into an external site (e.g. an image search engine). Nothing is ever written to the clipboard without the user clicking a copy control, and the extension never reads the clipboard.
```

### scripting
```
Used exclusively to inject the extension's OWN declared content scripts: (1) into tabs that were already open when the extension is installed or updated — otherwise features would not work on existing tabs until each page is manually reloaded; and (2) as a one-time retry when messaging a tab whose content script is missing (e.g. after a service-worker restart). We only ever inject the same files listed under content_scripts in the manifest, never remote code or dynamically generated scripts.
```

### Host permission — http://127.0.0.1:8787/*
```
When the user has the companion nodx desktop app installed and running, the extension can (optionally, off by a checkbox) POST a captured screenshot to nodx desktop's local HTTP server (127.0.0.1:8787) so it lands in the desktop app's inspiration pool automatically. This is entirely local: 127.0.0.1 addresses never leave the user's own machine, and the toggle defaults to on but can be turned off in the side panel at any time. If the desktop app isn't running, the POST silently times out and the extension's own side-panel copy of the screenshot is unaffected.
```

### storage
```
We use storage to persist (1) the user's API key for their chosen AI provider, (2) their model preferences and UI settings, and (3) a local history of the most recent 20 explanations. All stored data lives only in chrome.storage.local on the user's own computer. We do not have a server.
```

### Host permissions (api.anthropic.com / api.openai.com / generativelanguage.googleapis.com)
```
The background service worker calls the AI provider the user selected (Anthropic, OpenAI, or Google) directly from the user's browser using the API key the user supplied. We do not proxy these calls through any nodx-controlled server. host_permissions for these three hostnames is necessary so the worker's fetch() can reach the provider.
```

### Why <all_urls> in content_scripts + host_permissions (v0.7.1)
```
Two reasons:

1. Content script <all_urls> — the extension's value is that "select text, get an explanation" and "screenshot a region" work on ANY webpage the user happens to be reading. We do not know in advance which sites they will read. The content script is otherwise inert — it observes selection events and installs an idle highlight-layer, but does not read page contents until the user actively clicks the "🔍 explain" floating button or the "📸 Screenshot region" button in the side panel.

2. host_permissions <all_urls> — Chrome's activeTab permission is granted only when the user directly invokes the extension via toolbar click, keyboard shortcut, or context menu. Clicking a button inside the side panel does NOT count as invocation, so activeTab is NOT available at the moment the user clicks "📸 Screenshot region" in the side panel — even though they clearly asked for a screenshot of the visible tab. host_permissions <all_urls> is required for chrome.tabs.captureVisibleTab() to work in this UX. The screenshot bytes never leave the user's machine except (optionally, off by a checkbox) to their own nodx desktop app running on 127.0.0.1.
```

---

## Privacy practices declarations (Chrome Web Store form fields)

| Question | Answer |
|---|---|
| Does your extension collect user data? | No, none of the user data leaves their browser to a server we control. |
| Personally identifiable information (PII)? | No |
| Health information? | No |
| Financial / payment info? | No |
| Authentication info? | API keys are stored locally on the user's device only, never transmitted to nodx |
| Personal communications? | No |
| Location? | No |
| Web history? | No |
| User activity? | The text the user voluntarily selects is sent to the AI provider they configured. We do not retain it on any server. |
| Website content? | We do not read page contents except the text the user explicitly selects |

Privacy policy URL: `<把 Gist 的 raw URL 贴这里>`

操作：
1. 去 https://gist.github.com/ 创建新 **Public** Gist
2. 文件名 `nodx-lens-privacy.md`，把 apps/extension/PRIVACY.md 内容粘进去
3. 创建后点 **Raw** 按钮，复制 URL
4. URL 形如 `https://gist.githubusercontent.com/LaoMo9394/<hash>/raw/.../nodx-lens-privacy.md`
5. 贴回到这里 + 贴到 Chrome Web Store 表单

---

## 截图（1280×800，已生成在 ~/Desktop/nodx-store-shots/）

由 Playwright 脚本自动布景生成（scratchpad/store-shots.mjs，可在每次发版后重跑）：

1. **1-wheel.png** — 选中文字 + 四向动作轮（🔍/💡/🛒/🎨）
2. **2-shopping.png** — 🛒 二级菜单（Shopping / Amazon）
3. **3-explain-search.png** — 🔍 二级菜单（解释 / 搜索）
4. **4-explain-panel.png** — AI 解释面板（流式结果 + Deepen/Save/Copy）
5. **5-marquee-wheel.png** — 框选图片区域后动作轮弹出
6. **6-box-chip.png** — 留在页面上的黄色高亮框 + 角标

## 宣传图（可选但能拉曝光）

- Small Tile：440×280 PNG
- Marquee：1400×560 PNG（首页推荐位才用）

可以先不做，后期再补。

---

## 上架步骤（按顺序做）

```
1. 注册开发者账号
   https://chrome.google.com/webstore/devconsole/
   一次性 $5 注册费

2. 准备 .zip 包
   cd apps/extension
   pnpm build
   cd dist
   zip -r ../nodx-lens-v0.1.0.zip .

3. 隐私政策上线
   把 PRIVACY.md 推到 GitHub 公开仓库
   或用 GitHub Pages 挂个自有域名

4. 截 5 张截图（按上面清单）

5. Dev Console 新建条目
   - 上传 nodx-lens-v0.1.0.zip
   - 填上面的 Name / Description / Category
   - 上传截图
   - 隐私政策 URL 贴 PRIVACY.md 的 raw GitHub 链接
   - 填三处 Permission justification（上面已写好）
   - 填 Privacy practices 表

6. 提交审核
   Google 审核通常 1-3 个工作日
   驳回常见原因：
   - 描述里夸大功能（"100% 准确" 之类）
   - 隐私政策链接 404
   - 截图分辨率不够
   - 描述里写了竞品名

7. 上线
   审核通过 → 自动发布
   后续更新：bump version → build → zip → 上传新 zip
```

---

## 上架前自检 checklist

- [ ] manifest 版本号已是 0.1.0
- [ ] manifest 没多余权限
- [ ] PRIVACY.md 已发布到 Gist（公开），raw URL 准备好
- [ ] icons 四档 PNG 都在 dist/public/icons/ 里
- [ ] dist 用 prod build（pnpm build 而非 dev）
- [ ] 5 张截图准备好
- [ ] 描述里没提任何竞品名（FunBlocks / Glasp / Grammarly / ChatGPT 等都不要提）
- [ ] 描述里没夸大（不写"100%"、"零错误"、"最佳"）
- [ ] 三家 provider 的 API key 我自己都测过能用
- [ ] 在 incognito 模式下测一遍（确认设置/历史/解释能正常工作）
- [ ] 在新建的 fresh Chrome 用户上测一遍 onboarding 流程

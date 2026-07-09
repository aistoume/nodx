# nodx Lens — Chrome Web Store 上架文案

按字段直接复制粘贴到 https://chrome.google.com/webstore/devconsole/ 对应输入框。

---

## v0.7.0 更新说明（如果是 update 而不是首次上架）

**主要新功能**：Side panel + 持久截图高亮 + 图片 Q&A

- 点扩展图标不再弹小 popup，而是打开右侧 side panel（Chrome 114+ 原生支持）
- Side panel 顶部有 **📸 Screenshot region** 按钮：网页上任意位置框选 → 截图变成一张"灵感卡片"
- 每张截图会作为**黄色边框标注**留在网页上（同一 URL 跨 session 保留，localStorage-based）
- Side panel 里每张卡有独立的 Q&A 输入框，可对着 Sonnet vision 追问关于这张截图的任何问题
- 默认自动同步截图到 nodx desktop 灵感池（可关，走 `http://127.0.0.1:8787/v1/capture-image`）

**新权限**：
- `sidePanel` — 打开 Chrome 侧边栏面板
- `http://127.0.0.1:8787/*` host permission — 同步截图到本地 nodx desktop 服务（optional，用户可关）

---

## Name (最多 45 字符)

```
nodx Lens — Inline AI Explanations
```

## Short description (最多 132 字符)

```
Select text on any webpage to get instant AI explanations in place. Annotations persist. Bring your own Claude / GPT / Gemini key.
```

中文版（如做 zh-CN 区域）：
```
任意网页选中文字，原地浮出 AI 解释。底线标注持久保留。用你自己的 Claude / GPT / Gemini API key。
```

## Detailed description (English — primary listing)

```
nodx Lens turns text selection into instant AI context. Highlight any phrase on any webpage, click the floating "🔍 explain" button, and a streaming explanation appears right next to what you were reading. No tab-switching, no new chat thread to clutter, no copy-pasting into another tool.

═══════════════════════════════════════════
WHO IT'S FOR
═══════════════════════════════════════════

• Anyone reading long AI replies in a chat tool — get a side-channel definition without polluting your main conversation.
• Knowledge workers who skim research papers, Substack essays, technical docs, and want fast context on a term they don't know.
• People who collect annotations as they read — every explanation leaves a persistent underline you can revisit.

═══════════════════════════════════════════
CORE FEATURES
═══════════════════════════════════════════

🔍 Select-to-explain
Highlight 2–500 characters on any webpage. A small "🔍 explain" pill floats above the selection. Click it. A panel slides in below the highlight with a streaming explanation — 50–150 words by default, tuned to be a quick definition with one concrete example.

📌 Persistent underlines
When the explanation finishes, the selected text gets a blue underline that stays on the page. Click outside, scroll away, switch tabs — the underline doesn't disappear. Click any underline later to instantly bring the panel back with the same explanation (no extra API call). Right-click an underline to delete the annotation.

📚 Deepen on demand
The panel has a "deepen" button that swaps in a longer 200–400 word explanation — mechanism, example, common misconceptions, or contrast with adjacent ideas. You decide when to spend more tokens.

🌊 Real streaming
Words appear character-by-character as the model generates them. You can tell within the first sentence whether the answer is what you wanted — and close the panel early if it's off-track. No wasted wait time.

⌨️ Keyboard control
Press Esc to close the panel. The trigger button auto-hides when you click elsewhere. Selection-debouncing keeps the UI from flickering as you adjust your highlight.

═══════════════════════════════════════════
PRIVACY
═══════════════════════════════════════════

This extension does not have a backend. We do not run a server.

✓ Your API key, settings, and recent explanation history live only in chrome.storage.local on your own machine.
✓ When you trigger an explanation, the request goes directly from your browser to the AI provider you configured — never through any nodx-controlled server.
✓ No analytics, no telemetry, no third-party trackers, no ads.
✓ History is capped at 20 entries, fully local, and can be cleared with one click from the toolbar popup.

Full privacy policy is linked from the listing.

═══════════════════════════════════════════
HOW IT WORKS (2-MINUTE SETUP)
═══════════════════════════════════════════

1. Install the extension.
2. Settings opens automatically on first install.
3. Pick a provider: Anthropic, OpenAI, or Google.
4. Paste your own API key (from the provider's console — you keep full control of usage and billing).
5. Pick which model to use for short vs. deep explanations.
6. Go to any webpage, highlight something, and click 🔍.

═══════════════════════════════════════════
WHY BRING-YOUR-OWN-KEY INSTEAD OF A SUBSCRIPTION
═══════════════════════════════════════════

• Privacy: your queries go to your provider account, not a middleman's.
• Pay-as-you-go: a typical short explanation costs a fraction of a cent on Haiku- or Flash-class models. Light users will pay less than any flat subscription would charge.
• Model freedom: swap providers or models any time. You're never locked in.
• Transparency: you can see your own API console for exactly what was sent and what it cost.

═══════════════════════════════════════════
SUPPORTED MODELS
═══════════════════════════════════════════

• Anthropic — claude-haiku-4-5 (default for short explanations, fast and cheap), claude-sonnet-4-6 (default for deep explanations)
• OpenAI — gpt-4o-mini, gpt-4o, gpt-5
• Google — gemini-2.5-flash, gemini-2.5-pro

You can change the picked model per provider in Settings any time.

═══════════════════════════════════════════
PERMISSIONS, IN PLAIN ENGLISH
═══════════════════════════════════════════

• "Read and change all your data on all websites" — sounds scary; in practice, it's because the extension has to be ready to activate when you select text on whatever page you're reading. It does not read or modify page contents unless you explicitly click the floating trigger button.
• "Storage" — to keep your API key and settings on your local machine.
• "Host permissions" to api.anthropic.com, api.openai.com, generativelanguage.googleapis.com — so the extension can talk directly to whichever AI provider you chose.

═══════════════════════════════════════════
WHAT'S NEXT
═══════════════════════════════════════════

V0.1 (this release) — Core flow, persistent annotations, three providers, local history.

Planned:
• V0.2 — Web Crypto encryption for the stored API key
• V0.3 — Global keyboard shortcut (Alt+E) to trigger without clicking
• V0.4 — Annotations that survive page reload by re-anchoring to text
• V0.5 — Cross-page "my annotations" library, searchable from the popup
• V1.0 — Companion desktop app integration (save a snippet to deeper structured thinking)

═══════════════════════════════════════════
CONTACT / FEEDBACK
═══════════════════════════════════════════

X (Twitter): https://x.com/LaoMo9394

nodx is a small toolkit for thinking with AI as a sparring partner, not a replacement. Lens is the lightweight browser entry point. A networked decision-thinking desktop app is in development separately.
```

---

## Detailed description (中文版 — 用作 zh-CN 区域 localization)

```
nodx Lens 让你在任何网页选中文字时，AI 解释会浮在选区下方——不必跳走 Google，也不必去 ChatGPT 开新对话。

═══════════════════════════════════════════
适合谁
═══════════════════════════════════════════

• 在 Gemini / ChatGPT / Claude.ai 阅读 AI 回答，想查一个小术语，又不想污染主对话上下文
• 看 Substack / Medium / 学术 blog 的长文，遇到陌生概念
• 在 Notion / 飞书 hover 一段历史会议记录，想 catch up

═══════════════════════════════════════════
核心功能
═══════════════════════════════════════════

🔍 选中即解释
任意网页选中 2-500 字 → 浮出"🔍 解释"按钮 → 点击 → 浮窗在选区下方流式展示 AI 解释

📌 持久标注（像 Grammarly 那样）
解释生成完成后，选中文字下方自动出现蓝色标注线。点其他地方不消失。任何时候点标注线，浮窗就回到原位显示同一份解释（不重复扣 API 费用）。右键标注线删除。

📚 深入解释
浮窗里的"深入"按钮触发更详细的解释（短版 50–150 字 / 深版 200–400 字），让你按需消费 token。

🌊 真流式输出
不是先等 3 秒再砰一下出全文，而是文字逐字浮现，你可以提前判断有没有打到点上，节省时间。

═══════════════════════════════════════════
隐私
═══════════════════════════════════════════

✅ 完全本地：API key、历史、设置都只存在你本机的 chrome.storage.local
✅ 直连：调用从你浏览器直发到 AI 提供商，nodx 没有任何服务器
✅ 零追踪：没有 Google Analytics、没有 Mixpanel、没有 Sentry、没有任何 telemetry
✅ 开源：源码在 GitHub 可审计

═══════════════════════════════════════════
配置方式（一次性 2 分钟）
═══════════════════════════════════════════

1. 安装扩展（这一步你正在做）
2. 第一次打开会自动弹 Settings 页
3. 选 provider：Anthropic / OpenAI / Google 三选一
4. 贴你自己的 API key（去对应官网申请）
5. 任意网页选文字，开用

═══════════════════════════════════════════
为什么自带 key 而不是包月订阅
═══════════════════════════════════════════

• 你的数据走你自己的账户，更隐私
• 按用量计费，你不用买高峰也不用浪费低谷
• 你随时换 provider、换 model，没人锁你

═══════════════════════════════════════════
支持的模型
═══════════════════════════════════════════

• Anthropic：claude-haiku-4-5（短解释，便宜快）/ claude-sonnet-4-6（深入解释）
• OpenAI：gpt-4o-mini / gpt-4o / gpt-5
• Google：gemini-2.5-flash / gemini-2.5-pro

═══════════════════════════════════════════
版本与开发
═══════════════════════════════════════════

V0.1.0：基础功能 + 三家流式 + 持久标注 + 本地历史

接下来计划：
• V0.2：Web Crypto 加密 API key
• V0.3：全局快捷键（Alt+E 不点按钮直接解释）
• V0.4：刷新页面后标注自动重新定位
• V0.5：跨页面"我的标注库"
• V1.0：和 nodx 桌面端打通——一键把解释保存为决策思考

═══════════════════════════════════════════
联系 / 反馈
═══════════════════════════════════════════

X (Twitter)：https://x.com/LaoMo9394

nodx 是一套"AI 陪你想"的工具集。Lens 是浏览器版的轻量入口，桌面端做的是完整的网状决策思考工作台。
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

## 截图（必须 5 张，至少 1280×800 或 640×400）

需要你**手动截**这五张：

1. **主截图（首屏）**：Gemini 网页选中一个术语，浮出"🔍 解释"按钮 + 浮窗里流式显示解释 + 选中文字下方蓝色底线标注
2. **设置页**：Settings 页面，展示三个 provider 单选 + key 输入框
3. **历史**：扩展 popup，展示几条历史记录
4. **深入解释**：浮窗"深入"模式，宽版显示长解释
5. **不同网页**：Substack / Medium 一篇英文长文上选中术语 + 浮窗（证明任意网页可用）

每张 PNG，1280×800 或更大。最简单办法：实际操作 → 截图 → 用 Preview 裁到 1280×800。

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
   cd /Users/youbinmo/Develop/nodx/nodx/apps/extension
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

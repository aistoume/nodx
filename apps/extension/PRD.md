# nodx Lens — Chrome 扩展 PRD

> 版本: v0.1 | 作者: LaoMo + AI | 日期: 2026-06-02

---

## 1. 产品定位

**一句话**：在任何网页上选中文字 → 浮出"🔍 解释"按钮 → AI 在原地给出简短解释，不打断当前阅读 / 对话。

**核心场景**：
- 在 Gemini / ChatGPT 阅读 AI 回答时，想查个小术语，又不想在主对话里发起新提问污染上下文
- 看 Substack / Medium 长文遇到陌生概念，不想跳走 Google
- 在 Notion / 飞书 里 hover 一段历史会议记录，想快速 catch up

**与 nodx 桌面端的关系**：
- nodx 桌面端 = 重决策思考工作台
- nodx Lens = 轻量"问一句"入口，**是桌面端的获客上游**
- 用户在 Lens 看了一个有意思的解释 → 一键"保存到 nodx" → 引流到桌面端深挖

**目标用户**：
- 主要：高频使用 LLM 聊天界面的知识工作者（Gemini / Claude.ai / ChatGPT / Perplexity）
- 次要：长文阅读爱好者（Substack / Medium / arxiv / blog）

---

## 2. 核心卖点

| # | 卖点 | 一句话 |
|---|---|---|
| ① | **零污染查问** | 在 LLM 聊天里查小问题，不会污染主对话 context |
| ② | **任意网页通吃** | 一个扩展解决所有网页的"选中即问" |
| ③ | **快**（≤ 3 秒）| 流式输出，从选中到看到答案不到 3 秒 |
| ④ | **桥接 nodx**（可选）| 看到值得深挖的，一键"保存到 nodx"启动正式思考流程 |

---

## 3. 核心功能（V1）

### 3.1 选中触发
- content script 监听 `selectionchange`
- 选中文字 ≥ 2 字 / ≤ 500 字时，**选区右上方**浮出"🔍 解释"按钮（24px，圆角）
- 按钮跟随选区滚动，自动避开屏幕边缘
- 鼠标移开选区 → 按钮消失（300ms 防抖避免误消失）

### 3.2 解释浮窗
- 点击按钮 → 浮窗在选区下方展开（最大 360 × 280px）
- 浮窗内容：
  - 流式输出的 50–150 字解释
  - 右上角 ✕ 关闭
  - 底部三个操作：「📚 深入」「💾 保存到 nodx」「📋 复制」
- 浮窗外点击 / 按 Esc → 关闭
- **不影响原页面 DOM 结构**（Shadow DOM 隔离样式）

### 3.3 「深入」二级解释
- 浮窗内点「深入」→ 同一浮窗扩展至 480 × 480px
- AI 给出 200–400 字详细版（带例子 / 历史 / 反例）
- 走 Sonnet（V1 解释用 Haiku，深入用 Sonnet）

### 3.4 API Key 自带（V1 唯一模式）
- 用户首次使用时，扩展弹 onboarding 页面引导填 API Key
- 支持：**Anthropic（Claude）/ OpenAI / Google Gemini** 三选一
- Key 存 `chrome.storage.local`（**只本地，绝不上传**）
- Settings 页面随时切换 provider / 改 key

### 3.5 「保存到 nodx」桥接
- 浮窗点「💾 保存到 nodx」→
  - 桌面端在跑 → 通过本地深链 `nodx://capture?text=...&explain=...` 唤起，自动创建草稿
  - 桌面端未装 → 引导下载页（兼做获客）

### 3.6 历史
- 扩展 popup（点工具栏图标）显示**最近 20 条**解释历史
- 每条带：源域名、选中片段、AI 解释、时间
- 一键复制 / 一键再问 / 一键保存到 nodx
- 不上云，仅本地存

---

## 4. 数据模型（最小集）

```typescript
// 全部存 chrome.storage.local，无云端

type Settings = {
  provider: 'anthropic' | 'openai' | 'google';
  apiKey: string;             // 加密存储，仅本地
  model: {
    explain: string;            // 默认 claude-haiku-4-5
    deepen: string;             // 默认 claude-sonnet-4-6
  };
  ui: {
    triggerOnSelection: boolean;  // 默认 true
    minLength: number;            // 默认 2
    maxLength: number;            // 默认 500
    hotkey?: string;              // 备选触发（如 Alt+E）
  };
};

type ExplanationRecord = {
  id: string;
  selectedText: string;
  explanation: string;
  deepened?: string;             // 二级解释
  sourceUrl: string;
  sourceTitle: string;
  createdAt: number;
};
```

---

## 5. 技术选型

| 模块 | 选型 | 理由 |
|---|---|---|
| 平台 | **Chrome Manifest V3** | 现代扩展标准；同时支持 Edge / Brave / Arc |
| 构建 | **Vite 6 + @crxjs/vite-plugin** | 热重载、TS、ESM、与现有 nodx 一致 |
| 语言 | **TypeScript** | 与 nodx 一致 |
| UI | **Preact + Tailwind v4**（content / popup 浮窗共用） | 比 React 小（~3KB），扩展场景对包体敏感 |
| 样式隔离 | **Shadow DOM** | 防止页面样式污染浮窗 |
| 存储 | `chrome.storage.local` | 本地存 settings 和历史，零上云 |
| AI 调用 | 直接调用各家 SDK 的 fetch API（用户自己的 key）| 不走任何中间代理，最隐私 |
| 加密 | Web Crypto API + 浏览器扩展 ID 派生 key | API key 不明文存 |

---

## 6. 与现有 nodx monorepo 的集成

```
nodx/
├── apps/
│   ├── desktop/                  ← 已有
│   ├── mobile/                   ← 规划
│   └── extension/                ← 新增（本 PRD）
│       ├── src/
│       │   ├── content/          # 内容脚本（注入网页）
│       │   ├── background/       # service worker（API 调用）
│       │   ├── popup/            # 工具栏弹窗（历史 + 设置入口）
│       │   ├── options/          # 完整设置页
│       │   └── shared/           # 跨上下文共用代码
│       ├── public/icons/
│       ├── manifest.json
│       ├── package.json
│       └── vite.config.ts
├── packages/
│   ├── ai/                       ← 复用 prompts/explain.ts
│   └── ...
```

**复用 packages/ai**：
- `prompts/explain.ts` 可直接 import（纯函数，无 Node 依赖）
- 但 `client.ts`（用 gateway fetch）不复用——扩展走用户 API key 直连

---

## 7. 隐私与安全

- **API Key 永不上传**：仅 `chrome.storage.local`，Web Crypto API 加密
- **选中内容仅本地 + 直连第三方 API**：不经过 nodx 服务器
- **历史仅本地**：不同步到 nodx 桌面端（V1）
- **manifest 权限最小化**：`activeTab` + `storage` + `contextMenus`，**不申请 `<all_urls>` 完整权限**
- 内容隔离：Shadow DOM 防 XSS 反向污染

---

## 8. MVP 范围（V1）

**必须做**：
- ✅ 选中触发的浮动按钮（Shadow DOM 隔离）
- ✅ 解释浮窗（流式输出，Haiku）
- ✅ 「深入」二级解释（Sonnet）
- ✅ Settings 页（provider 选择 + key 输入 + 三家模型）
- ✅ Popup 历史（最近 20 条）
- ✅ Esc / 外点关闭
- ✅ 加密存储 API key

**V2 / Backlog**：
- 「保存到 nodx」深链桥接
- 跨设备 settings 同步（需登录）
- 全局快捷键触发（不点按钮，按 Alt+E 直接解释）
- 上下文感知（取上下 1 段作为 context）
- 支持代码块解释（针对 GitHub / VS Code Web）
- macOS 系统级浮窗版本（独立 Tauri 应用，见 §10）

---

## 9. 里程碑

| 阶段 | 时间 | 产出 |
|---|---|---|
| W1 | 1 周 | manifest + content script 浮按钮 + 基础浮窗（无 AI）|
| W2 | 1 周 | AI 调用三家接通 + Settings 页 + 加密存储 |
| W3 | 1 周 | Popup 历史 + 「深入」二级 + 打磨 |
| W4 | 1 周 | 内部测试 + Chrome Web Store 上架准备 |

---

## 10. macOS 系统级浮窗版本（V2 路线）

**目的**：在系统层面（任意 App，不只是浏览器）实现"选中即问"。

**技术路线**：

### 方案 A：独立 Tauri 应用（推荐）

```
nodx/
└── apps/
    └── lens-mac/                # 独立 Tauri 应用
        ├── src-tauri/           # Rust 后端
        └── src/                 # 浮窗 UI
```

关键技术点：
- **全局快捷键**：`@tauri-apps/plugin-global-shortcut`（默认 ⌥+E）
- **读取选中文字**：Cocoa Accessibility API（需用户授予 Accessibility 权限）
  - 简化路径：触发时**自动 Cmd+C**（osascript 模拟）→ 读剪贴板
- **系统级浮窗**：
  - Tauri 窗口设 `alwaysOnTop: true`、`transparent: true`、`decorations: false`
  - macOS 特定 API（`tauri-plugin-window-state` + 自定义 cocoa）：`NSPanel` + `NSFloatingWindowLevel`
  - 浮窗在屏幕鼠标位置弹出
- **菜单栏图标**：`tauri-plugin-tray-icon-overlay`

### 方案 B：原生 Swift App

- Swift + AppKit + `NSPanel` + `NSFloatingWindowLevel`
- 用 Carbon API 注册全局热键（或 `MASShortcut` 库）
- 用 `NSPasteboard` + `NSAccessibility` 读选中
- 优点：完全原生，体积小，体验最佳
- 缺点：和 Web 技术栈完全脱节，无法和 Chrome 扩展共享代码

### 方案 C：Hammerspoon 脚本

- 用 Lua 写脚本，挂全局快捷键
- 调外部 CLI 工具（如自建的 `nodx-cli explain`）
- 优点：最快验证概念
- 缺点：用户要装 Hammerspoon，门槛高

### 推荐路径

**V2 走方案 A（Tauri）**：
- 与现有 nodx 桌面端同栈
- 体积虽不如原生 Swift 小（~10MB vs ~2MB），但能复用大量 nodx desktop 的 AI 调用 / UI 代码
- Tauri 2.x 对 macOS NSPanel 支持已经过得去

---

## 11. 风险与开放问题

| 风险 | 应对 |
|---|---|
| API Key 用户配置门槛高，劝退新手 | onboarding 页面给"如何获取 key"三家详细图文；提供 1 分钟视频 |
| Gemini 这种 React 重渲染应用选区不稳 | 用 MutationObserver + 防抖；参考 Glasp / Readwise 实现 |
| Chrome Web Store 审核 | 严格遵守 manifest v3；提交时附隐私政策声明"零数据上云" |
| 浮窗被原页面 z-index 覆盖 | Shadow DOM + `position: fixed; z-index: 2147483647` |
| API 直连 CORS 限制 | 在 background service worker 里做 fetch（绕过 content script CORS）|

**待你拍板的开放问题**：
1. **品牌**：扩展叫 `nodx Lens` / `nodx Highlight` / `nodx Brief` / 其他？
2. **三家模型默认**：默认推荐哪家？我建议 **Claude Haiku（解释）+ Sonnet（深入）**，最贴近 nodx 主体技术栈
3. **桌面深链优先级**：V1 就做还是放 V2？我建议 V2（V1 先不依赖 desktop 跑通）
4. **是否需要 Edge / Firefox 版**？manifest v3 在 Firefox 仍有 caveat，V1 建议只发 Chrome

---

**END of Lens PRD v0.1**

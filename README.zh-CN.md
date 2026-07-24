<div align="center">

[English](./README.md) · **简体中文**

</div>

<div align="center">

<img src=".github/assets/hero.png" alt="nodx — AI 陪你想，而不是替你想" width="100%" />

<br/>

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/aistoume/nodx?color=f59e0b)](https://github.com/aistoume/nodx/releases)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-nodx%20Lens-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/ipljkbefemodjbihcnmmaallcfndmild)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20·%20Chrome%20·%20Android-111827)](https://aicon.solutions/nodx/)

**[官网](https://aicon.solutions/nodx/)** · **[下载桌面版](https://github.com/aistoume/nodx/releases)** · **[Chrome 扩展](https://chromewebstore.google.com/detail/ipljkbefemodjbihcnmmaallcfndmild)** · **[演示视频](https://www.youtube.com/playlist?list=PLLuJxzl3vakU)**

</div>

---

# nodx

> AI 辅助的决策思考工作台。深度由你掌控，AI 负责把结果整理清楚。

一个本地优先的桌面应用，帮管理者把模糊的决策问题变成结构化、可执行的思考；配套的 Chrome 扩展、Android app 与桌宠，把你**看到**的任何东西变成 AI 动作，再回流进你的思考里。不同于一问一答的聊天，nodx 带你走完整条链路：

1. **调研（Survey）** — AI 提出 5–7 个候选因素，你挑 3–5 个（也可以自己写）。
2. **第一性原理拆解** — 选中的因素展开成本质 + 子问题。
3. **思考文档** — AI 起草一份 Google Doc 风格的 markdown 交付物，可就地编辑，支持 Mermaid 图表与 AI 配图。
4. **专家团辩论** — 自动选出 3–5 位专家（必有唱反调者）多轮辩论你的问题，收敛出一个带信心度与异议条件的「局部最优解」。
5. **会复利的思考库** — 完成的决策被抽象并索引；新问题会检索相似旧案例，只辩论差异部分。

## 🎬 看它怎么跑

| nodx Lens for Chrome — 40 秒速览 | nodx Lens Android 1.0 |
|:---:|:---:|
| [<img src="https://img.youtube.com/vi/7nnm_P5aZ5k/maxresdefault.jpg" alt="nodx Lens — 把网页上看到的任何东西变成 AI 动作" />](https://youtu.be/7nnm_P5aZ5k) | [<img src="https://img.youtube.com/vi/V-QNjle1uBk/maxresdefault.jpg" alt="nodx Lens Android — 框选手机上任意内容，AI 解释、比价、生成" />](https://youtu.be/V-QNjle1uBk) |

<sub>更多见 [Nodx 播放列表 ▸](https://www.youtube.com/playlist?list=PLLuJxzl3vakU)</sub>

## 产品矩阵

| 应用 | 做什么 | 状态 |
|---|---|---|
| 🖥 [**nodx 桌面版**](./apps/desktop) | 思考工作台：调研 → 拆解 → 文档 → 专家团 → 自动递进 → 案例库 | macOS 版见 [Releases](https://github.com/aistoume/nodx/releases) |
| 🌐 [**nodx Lens**](./apps/extension) | Chrome MV3 扩展：选中文字或框选页面任意区域 → 可自定义动作轮盘（解释 / 搜索 / 购物 / 生成 / 保存） | [Chrome 应用商店](https://chromewebstore.google.com/detail/ipljkbefemodjbihcnmmaallcfndmild) · v1.0 |
| 🐣 [**nodx Lens 桌宠**](./apps/pet) | macOS 独立悬浮球：单击出动作轮盘，⌥+E 把选中文字直接送进提问框，任意方向都能调用你自己的 CLI。不需要安装 nodx 主程序 | v1.0 — [下载 .dmg](https://github.com/aistoume/nodx/releases/tag/pet-v1.0.0)（已签名公证） |
| 🤖 [**Lens for Android**](./apps/android) | 同一套动作轮盘，通过悬浮球在手机上全局可用 | v1.0 — [Google Play（公开测试）](https://play.google.com/store/apps/details?id=solutions.aicon.nodx) · [APK](https://aicon.solutions/nodx/lens/) |
| 🧲 [**Lens for Mac**](./apps/lens-mac) | macOS 上 ⌥+E 划词解释 | 已并入桌面版 |
| 🏠 [**官网**](./apps/web) | aicon.solutions — 下载、文档、定价 | 已上线 |

## 🎡 nodx Lens — 动作轮盘

选中文字或框选任意区域，同一个四象轮盘就会出现。每个方向的图标、名称、颜色、动作、提示词、子菜单都能改，并有实时预览。

| | |
|:---:|:---:|
| <img src=".github/assets/lens-wheel.png" alt="框选区域上弹出的动作轮盘" /> <br/><sub>框选任意区域 → 轮盘出现</sub> | <img src=".github/assets/lens-box-hub.png" alt="截图框留在页面上作为动作枢纽" /> <br/><sub>截图框留在页面上，可反复触发动作</sub> |
| <img src=".github/assets/lens-wheel-editor.png" alt="带实时预览的轮盘编辑器" /> <br/><sub>每个方向都可自定义，边改边预览</sub> | <img src=".github/assets/lens-sidepanel.png" alt="侧栏保存每次截图的问答线程与历史" /> <br/><sub>侧栏记住每次截图和问答线程</sub> |

## 🤖 Lens for Android

<div align="center">
<img src=".github/assets/android-banner.png" alt="nodx Lens for Android — 框选屏幕上的任何东西" width="720" />
</div>

<table align="center"><tr>
<td><img src=".github/assets/android-1-runtab.png" alt="Android 运行页" width="200"/></td>
<td><img src=".github/assets/android-2-bubble-on-page.png" alt="悬浮球浮在任意 app 上" width="200"/></td>
<td><img src=".github/assets/android-3-wheel-over-apple.png" alt="框选区域上的动作轮盘" width="200"/></td>
<td><img src=".github/assets/android-4-home-with-log.png" alt="主页与操作记录" width="200"/></td>
</tr></table>

悬浮球 → 框选屏幕上任何东西 → 同一套轮盘：解释、搜索、比价、生成。通过无障碍截屏路径全局可用（不必每次重新授权）。

## 进度

M1 之后、M2 中段。要点：

- ✅ Tauri 2.11 桌面外壳，SQLite（14 个迁移），进程内 Rust AI 网关（key 存钥匙串，每次启动随机令牌）
- ✅ 调研 → 第一性原理拆解 → 思考文档 → 批注（四色、锚定原文）
- ✅ 专家团辩论引擎（多专家、唱反调者、局部最优收敛、结果可合并/替换回文档）
- ✅ CBR 思考库：抽象 → 向量索引 → 检索 → fork 改写；「只辩论差异」的专家团
- ✅ 自动递进引擎：PM AI 派生子讨论直到可执行，Auto-Run 带逐层预览与回滚
- ✅ 回放（「什么都不会丢」）：跨会话的回顾卡、推理轨迹、未决问题卡点
- ✅ React Flow 网络图：素材节点、空白画布、素材合成、思考/执行节点拆分
- ✅ 思考中的图像：Mermaid 图表、灵感池图片、文档内 AI 生成插图
- ✅ 决策报告导出 + `.nodx` 数据包（完整保真的子树迁移）
- ✅ 多语言（中/英）、⌥+E 全局划词捕获、Windows CI
- ✅ **nodx Lens 1.0**：完全可自定义轮盘、5 家 AI（Claude / GPT / Gemini / OpenRouter / 本地网关）、13 个搜索预设、模型快捷切换
- ✅ **Android 1.0**：悬浮球、轮盘、操作记录、4 家 AI
- ✅ **桌宠 1.0**（`apps/pet`）：独立的已签名公证 macOS app —— 非激活面板、⌥+E / ⌥+W 快捷键、多轮对话、可自定义轮盘、任意 CLI 动作、11 种语言
- ⏳ 自动递进 Sprint C、草稿抽屉、@ 引用 UI；Safari 移植规划中

产品规格与设计文档维护在一个私有的配套仓库里。

## 架构

```
┌──────────────────────────────────────────────────────┐
│ apps/desktop  (Tauri 2.11 + React 19 + Vite 6)       │
│   ├─ TipTap 编辑器（思考文档）                        │
│   ├─ 通过 @tauri-apps/plugin-sql 使用本地 SQLite      │
│   └─ 经 @nodx/ai 调 AI → 本地进程内 Rust 网关         │
│      127.0.0.1:8787（key 存钥匙串）                   │
└────────────────────┬─────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌───────────────┐         ┌─────────────────────┐
│ packages/     │         │ workers/ai-gateway  │
│ - models      │         │ Cloudflare Worker   │
│ - ai          │ ◀──────▶│ （Bearer 鉴权、      │
│ (Zod schema、 │         │   SSE 流式、         │
│  提示词、      │         │   web_search 工具）  │
│  客户端 SDK)  │         │                     │
└───────────────┘         └─────────────────────┘
                                    │
                                    ▼
                           Anthropic Messages API
                           (Opus 4.8 / Haiku 4.5)
```

工作区：

| 路径 | 用途 |
|---|---|
| [`packages/models`](./packages/models) | Zod 类型化的领域实体 —— Topic / Message / Comment / Edge / DraftItem / TopicDocument |
| [`packages/ai`](./packages/ai) | 版本化的提示词构造器、输出 schema、网关客户端（`complete` / `completeText` / `pingGateway`） |
| [`apps/desktop`](./apps/desktop) | 用户看到的 Tauri/React 应用 |
| [`apps/extension`](./apps/extension) | nodx Lens Chrome MV3 扩展 |
| [`apps/pet`](./apps/pet) | nodx Lens 桌宠（独立 Tauri app） |
| [`apps/android`](./apps/android) | Lens for Android（Kotlin） |
| [`workers/ai-gateway`](./workers/ai-gateway) | 持有 Anthropic key、转发提示词的 Cloudflare Worker |

## 快速开始

### 前置条件

- Node 20+、pnpm 9+
- Rust 工具链（`rustup default stable`）—— Tauri 需要
- macOS 12+（桌面版目前只发 Apple Silicon）

### 1. 安装

```bash
pnpm install
```

### 2. Worker 密钥

```bash
cp workers/ai-gateway/.dev.vars.example workers/ai-gateway/.dev.vars
# 编辑并填入真实值：
#   ANTHROPIC_API_KEY=sk-ant-api03-...
#   CLIENT_TOKEN=$(openssl rand -hex 32)
```

### 3. 桌面端环境变量

```bash
cp apps/desktop/.env.example apps/desktop/.env.local
# 编辑并设置：
#   VITE_AI_GATEWAY_URL=http://localhost:8787
#   VITE_AI_CLIENT_TOKEN=<与 worker .dev.vars 里 CLIENT_TOKEN 相同>
```

> 0.2.0 起桌面版自带进程内 Rust 网关，日常使用**不需要**再起 worker；上面这套是开发/远程网关模式。

### 4. 运行

```bash
# 终端 A —— AI 网关（wrangler dev 跑在 :8787）
pnpm worker

# 终端 B —— Tauri 桌面应用
pnpm desktop tauri dev
```

### 5. 验证网关

```bash
curl http://localhost:8787/health
# {"ok":true,"service":"nodx-ai-gateway"}
```

## 开发

```bash
pnpm -r typecheck     # 所有包
pnpm -r test          # 107 个 vitest 用例
pnpm desktop tauri build   # 产出 release 的 .app / .dmg
```

Tauri 侧检查：

```bash
cd apps/desktop/src-tauri && cargo check
```

## 技术选型

| 关注点 | 选择 | 理由 |
|---|---|---|
| 桌面外壳 | Tauri 2.11 | 比 Electron 更小更安全；Rust 安全模型 |
| UI 框架 | React 19.2 + Vite 6 | 最新稳定版，ref 作为 prop，异步过渡 |
| 样式 | Tailwind v4 (Oxide) | CSS 原生 `@theme`，无需 JS 配置，构建快 |
| 编辑器 | TipTap 2 + ProseMirror | v3 协同编辑（Yjs 集成）生态最成熟 |
| 本地数据库 | 经 Tauri SQL 插件的 SQLite | 离线优先，外键，触发器 |
| AI 网关 | Cloudflare Workers / 进程内 Rust | 可边缘部署也可完全本地，SSE 流式 |
| AI 提供方 | Claude（核心 Opus 4.8，轻量 Haiku 4.5）+ Gemini（向量、生图） | 结构化推理 + 便宜的高频路径 |
| 同步（未来） | Yjs over WebSocket → Supabase Realtime | CRDT，React 生态成熟 |

完整取舍理由见私有产品规格文档。

## 目录结构

```
nodx/
├── apps/
│   ├── desktop/           # Tauri 2.11 + React 19 —— 思考工作台
│   │   ├── src/           #   TipTap 文档、调研卡、专家团、网络图
│   │   └── src-tauri/     #   Rust 后端、SQLite 迁移、进程内 AI 网关
│   ├── extension/         # nodx Lens —— Chrome MV3 扩展
│   ├── pet/               # nodx Lens 桌宠（独立 Tauri app）
│   ├── android/           # Lens for Android（Kotlin，悬浮球 + 轮盘）
│   ├── lens-mac/          # ⌥+E 划词解释（已并入桌面版）
│   └── web/               # aicon.solutions 静态站
├── packages/
│   ├── models/            # Zod schema
│   └── ai/                # 提示词模板 + 网关客户端
├── workers/
│   └── ai-gateway/        # Cloudflare Worker（Anthropic 转发）
└── prototype.html         # M0 设计原型（基于 D3）
```

## 许可

Copyright 2026 Aicon Solutions (aistoume)。

采用 [Apache License 2.0](./LICENSE) 授权。你可以使用、修改、分发本代码（包括商业用途），
前提是保留许可证与声明。「nodx」与「Aicon Solutions」的名称和 logo 不作为商标授权使用。

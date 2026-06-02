# nodx — Claude Code 工作上下文

> 这个文件是给 Claude Code 看的项目"快速上岗手册"。完整需求看 `PRD.md`。

---

## 1. 项目一句话

**nodx** 是一个面向高管/管理层的 AI 决策思考工作台：用户输入模糊问题 → AI 用第一性原理拆解 → 网状对话 + 四色备注沉淀 → 最终产出原子任务和决策汇报。

**核心理念**：AI 不替你思考，AI 陪你思考；用户主导深挖，AI 在结论时整合。

---

## 2. 必读文档

| 文件 | 用途 |
|---|---|
| `PRD.md` | 完整产品需求 + 数据模型 + 技术选型 + 实现细节 |
| `prototype.html` | 交互原型，三栏布局 / 网络图 / Survey / 备注锚定都在里面 |
| `CLAUDE.md`（本文件）| 工作约定、目录结构、实现路线图 |

**Claude Code 第一次启动时，请先 Read 这两份文件再动手。**

---

## 3. 技术栈速查（详见 PRD §6）

```
桌面: Tauri 2.11+ (Rust + WebView)
移动: React Native + Expo SDK 52+
共享: TypeScript Monorepo (pnpm + Turborepo 2.x)

前端: React 19.2 + Vite 6 + TanStack Router
样式: Tailwind CSS v4.2 (Oxide) + shadcn/ui + Radix
状态: Zustand 5 + Immer
富文本: TipTap 2.x + ProseMirror
网络图: Cytoscape.js (默认) / Sigma.js (大图未来)

本地存储: SQLite (Tauri SQL Plugin / expo-sqlite)
云端: Supabase (Postgres + Auth + Realtime + pgvector)
同步: Yjs 13 (CRDT) over WebSocket
向量搜索: pgvector + Gemini Embedding 2 (768维 MRL)

AI: Claude Sonnet 4.6 (主对话/拆解)
    Claude Haiku 4.5 (解释/标签)
    Gemini Embedding 2 (向量)
AI 网关: Cloudflare Workers (鉴权 + 限流)
```

---

## 4. 目录结构（Monorepo）

```
nodx/
├── apps/
│   ├── desktop/              # Tauri 2.11+
│   │   ├── src-tauri/        # Rust 后端
│   │   └── src/              # React 19.2 前端
│   └── mobile/               # Expo RN
│       └── app/              # Expo Router 文件路由
├── packages/
│   ├── models/               # 数据模型 + Zod 校验（Topic/Message/Comment/Edge/...）
│   ├── ai/                   # Claude/Gemini 客户端 + Prompt 模板
│   ├── sync/                 # Yjs Provider + Supabase 适配
│   ├── store/                # Zustand stores
│   ├── ui-core/              # 跨端 React 组件（NetworkGraph, ChatView 等）
│   └── utils/
├── workers/
│   └── ai-gateway/           # Cloudflare Worker (AI 鉴权 + 限流)
├── PRD.md
├── prototype.html
├── CLAUDE.md
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 5. 实现路线图（按里程碑推进）

### M1 — 桌面单机 MVP（4 周目标）

**Week 1：脚手架 + 数据模型**
- [ ] pnpm workspace + Turborepo 初始化
- [ ] `packages/models` 实现核心类型（Topic / Message / Comment / ThinkingSession / Edge / DraftItem；Comment 含 open_question 卡点类型）
- [ ] `apps/desktop` Tauri 项目脚手架
- [ ] 本地 SQLite schema + migration（Tauri SQL Plugin）

**Week 2：单对话核心闭环**
- [ ] 三栏对话页面布局（参考 prototype.html）
- [ ] AI 网关 Cloudflare Worker（鉴权 + 调用 Claude API）
- [ ] Survey 卡片 + 第一性原理拆解（Claude Sonnet 4.6 流式）
- [ ] 即时解释（选中文字 → Haiku 调用 → 写入右栏）
- [ ] 四色备注（便签/解释/原子动作/引用） + 锚定虚线

**Week 3：网络图 + 多对话**
- [ ] Cytoscape.js 网络图视图
- [ ] 子对话生成（"深入讨论"按钮 → 创建子节点）
- [ ] 折叠/展开（cytoscape-expand-collapse 插件）
- [ ] 视图切换（网络图 ↔ 对话页）
- [ ] @ 引用（TipTap mention extension + 跳转）

**Week 4：原子化 + 总结 + 草稿区**
- [ ] 原子化检查器（Haiku JSON 输出）
- [ ] "合并回父对话"（Sonnet 总结 → 用户编辑 → 插入）
- [ ] 草稿区抽屉
- [ ] 决策汇报导出（先支持 Markdown）

### M2 — AI 打磨（2 周）
- [ ] 准备 30 个真实决策问题做 eval 集
- [ ] 优化 Survey 候选生成 prompt
- [ ] 原子化检查器准确率 > 85%
- [ ] Token 用量监控 + 缓存常见解释

### M3 — 云同步（2 周）
- [ ] Supabase 项目搭建（Postgres schema + RLS）
- [ ] Yjs WebSocket Provider 接入 Supabase Realtime
- [ ] 多端同步压测
- [ ] pgvector + Gemini Embedding 2 接入

### M4 — 移动端（4 周）
- [ ] `apps/mobile` Expo 项目
- [ ] 移动端"输入终端"定位：浏览只读 + 语音便签
- [ ] expo-speech-recognition 集成
- [ ] 推送提醒（待续探索分支）

### M5 — 公测迭代

---

## 6. 编码约定

**通用**：
- TypeScript strict mode
- ESM 优先（不用 CommonJS）
- 所有跨端逻辑放 `packages/`，不放 `apps/`
- React 组件文件用 PascalCase（`NetworkGraph.tsx`），其他用 kebab-case

**数据流**：
- 单一数据源：本地 SQLite 是 source of truth
- UI 改动 → Zustand store → Yjs Doc → 持久化 + 同步
- 不要直接在组件里 fetch DB；通过 store hook

**AI 调用**：
- 所有 AI 调用必须经过 `packages/ai` 模块（不直接调 SDK）
- 区分 Sonnet（推理）和 Haiku（轻量任务），别全用 Sonnet
- 流式输出统一用 SSE
- @ 引用只取 `aiSummary` 字段，不取全文，省 token
- Prompt 模板版本化（便于 eval 回归）

**网络图**：
- Cytoscape 实例放 ref，不放 state（避免重渲染）
- 节点 > 50 时启用懒渲染（默认折叠到 2 层）
- 跨支语义边只在用户主动触发"全局总结"时计算

**测试**：
- 数据模型层（packages/models）必须 100% 单测
- AI prompt 用 eval 集回归（不写传统单测，用真实问题对比输出）

---

## 7. 待你（用户）拍板的开放问题

这些没定，Claude Code 实现时如果遇到，应该停下来问 LaoMo：

1. **首发平台**：Mac 优先 vs Windows 优先 vs 同时？（默认 Mac 优先）
2. **AI 模型可换性**：是否支持用户自己接 OpenAI / DeepSeek / 本地模型？（默认锁定 Claude + Gemini）
3. **完全本地模式**：决策内容敏感时，是否需要"不上云、AI 走本地 LLM"模式？
4. **MVP 是否需要登录**：单机版可以无账号，但失去同步能力（默认 M1 单机无登录，M3 加登录）
5. **代码仓库**：单仓 monorepo（推荐）vs 分仓？

---

## 8. 给 Claude Code 的建议提示词

第一次启动时，建议 LaoMo 这样开局（按需使用）：

> "请先 Read PRD.md 和 prototype.html，理解 nodx 项目的产品定位和技术选型。然后按 CLAUDE.md 第 5 节的 M1 Week 1 任务，初始化 pnpm + Turborepo 的 monorepo，创建 apps/desktop（Tauri）的脚手架，以及 packages/models 的数据类型定义。完成后给我一份 M1 Week 1 的 checklist 进度报告。"

或者更小颗粒度起步：

> "请 Read PRD.md 第 5 节（数据模型）和第 6 节（技术选型），然后只做一件事：在当前目录初始化 pnpm workspace 和 Turborepo，创建 packages/models 的骨架（用 Zod 定义 Topic / Message / Comment / ThinkingSession / Edge / DraftItem 类型）。完成后我 review 再继续。"

---

## 9. 当前项目状态

- ✅ M0 原型确认（prototype.html）
- ✅ PRD v0.5 完成（卖点章节 + 思路复现 + 专家组协议 + Local Maximum + 思考快照索引 + 2026.5 技术选型校准）
- ✅ CLAUDE.md 工作上下文准备就绪
- ⏳ M1 Week 1 待 Claude Code 接手开工

---

**END**

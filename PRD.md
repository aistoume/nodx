# nodx — AI 决策思考工作台 PRD

> 版本: v0.2（技术选型 2026.5 校准版）| 作者: LaoMo + AI | 日期: 2026-05-03

---

## 1. 产品定位

**一句话**：帮高管把模糊的战略问题，拆成可执行原子任务的网状决策工具。

**核心场景**：管理层做决策时，常常面对模糊问题（"要不要 ALL IN AI？""现在该投资股票吗？"）。传统工具帮你画图（xmind）或写字（Notion），但不帮你**思考**。nodx 用 AI 作为思考陪练，结合"网状对话 + 第一性原理拆解 + 原子化任务"，把模糊问题变成可执行决策。

**差异化**：
- vs ChatGPT：单线程对话 → nodx 是网状多对话
- vs Notion AI：文档优先 → nodx 是结构化思考优先
- vs xmind / 飞书 OKR：静态画图 → nodx 是 AI 协同思考过程
- vs Roam Research：纯关联笔记 → nodx 有明确的决策方法论（第一性原理 + 原子化）

**目标用户**：
- 主要：企业高管 / 创业者（决策场景）
- 次要：知识工作者 / 学生（研究、写作场景）

---

## 2. 核心功能

### 2.1 引导式 Survey
用户输入问题 → AI 不立刻回答，先弹出 5–7 个候选关注维度的多选卡片 → 用户勾选 3–5 项 → 未选项保留为"幽灵节点"可后续激活。

### 2.2 第一性原理拆解
基于用户选中的维度，AI 用第一性原理把每个维度拆成关键子问题。每个子问题可点击「→ 深入讨论」生成子对话。

### 2.3 网状对话工作台
- 每个节点 = 一个完整 AI 对话
- 网络图作为导航与全局视图
- 节点状态：探索中 / 已总结 / 已得出原子动作 / 幽灵
- 关系类型：父子（实线箭头）/ AI 跨支语义关联（紫色虚线动画）

### 2.4 三栏对话页面
- 左栏：面包屑 + 兄弟/子对话/幽灵节点列表 + 迷你网络图
- 中栏：对话流（含 Survey 卡片、第一性原理拆解、@ 引用胶囊）
- 右栏：Google Doc 风格四色备注（黄=便签 / 蓝=解释 / 绿=原子动作 / 紫=引用），虚线锚定到中栏对应段落

### 2.5 即时解释
用户在对话中选中任意文字 → 浮现「解释」按钮 → AI 在右栏生成蓝色解释卡片（不污染主对话流）

### 2.6 原子化检查器
节点结论需满足 4 要素才算原子：**谁** + **做什么** + **何时** + **产出物**。AI 自动检查并提示补全。颗粒度可配置（战略级 = 周；执行级 = 天/小时）。

### 2.7 子对话折叠 + 向上合并
- 节点可折叠成单点（带 +N 徽章），减少前端渲染压力
- 「合并回父对话」：AI 自动生成子对话核心结论摘要 → 用户编辑确认 → 插入父对话相应位置（保留来源标记）

### 2.8 @ 跨对话引用
- 输入 `@` 自动补全所有对话节点
- 嵌入为蓝色胶囊，点击跳转
- AI 看到 @ 时只取被引用对话的总结作为上下文（节省 token）
- 支持细粒度 `@对话名#段落`
- **TODO**：反向引用（被引用方显示"被 X 引用 N 次"），V2 实现

### 2.9 草稿区
讨论中冒出来的无关新点子先扔草稿区（顶部抽屉），不创建节点污染网络图。整理时再决定并入对话或起新对话。

### 2.10 决策汇报输出
任意节点上点「产出决策汇报」→ AI 扫描子树 → 生成三件产物：
1. 决策摘要（3–5 句给老板）
2. 行动清单（按时间/责任人组织的甘特图）
3. 未解问题清单

支持导出 Word / Markdown / PPT 草稿。

---

## 3. AI 角色设计

每个对话页面里，AI 承担四种角色：

| 角色 | 触发 | 任务 |
|---|---|---|
| 开场分析师 | 用户输入新问题 | 生成候选关注维度（Survey） |
| 苏格拉底追问者 | 用户在对话中输入 | 用第一性原理反问，拆解到原子级 |
| 即时解释者 | 用户选中文字 → 点解释 | 生成 50–150 字解释，写入右栏 |
| 收尾整理者 | 用户点「总结」/「合并回父对话」 | 提取结论、原子动作、跨对话关联建议 |

---

## 4. 数据模型

```typescript
type Topic = {
  id: string;
  parentId: string | null;
  title: string;            // 对话标题（=核心问题）
  status: 'exploring' | 'summarized' | 'atomic' | 'ghost';
  isPinned: boolean;        // 是否锁定位置
  createdAt: number;
  updatedAt: number;
  meta: {
    messageCount: number;
    childCount: number;
    lastActivity: number;
  };
  aiSummary?: string;       // AI 生成的对话总结（@ 引用时取这个）
};

type Message = {
  id: string;
  topicId: string;
  role: 'user' | 'ai';
  type: 'text' | 'survey' | 'factor_list' | 'explanation';
  content: string;          // markdown
  anchors?: string[];       // 段落锚点 id 列表（绑定右栏 comment）
  mentions?: string[];      // @ 引用的 topicId 列表
  createdAt: number;
};

type Comment = {
  id: string;
  topicId: string;
  anchorId: string | null;  // 绑定的 message 段落锚点
  type: 'note' | 'explanation' | 'atomic' | 'reference';
  content: string;
  // for atomic
  atomicData?: {
    who: string;
    what: string;
    when: string;             // ISO date
    deliverable: string;
    isComplete: boolean;
  };
  createdAt: number;
};

type Edge = {
  id: string;
  sourceId: string;         // topicId
  targetId: string;
  type: 'parent' | 'semantic'; // semantic = AI 跨支建议
  isUserConfirmed: boolean; // semantic 边需要用户确认
  weight?: number;          // semantic 边的相似度
};

type DraftItem = {
  id: string;
  source: { topicId: string; messageId?: string } | null;
  content: string;
  createdAt: number;
};
```

**关键设计**：
- `aiSummary` 单独存储，避免 @ 引用时拉全文
- `anchors` 用于实现"虚线锚定"——message 段落和 comment 通过 anchorId 绑定
- 全局 Todo = 所有 `Comment.type === 'atomic'` 的并集，跨 topic 聚合

---

## 5. 技术选型

> **2026 选型校准说明**：此版本基于 2026 年 5 月的技术现状重新校准。所有版本号、benchmark、价格信息均为最新；过时的旧推荐（如 React 18、Tauri 2.0、Tailwind v3、OpenAI Embedding）已替换。

### 5.1 平台策略
| 平台 | 选型 | 理由 |
|---|---|---|
| 桌面 | **Tauri 2.11+** (Rust + WebView) | 当前最新版（2026.4.30 发布）。比 Electron 体积小 10x、内存少 50%；Rust 安全沙箱；新版加强了权限/能力系统 |
| 移动 | **React Native + Expo SDK 52+** | 共享 TS 业务逻辑；Expo Router 文件路由；生态成熟 |
| 共享层 | TypeScript Monorepo (pnpm + Turborepo 2.x) | 桌面/移动共享数据模型、AI 客户端、同步引擎 |

> **2026 已考虑过的备选方案**：
> - Tauri 2.x 现在已**原生支持 iOS/Android**，理论上"一份 Tauri 跑全平台"。但移动端依然走 WebView，性能（尤其网络图渲染）不如 RN 原生组件，且 RN 移动生态（语音、相机、推送）成熟得多。决定仍走 Tauri（桌面）+ RN（移动）。
> - **Flutter / Kotlin Multiplatform / .NET MAUI** 都已排除：网络图渲染生态弱于 Web，且现有 TS 业务代码无法跨复用。

### 5.2 前端核心
| 模块 | 选型 | 理由 |
|---|---|---|
| UI 框架 | **React 19.2** + **TypeScript 5.x** | 19.2 引入 Partial Pre-rendering 和 Activity 组件；refs 直接作 prop（不再需要 forwardRef）；async transitions |
| 构建工具 | **Vite 6** | Rolldown 集成，构建速度大幅提升 |
| 网络图渲染 | **Cytoscape.js**（< 200 节点典型场景） / **Sigma.js + @react-sigma**（> 10k 节点未来场景） | Cytoscape 图论专用，内置 cose-bilkent 布局 + 子树折叠插件；Sigma 用 WebGL 处理大图，2026 起有官方 React 绑定（@react-sigma） |
| 富文本编辑器 | **TipTap 2.x**（ProseMirror）| 2026 仍是 React 富文本生产首选；@mention 扩展成熟；与 Yjs 协同集成最佳。备选：Lexical（Meta 出品，性能更好但生态略弱）；Plate（深度集成 shadcn/ui） |
| 状态管理 | **Zustand 5** + **Immer** | 比 Redux 轻 10 倍，TS 友好 |
| 样式 | **Tailwind CSS v4.2**（Oxide 引擎）+ **shadcn/ui** | v4 用 Rust 构建引擎，构建速度提升 5–100 倍；CSS-native `@theme` 指令；shadcn/ui 复制粘贴式组件，控制力最强 |
| 路由（桌面） | **TanStack Router** | 类型安全的路由，比 React Router 6 类型推断更强 |
| 路由（移动） | **Expo Router** | 文件路由，代码组织清晰 |

### 5.3 后端 / 持久化
| 模块 | 选型 | 理由 |
|---|---|---|
| 本地存储 | **SQLite** (Tauri SQL Plugin / expo-sqlite) | 离线优先；查询快；事务保证 |
| 云端 | **Supabase** (Postgres + Auth + Realtime + Storage + pgvector) | 一站式 BaaS；免运维；pgvector 原生支持向量搜索；Pro $25/月起 |
| 同步 | **Yjs 13** (CRDT) over **WebSocket**（V1 默认）/ **Loro**（性能瓶颈时迁移）| Yjs 生态最成熟、React 绑定完善（SyncedStore）；Loro 是 2025+ 的 Rust 新秀，rich-text/movable-tree 性能更优，未来可平滑迁移 |
| 向量搜索 | **pgvector** + **Gemini Embedding 2**（768 维默认 / 3072 维高精度，MRL）| 多模态原生（文本+图+视频+音频+PDF）；MTEB 多语言榜首（69.9）；为 V2 多模态附件搜索铺路 |
| 文件存储 | Supabase Storage | 附件、导出文件 |

> **为什么不选 Convex / Firebase**：Convex 的"实时优先"模型确实诱人（2024 开源、2025 支持自托管），但**没有 pgvector** —— nodx 强依赖向量搜索做跨支语义关联，所以 Supabase 仍胜出。Firebase 是 NoSQL（Firestore），无法用 SQL 做复杂层级查询，且无自托管选项，vendor lock-in 严重。

### 5.4 AI 集成
| 用途 | 模型 | 理由 |
|---|---|---|
| 主对话 / 第一性原理追问 | **Claude Sonnet 4.6** | 推理质量高，上下文长（200k） |
| 即时解释 / 标签生成 | **Claude Haiku 4.5** | 便宜 10x，延迟低（适合 hover 触发） |
| Embedding | **Gemini Embedding 2**（gemini-embedding-2，2026.4.30 GA）| 首个原生多模态嵌入模型；MTEB 多语言榜首（69.9）、英语榜首（68.32）；MRL 可截断维度（3072→1536→768）；$0.20/M tokens（批量 $0.10/M） |
| 调用方式 | 流式输出（SSE） + 工具调用 | 提升 perceived latency |

> **为什么混用 Anthropic + Google**：Claude 在结构化推理（第一性原理拆解、原子化检查）上表现最稳；Gemini Embedding 2 的多模态能力对 V2 至关重要（用户附图/PDF 决策场景）。两家都是稳定大厂，依赖风险可控。

**Token 优化策略**：
- @ 引用只取 `aiSummary`（约 200 tokens），不取全文
- 上下文窗口管理：父对话只取最近 10 条 + AI 总结，子对话单独维护
- 备注/解释类调用走 Haiku
- 缓存常见解释（PE / PEG / 美林时钟等通用术语）到 Redis

### 5.5 部署
- 桌面：Tauri 自动更新（Updater）+ GitHub Releases 分发
- 移动：Expo EAS Build → App Store / TestFlight / 国内应用市场
- 后端：Supabase Cloud（起步阶段，月成本可控在 $25 内）
- AI 网关：自建 Cloudflare Workers（鉴权、速率限制、用量统计）

---

## 6. 系统架构

```
┌──────────────────────────────────────────────────────────┐
│                      用户终端                             │
│  ┌─────────────┐         ┌──────────────┐               │
│  │ Tauri 桌面   │         │ RN 移动      │               │
│  └─────┬───────┘         └─────┬────────┘               │
└────────┼────────────────────────┼────────────────────────┘
         │                        │
    ┌────▼────────────────────────▼─────┐
    │   共享 TS 包（packages/）          │
    │  ┌────────┐ ┌────────┐ ┌────────┐ │
    │  │ models │ │ ai     │ │ sync   │ │
    │  └────────┘ └────────┘ └────────┘ │
    │  ┌────────┐ ┌────────┐ ┌────────┐ │
    │  │ ui-core│ │ store  │ │ utils  │ │
    │  └────────┘ └────────┘ └────────┘ │
    └────┬─────────────────────┬─────────┘
         │                     │
    ┌────▼──────┐         ┌────▼──────────────────┐
    │ 本地       │         │ Cloudflare Workers     │
    │ SQLite    │         │ (AI 网关 + 鉴权)        │
    └───────────┘         └────┬───────────────────┘
                               │
                       ┌───────▼────────────────┐
                       │ Supabase               │
                       │ (Postgres + pgvector + │
                       │  Auth + Realtime)      │
                       └────────────────────────┘
                               │
                       ┌───────▼────────────────┐
                       │ Anthropic Claude API   │
                       │ OpenAI Embeddings      │
                       └────────────────────────┘
```

---

## 7. 关键实现细节

### 7.1 Survey 候选生成（模板兜底 + AI 微调）
```
1. 输入用户问题
2. 用 keyword classifier 判断问题类型（决策类 / 研究类 / 学习类...）
3. 加载对应模板（决策类: 7 个标准维度）
4. 调用 Claude Sonnet：基于用户的具体问题，对模板做个性化改写 + 补 1–2 个新维度
5. 返回 5–7 个候选给用户勾选
```

### 7.2 第一性原理拆解 Prompt
```
你是第一性原理思考教练。

用户问题: {question}
用户选择的关注维度: {selected_factors}
对话上下文: {context}

任务：对每个维度，按以下步骤分析：
  1. 这个维度的本质是什么？（剥离表象）
  2. 需要回答哪些独立的子问题？
  3. 这些子问题中哪些可以直接拆到原子级（谁/做什么/何时/产出）？哪些需要继续追问？

输出 JSON:
{
  factors: [{
    title: string,
    essence: string,         // 本质
    sub_questions: [{
      question: string,
      can_be_atomic: boolean
    }]
  }]
}
```

### 7.3 原子化检查器
```typescript
// 调用 Claude Haiku
async function checkAtomic(text: string): Promise<AtomicCheck> {
  const prompt = `
    判断以下结论是否是"原子任务"。原子任务 = 谁 + 做什么 + 何时 + 产出物 都明确。
    结论: ${text}
    返回 JSON: { isAtomic: bool, missing: ["who"|"what"|"when"|"deliverable"], suggestion: string }
  `;
  return await haiku.completeJson(prompt);
}
```

### 7.4 网络图渲染（Cytoscape）
- **布局**：根节点用 `preset` 固定中心，其余用 `cose-bilkent`（力导向 + 重力）
- **折叠子树**：用 cytoscape-expand-collapse 插件，节点带 `+N` 徽章
- **跨支语义边**：用 `taxi` 边样式 + CSS 动画 dashFlow
- **大图性能**：>100 节点时启用 `headless` 模式 + LOD（level of detail）：远距离只显示节点不显示文字

### 7.5 同步引擎（Yjs）
```
本地写入流程:
  1. UI 改动 → Zustand 更新
  2. Zustand → 写入 Yjs Doc
  3. Yjs 自动持久化到 IndexedDB（桌面）/ AsyncStorage（移动）
  4. WebSocket Provider 同步到 Supabase Realtime
  5. 其他端订阅同一 Doc，实时合并

冲突解决: CRDT 自动处理，无需手动逻辑
```

### 7.6 跨支语义关联（"全局总结"触发）
```
1. 取所有 status === 'summarized' 的 Topic 的 aiSummary（多模态附件也一并 embed）
2. 批量计算 embedding（Gemini Embedding 2 batch API，省 50%）
3. 计算 pairwise cosine similarity
4. 阈值 > 0.75 的对，生成 type='semantic' 的 Edge（isUserConfirmed=false）
5. 网络图上显示紫色虚线 + 闪烁，等用户确认
6. 用户点击"接受"后 isUserConfirmed=true，固化到数据库
```

### 7.7 决策汇报生成
```
1. 用户在某节点点「产出决策汇报」
2. 后端 BFS 遍历该节点子树，收集：
   - 所有 message
   - 所有 Comment（atomic 类型）
   - 所有 aiSummary
3. 单次 Claude Sonnet 调用（200k 上下文足够）
4. Prompt 要求输出三段：摘要 / 行动清单（结构化 JSON）/ 未解问题
5. 前端渲染为可编辑模板
6. 导出走 docx / pptx 模板引擎（同 Office 套件）
```

---

## 8. MVP 范围（V1）

**必须做**：
- ✅ 网络图视图（Cytoscape）
- ✅ 三栏对话页面
- ✅ Survey 卡片（模板兜底版本）
- ✅ 第一性原理追问（Claude Sonnet）
- ✅ 即时解释（Claude Haiku）
- ✅ 四色备注 + 锚定
- ✅ 子对话生成 + 折叠
- ✅ 向上合并（AI 草稿 + 用户编辑）
- ✅ @ 引用（不含反向引用）
- ✅ 草稿区
- ✅ 原子化检查器
- ✅ 决策汇报导出（Markdown 起步）
- ✅ 桌面端（Tauri） + Mac 优先

**V2 / Backlog**：
- 移动端（React Native）
- 反向引用
- 跨支语义关联自动建议
- Word / PPT 模板导出
- 多人协作
- 移动端语音便签
- 决策模式之外的"研究模式""学习模式"模板

---

## 9. 里程碑

| 阶段 | 时间 | 产出 |
|---|---|---|
| M0：原型确认 | 已完成 | HTML 交互原型 |
| M1：核心闭环 | 4 周 | 桌面单机版，能跑通 Survey → 拆解 → 子对话 → 备注 → 决策汇报 |
| M2：AI 打磨 | 2 周 | Prompt 优化，原子检查器准确率 > 85% |
| M3：云同步 | 2 周 | Supabase 接入 + Yjs 同步 |
| M4：移动端 | 4 周 | RN 只读版 + 语音便签 |
| M5：公测 | 持续 | 邀请 10 位高管真实使用，迭代 |

---

## 10. 风险与开放问题

| 风险 | 应对 |
|---|---|
| AI 成本（Sonnet 调用频繁） | 严格区分 Sonnet/Haiku；缓存常见解释；@ 引用只取 summary |
| 网络图节点 100+ 性能 | Cytoscape headless + LOD；默认折叠到 2 层 |
| 移动端体验受限 | 移动端定位为"输入终端"（语音便签 + 浏览），编辑能力降级 |
| 第一性原理 Prompt 质量 | 准备 30 个真实决策问题做 eval；定期人工 review AI 输出 |
| Yjs + Supabase 同步可靠性 | M3 阶段做压测；本地 SQLite 始终是 source of truth |

**待你拍板的开放问题**：
1. **首发平台**：Mac 优先 vs Windows 优先 vs 同时？（我建议 Mac 优先，目标用户匹配）
2. **AI 模型**：是否锁定 Claude？还是支持用户自己接 OpenAI / DeepSeek / 本地模型？
3. **数据隐私**：决策内容敏感，是否需要"完全本地模式"（不上云、AI 走本地 LLM）？
4. **MVP 是否需要登录**：单机版可以无账号，但失去同步能力；登录会增加上手成本
5. **代码仓库结构**：单仓 monorepo 还是分仓？我建议 monorepo（pnpm workspace + Turborepo）

---

## 附录 A：目录结构建议（Monorepo）

```
nodx/
├── apps/
│   ├── desktop/          # Tauri 应用
│   │   ├── src-tauri/    # Rust
│   │   └── src/          # React
│   └── mobile/           # Expo RN 应用
│       └── app/
├── packages/
│   ├── models/           # 数据模型 + Zod 校验
│   ├── ai/               # Claude / OpenAI 客户端 + Prompt 模板
│   ├── sync/             # Yjs Provider + Supabase 适配
│   ├── store/            # Zustand stores
│   ├── ui-core/          # 跨端 React 组件（NetworkGraph, ChatView 等）
│   └── utils/
├── workers/
│   └── ai-gateway/       # Cloudflare Worker（鉴权 + 限流）
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## 附录 B：关键依赖清单

**Frontend**:
- react@19.2, typescript@5, vite@6
- cytoscape@3 (核心稳定), cytoscape-cose-bilkent, cytoscape-expand-collapse
- @tiptap/react@2, @tiptap/extension-mention, @tiptap/extension-collaboration
- zustand@5, immer
- tailwindcss@4 (Oxide 引擎), @radix-ui/react-*, shadcn/ui (CLI 复制组件)
- @tanstack/react-router (桌面路由)
- yjs@13, y-websocket, y-indexeddb, syncedstore (React 集成)

**Desktop (Tauri 2.11+)**:
- @tauri-apps/api@2
- @tauri-apps/plugin-sql, @tauri-apps/plugin-updater

**Mobile (Expo SDK 52+)**:
- expo@latest, expo-router, expo-sqlite
- react-native-reanimated@3, react-native-skia (网络图渲染)
- expo-speech-recognition (语音便签)

**Backend**:
- @supabase/supabase-js@2
- @anthropic-ai/sdk
- @google/genai (Gemini Embedding 2 + Gemini API)

---

**END of PRD v0.1**

# 素材 (Material) — 案例库 + 灵感池 → 网络图节点

> 把「可复用的思考」统一成**素材**，能从网络图上加载成节点。

## 概念

**素材** = 两个来源的统一概念：

| kind | 来源 | 语义 |
|---|---|---|
| `solution`（🧩 方案） | 案例库 `abstracted_cases` | 专家组采纳后抽象入库的方案/结论（CBR，PRD §3.16） |
| `inspiration`（💡 灵感） | 灵感池 `attentions` | Lens/手动捕获的原始素材（PRD 灵感池） |

`material_kind` 列（migration v12）让每行的素材身份显式化（默认回填：cases→solution、
attentions→inspiration）。注意 `attentions.kind` 已被占用（'explain'|'quick'），所以
素材判别列另起名 `material_kind`。

## 三块改动

1. **素材标签**：案例库每条显示 `🧩 素材·方案`，灵感池每条显示 `💡 素材·灵感`。
   数据模型层加 `material_kind`（v12）。
2. **网络图加载素材**：网络图工具栏「➕ 加载素材」→ 弹 `MaterialPicker`（列出全部素材，
   按 方案/灵感 筛 + 搜索）→ 点一个即在画布落一个**素材节点**。
3. **素材节点类型**：新增 React Flow 节点类型 `material`（`MaterialNode.tsx`，琥珀色，
   带 kind 徽章 + ✕ 移除）。**自由浮动、不自动连线**（按你的选择）。

## 数据流

```
packages/models/material.ts   MaterialKind + MaterialRef（统一句柄）
migration v12                 abstracted_cases/attentions += material_kind
db/materials.ts:listMaterials 两表 union → MaterialRef[]（newest first）
components/graph/MaterialNode  素材节点
components/graph/MaterialPicker 加载器（筛选/搜索/已加载标记）
NetworkGraphView               material 节点类型 + 加载器 + 持久化
```

**持久化**：哪些素材挂在哪个话题画布，存 localStorage `nodx:graph-materials:v1`
= `{ [rootTopicId]: Array<{id,kind,x,y}> }`（跟节点位置一样轻量本地）。素材内容
（标题/摘要）从 DB `listMaterials()` 实时 join，不复制进 localStorage（不会过期）。

## 交互细节

- 素材节点 id = `mat_<sourceId>`，避免和话题 id 撞。
- 点素材节点：仅高亮选中，**不切换话题**（它不是 topic）。
- **双击素材节点 → 跳去对应库并定位高亮那一条**（solution→案例库、inspiration→灵感池）：
  `NetworkGraphView.onOpenMaterialLibrary(kind, id)` → `App` 存 `materialFocus{kind,id}` +
  切视图 → `CaseSearchView`/`AttentionInboxView` 收到 `focusId` → 滚动到
  `#mat-case-<id>` / `#mat-att-<id>` + 琥珀高亮 ~2.6s → 回调 `onFocusConsumed` 清掉
  （避免之后手动进库误触发）。灵感池会临时 `hidePromoted=false` 保证目标可见。
  **单向**：库内容可被多个项目复用，库不反向跳回某个图节点。
- 拖动素材节点：位置存回 materials store（话题节点位置仍走 positions store）。
- ✕ 移除：只从画布卸载，**不删除素材本身**（案例/灵感还在库里）。
- 素材节点不参与父子边；MiniMap 里显示为琥珀色。

## 素材综合 → 思考节点（2026）

把多份素材连到一个思考节点上,让 AI 综合进这个节点:

- **新画布**:图工具栏 / 空状态「🆕 新画布」→ 弹**命名框**(`NewCanvasPrompt`)→ 用这个名字
  建空白根话题并打开它的网络图当白板(`onRequestNewCanvas(name)` → `App` createTopic + 停在图上)。
  画布话题**不自动跑 Survey**(存 `lib/canvas-topics.ts` localStorage 标记 → CenterPanel 跳过
  自动 Survey);想起步时在文档/对话视图点 **「▶ 生成 Survey」** 手动触发(触发即取消标记,恢复常态)。
- **手画连线**:从素材节点拖到话题节点(React Flow `onConnect`,方向任意,只认
  素材↔话题)→ 存 localStorage `nodx:graph-links:v1`(`{[rootId]: {materialId,topicId}[]}`)
  → 渲染成**虚线琥珀边**(animated)。选中边按 Delete 删除;卸载素材自动清其连线。
- **综合**:话题节点有连入素材时显示 **🔗 综合 N 份素材** 按钮 → `SynthesisModal`
  (列连入素材 + 问题输入框)→ **素材综合者(Sonnet)** 读连入素材 + 问题 + 该节点已有
  文档 → 生成 `## 素材综合` 一节 → `appendToDocument` 写进该话题文档 → 切到文档视图看结果。
- **综合节点 = 真话题**:结果写进它的文档,进左栏、可继续跑专家组/拆执行等。

文件:`packages/ai/prompts/synthesize-materials.ts`(+test)+ `ai/synthesize.ts` +
`components/graph/SynthesisModal.tsx` + `NetworkGraphView`(links 存储/onConnect/
onEdgesChange/edges 效果/综合入口/新画布)+ `TopicNode`(🔗综合 按钮)。

## 验证

```
pnpm --filter @nodx/models test    # 199（+15 material.test）
pnpm --filter desktop typecheck    # clean
pnpm --filter desktop build        # clean
```
migration v12 已在真实 DB 副本干跑（7 cases→solution、3 attentions→inspiration 回填）。

## 涉及文件

```
packages/models/src/material.ts (+test)、index.ts
apps/desktop/src-tauri/src/migrations.rs   V12_SQL
apps/desktop/src/db/materials.ts
apps/desktop/src/components/graph/MaterialNode.tsx / MaterialPicker.tsx
apps/desktop/src/components/NetworkGraphView.tsx
apps/desktop/src/components/cbr/CaseSearchView.tsx（素材·方案 徽章）
apps/desktop/src/components/attention/AttentionInboxView.tsx（素材·灵感 徽章）
```

# 思考 / 执行 节点拆分

> 把「思考」和里面的「具体执行方案」拆成两种节点类型。

## 概念

Topic 现在有 `nodeKind`（migration v13，默认 `thinking`）：

- **thinking（思考）** — 推演/审议的话题（所有旧话题默认这种）。
- **execution（执行）** — 从思考节点「拆出」的具体行动方案，承载一份可验收的
  行动清单（谁/做什么/何时/产出）+ 开工前提。通常 `status='atomic'`。

## 「拆出执行」流程

思考节点文档页头有 **`▶ 拆出执行`** 按钮（执行节点上不显示——执行不再往下拆）：

```
思考节点文档 →（▶ 拆出执行）→ 执行拆分者(Sonnet) 读文档 + 已标记的原子动作
  → 抽取行动清单（只抽不发明：没写负责人/时间就留空）
  → 可编辑预览（复用 MergePreviewModal，改了按钮文案）
  → 确认 → 新建 execution 子节点（parentId=思考节点, status=atomic）
         + 文档 = 行动清单 Markdown 表 → 打开它
```

**抽取来源**：思考节点的文档正文 + 它已标记的 `Comment.type='atomic'` 原子动作
（who/what/when/deliverable），合并去重。

## 图上区分

网络图里两种节点视觉不同（`TopicNode` 按 `nodeKind` 分支）：
- 思考节点：原样（状态色）。
- 执行节点：**翠绿主题 + `▶ 执行` 徽章**，一眼区分。

节点行为一致（点选/双击进入），只是类型与配色不同。

## 涉及文件

```
packages/models/src/topic.ts          TopicNodeKindSchema + Topic.nodeKind(default thinking) (+test)
packages/ai/src/prompts/execution.ts  执行拆分者 prompt + ExecutionPlanOutput + executionToMarkdown (+test)
apps/desktop/src-tauri/src/migrations.rs  V13_SQL (topics += node_kind)
apps/desktop/src/db/topics.ts         读写 node_kind + createTopic(nodeKind) + setTopicNodeKind
apps/desktop/src/ai/execution.ts      extractExecutionPlan(读文档+原子动作→计划)
apps/desktop/src/components/DocumentView.tsx  ▶拆出执行 按钮 + 预览 + 建执行子节点
apps/desktop/src/components/panel/MergePreviewModal.tsx  复用（title/confirmLabel 可配）
apps/desktop/src/components/graph/TopicNode.tsx  执行节点翠绿+▶执行 徽章
```

## 验证

```
pnpm -r test        # models 202 / ai 196 / worker 23 / desktop 31
pnpm --filter desktop typecheck / build   # clean
```
migration v13 已在真实 DB 副本干跑（36 topics 回填 'thinking'）。

## 说明 / 未做

- V1 是「拆出执行 = 建执行子节点」。**手动把某话题标成执行**（`setTopicNodeKind`
  已就绪）暂无 UI 入口，需要时可在左栏/节点右键加一个开关。
- 执行节点的行动清单是普通文档（Markdown 表），未做勾选完成态；要做可后续接
  TipTap task-list 或复用 `Comment.type='atomic'` 的 isComplete。

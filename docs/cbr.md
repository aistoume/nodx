# CBR 检索流水线 — 实现状态（as-built）

> 把每个达到 localMaximum 的 Topic 抽象成**去标识化、可复用的案例**，建立可检索的
> 案例库（case-based reasoning）。对应 PRD §3.16（CBR 流水线 V1 省钱版）+ §3.18
> （简化 GraphRAG）。
>
> **Week 1（数据层 + 抽象/索引写入）= ✅ 完成并真实 app 验证。**
> **Week 2（检索读路径：Brain Hub + 双路召回 + Heuristic 排序 + Fusion）= ✅ 完成并真实 app 验证。**
> **Week 3（适配执行师 + 检索 UI）= ✅ 完成（适配器已 live 验证，UI 已 typecheck+build）。**
> 不含：SnapshotReuse 反哺评分、"专家组只跑差异"精确接线、as_is/inspiration_only 模式、Reranker。
> 最后更新：2026-06。

## 0. 验证状态（Week 1 已坐实）

整条写路径已在**真实 app + 真实 Sonnet/Gemini** 跑通（不只是单测）：

- migration v6 在 bundled SQLite 建表成功（含 **FTS5 trigram**，原担心点已消除）
- 采纳专家组 → 钩子自动入库；3 个真实案例落库，去标识化干净
- **`problem_emb`/`solution_emb` = 4096 字符 base64**（768×Float32）→ plugin-sql BLOB 写入 OK
- FTS5 触发器同步 3/3；关系发现器写了 9 条语义合理的边（新案例→所有先前案例）
- 完整性：无自环、无重复边（CHECK / UNIQUE / 幻觉 id 过滤全部生效）

DB 实测路径：`~/Library/Application Support/app.nodx.desktop/nodx.db`

---

## 1. 入库流水线（写路径）

```
Topic 达到 localMaximum（专家组被采纳）
  │  钩子：ExpertPanelView「采纳」→ ingestAcceptedPanel（fire-and-forget）
  ▼
① 抽象师 (Sonnet)   LocalMax → AbstractedCase 内容（含去标识化）
  ▼  problemSignature / reasoningPath / solutionPattern / qualityScore
② 索引器            文本化 signature/solution → 2 个 Gemini Embedding 2（768维）
  ▼
   落库 abstracted_cases（FTS5 镜像由触发器自动同步）
  ▼
③ 关系发现者 (Sonnet)  扫已有案例 → case_relations 边
  ▼
   落库 case_relations
```

幂等：`getCaseByTopic` 命中则跳过，不重复花 token。

---

## 2. 数据模型（`packages/models`）

- **`abstracted-case.ts`** — `AbstractedCase`：
  `{ id, sourceTopicId, problemSignature, reasoningPath, solutionPattern, outcome,
     problemEmb[768], solutionEmb[768], visibility, freshnessDate, createdAt }`
  - `problemSignature{ domain, decisionType('go_no_go'|'allocation'|'sequencing'|'tradeoff'), keyDimensions[], constraints[] }`
  - `reasoningPath{ frameworks[], keyQuestions[], pivotalDecisions[] }`
  - `solutionPattern{ structure, keyLevers[], riskMitigations[] }`
  - `outcome{ qualityScore(0–1), userFeedback? }`
  - `EMBEDDING_DIM = 768`，`CaseVisibility = private|team|public_anonymous`
- **`case-relation.ts`** — `CaseRelation{ id, sourceCaseId, targetCaseId, relationType, weight(0–1), createdAt }`
  - `relationType = shares_framework|shares_domain|contrasts|composed_from|caused_by`（拒绝自关联）
- 全部带 `.test.ts`。

---

## 3. 本地 SQLite schema（migration v6）

> ⚠️ PRD §5 的索引表（pgvector HNSW、FTS GIN）面向 **Postgres/Supabase（M3）**。
> 本地 SQLite 用等价物近似：

| PRD 目标（Postgres）| 本地 SQLite v6 实现 |
|---|---|
| `problem_emb`/`solution_emb` pgvector + HNSW | **BLOB**（Float32-LE 的 base64），V1 无向量索引（检索时暴力扫，HNSW 留 M3）|
| FTS GIN（signature/solution）| **FTS5 trigram** 虚拟表 `abstracted_cases_fts` + 3 个同步触发器（trigram 对中文子串友好，但 <3 字的词匹配不到）|
| B-tree domain/quality/freshness | `idx_cases_domain` / `idx_cases_quality` / `idx_cases_freshness` |
| 关系表 (source,target,type) | `idx_case_relations_src`（复合）+ `idx_case_relations_tgt`（反向）|

表：`abstracted_cases`（结构 JSON 列 + 反范式 domain/decision_type/quality_score/visibility + `signature_text`/`solution_text` 供 FTS）、`case_relations`（复合唯一约束 + 自关联 CHECK）。
均 `ON DELETE CASCADE` 到 `topics` / `abstracted_cases`。
**已用系统 sqlite3 端到端验证**（建表/触发器/FTS 写入/递归 CTE/级联/约束全过）。

---

## 4. AI 层（`packages/ai/src/cbr/` + worker）

| 文件 | 模型 | 作用 |
|---|---|---|
| `abstractor.ts` | Sonnet | LocalMax → `AbstractorOutput`（3 块 + qualityScore），prompt 内置去标识化 |
| `relation-finder.ts` | Sonnet | 新案例 + 已有案例摘要 → `relations[]`（可为空）|
| `indexer.ts` | 无 AI | `signatureToText`/`solutionToText`（文本化）+ `embeddingToBase64`/`base64ToEmbedding`（Float32 编解码）|
| worker `gemini.ts` + `/v1/embed` | Gemini | `batchEmbedContents`，768 维 MRL；client `embed()` 经网关调用 |

- `GEMINI_EMBED_MODEL = 'gemini-embedding-001'`（PRD「Gemini Embedding 2」的真实 Google id；client 传的 `gemini-embedding-2` 是别名）。
- worker 新增 env **`GEMINI_API_KEY`**（仅 `/v1/embed` 需要；未配置则该端点返回 500）。

---

## 5. 桌面层（`apps/desktop`）

- **`db/cases.ts`** — `insertAbstractedCase` / `insertCaseRelations` / `getCaseByTopic`（幂等）/ `listCaseSummaries`（关系发现候选）/ `countCases`。嵌入以 base64 存 BLOB 列。
- **`ai/cbr.ts`** — `ingestTopicAsCase`（完整流程编排）+ `ingestAcceptedPanel`（钩子，best-effort 非阻塞）+ `registerCbrDevTrigger`（DEV）。
- **钩子接入**：`components/panel/ExpertPanelView.tsx` 的「采纳」后 fire-and-forget 触发入库。

---

## 6. 关键判断 / 偏离（实现时的决定）

1. **`Topic.status` 无 `'localMaximum'`** → 钩子挂在**专家组采纳**这一真实收敛事件上。
2. **§5 schema 面向 Postgres** → 本地降级（BLOB-base64 嵌入 + FTS5 trigram），pgvector/HNSW/真正 GIN 留 M3。
3. **`packages/ai` 不碰 DB** → prompts/embedding 在 ai 包，落库+编排+钩子在 desktop。
4. **嵌入需 Gemini key** → 未配置时入库被钩子静默跳过（不破坏采纳 UX）。
5. **未实测项**（需 Gemini key + Tauri 运行时）：真实 Gemini 调用、BLOB(base64) 经 plugin-sql 的实际写入。逻辑层均有单测（embed mock / base64 往返 / SQL 验证）。

---

## 7. 验证方式

见仓库根下的对话或下方"如何验证"。要点：
- **自动化（零配置）**：`pnpm --filter @nodx/models test`（119）、`@nodx/ai test`（113）、`@nodx/ai-gateway test`（23）、各包 typecheck。
- **嵌入端点（需 Gemini key）**：`workers/ai-gateway/.dev.vars` 加 `GEMINI_API_KEY` → 起 worker → `curl /v1/embed`。
- **完整入库（需 Gemini key + Tauri）**：跑专家组到采纳，或 devtools `await __nodxIngestCase("<topicId>")`，再 `await __nodxGetCase(...)` / 直接查 SQLite。
- **DB 路径**（macOS）：`~/Library/Application Support/app.nodx.desktop/nodx.db`

---

## 8. Week 2 — 检索 / 读路径（✅ 已完成）

**范围 = §3.16 ③ 召回排序 + ④ Fusion 报告。**

实现（`packages/ai/src/cbr/` + `apps/desktop`）：
- **`brain-hub.ts`**（Haiku）：query → ≤3 个 sub_intents（`MAX_SUB_INTENTS=3`，简单 query 返 1 个）
- **`ranking.ts`**（纯 TS，可测）：`cosineSimilarity`（[0,1] 映射）、`freshnessDecay`（τ=180 天）、
  `rankCases`（`0.60×语义 + 0.30×关键词 + 0.10×时效` → Top-5）、`maxSimByCase`
- **`fusion.ts`**（Sonnet）：Top-5 → `FusionReport{ coreBorrows, contrastCases, crossPatterns, contextWarnings }`
- **`db/cases.ts`** 读路径：`listCasesForRecall`（解码全部嵌入，暴力召回用）、`ftsRecall`（FTS5 trigram + bm25，短查询/语法异常优雅降级）
- **`ai/cbr.ts`** 编排：`retrieveCases(query)`（Brain Hub → 批量 embed 子意图 → 暴力 cosine + FTS 双路 → bm25 归一化 [0.5,1] → `rankCases` Top-5）、`fuseCases`（用 `completeUntilDone` 防截断）、`retrieveAndFuse`
- **dev 触发器**：`__nodxRetrieve(query)`（控制台 console.table 打分）、`__nodxFuse(query)`

**验证**：models 119 / ai 134（+brain-hub/ranking/fusion）/ worker 23 测试；desktop typecheck + build clean。
**已在真实 app 端到端验证**（devtools `__nodxRetrieve` / `__nodxFuse`，真实 Sonnet/Gemini）：
- 语义召回区分度正确：切题 query sem **0.90/0.89/0.87**、离题 query（"公司年会团建"）sem **0.78/0.78/0.77**
- Brain Hub 拆意图正确（切题→2 个子意图、离题→1 个）
- FTS 关键词：≥3 字词命中（"做市商"→2、"延迟预算"→1），离题→0（trigram 对 <3 字词有已知盲区，但语义主力 0.6 权重覆盖）
- Fusion 报告成功返回（Sonnet ~70s，长但正常）
- base64 嵌入跨 TS 写↔解码一致

**本周不做（留 Week 3+）**：方案适配执行师（→ AdaptedSolution，衔接专家组只跑差异）、检索 UI、Reranker（§3.18，P@5 < 0.6 才加）。

> 本地无向量索引，语义召回是暴力扫描——案例库小时没问题；M3 迁 Supabase + pgvector(HNSW) 时换成索引召回。

### 在 app 里跑完整检索（devtools）
```js
await __nodxRetrieve("新交易所做市系统的风控架构怎么设计")  // 打印 sub-intents + Top-5 打分表
await __nodxFuse("...")                                      // 检索 + Sonnet 融合参考报告
await __nodxAdapt("...", "<caseId>")                         // 适配执行师改写老方案到新语境
```

---

## 9. Week 3 — 适配执行师 + 检索 UI（✅ 已完成）

**§3.16 ④ 第二半（采用→适配）+ 首个面向用户的 CBR 界面。**

- **`models/adapted-solution.ts`** — `AdaptedSolution{ sourceCaseId, inheritedStructure,
  contextualizedLevers[], newRiskMitigations[], requiresExpertPanel, rediscussDirections[] }`（transient，不落库）
- **`ai/cbr/adapter.ts`**（Sonnet 适配执行师）— 选中案例 + 新问题/语境 → 改写（**绝不 replay**）；
  诚实判断 `requiresExpertPanel`，并列出该重新辩论的差异点（让专家组只跑 diff）
- **`db/cases.ts`** `getCaseById`；**`ai/cbr.ts`** `adaptCase(query, caseId, newContext?)` + `__nodxAdapt` dev 触发器
- **检索 UI**（`components/cbr/CaseSearchView.tsx`，Header 新增「案例库」Tab）：
  query 输入 → Top-5 案例卡（含 语义/关键词/时效 分数拆解）→「生成参考报告」（Fusion）→
  每张卡「采用并适配」→ AdaptedSolution 卡 → 若 `requiresExpertPanel` 给出差异点 +「新建话题去组建专家组」按钮
  - 慢调用（Fusion ~60–90s、Adapt ~30–60s）都有 pending 态
  - **库浏览预览**（`db/cases.ts` `listCasesBrief` + `LibraryPreview`）：未输入时直接列出库里已有案例
    （领域 / 决策类型 / 质量分 / 摘要），点任一张即用其领域试搜——不用先想 query；空库时给入库引导

**验证**：models 124 / ai 140 / worker 23 测试；desktop typecheck + build clean；
**适配器 live 实测**（把"高频做市风控"案例适配到"加密交易所做市"新语境）——
正确改写（影子持仓账本 / 现货永续隔离舱）、加新风险（对手方跑路 / 无牌照法律灰区）、
`requiresExpertPanel=true` 且列出 5 个精确差异点。教科书级 Fork & Adapt。

> **JSON 健壮性**：CBR 的抽象师 / 融合师 / 适配执行师都挂了 `JSON_QUOTE_RULE`（字符串内部用中文引号「」防解析崩），同专家组那套加固——详见 `docs/expert-panel.md §6.5`。

**Week 3 不做（留后续）**：`SnapshotReuse` 反哺评分循环、`as_is`/`inspiration_only` 模式、Reranker（P@5<0.6 才加）。

### 9.1 专家组只跑差异（✅ 已完成）

CBR 适配 → §3.14 专家组的**精确接线**：把 `requiresExpertPanel` 的差异点交给一个**只辩论差异**的专家组，
而不是从头重跑。**复用现有引擎，零改动** —— "只跑差异"= 用构造好的 question/context 让辩论聚焦差异、
把继承骨架当作既定前提。

- **migration v7** `topic_panel_seeds`（1:1 话题，存 inheritedStructure / levers / rediscussDirections / sourceCaseId，一次性消费）
- **`db/panels.ts`** `PanelSeed` + `insertPanelSeed/getPanelSeed/deletePanelSeed`
- **`CaseSearchView` 接线**：适配卡「用差异点新建话题」→ `createTopic` + `upsertDocument`（适配方案写成文档，顺带跳过 Survey）+ `insertPanelSeed`
- **`ExpertPanelView`**：检测到 seed → 显示**「只就差异点辩论」CTA**（列出骨架 + 差异点）→ 组建 + 跑 `buildScopedFraming(seed)` 构造的聚焦辩论 → 消费 seed；收敛采纳后照常 CBR 入库（闭环）
- 验证：desktop typecheck + build clean；v7 SQL（upsert 去重 + 级联）已 sqlite3 验证；真实 app 已应用 v7

### 在 app 里跑（案例库 Tab）
点 Header「案例库」→ 输入新问题 → 检索 → 生成参考报告 → 某张卡「采用并适配」→ 看适配方案。
- 脱敏用户确认环节（§3.15）、质量门槛入库 gate（§8.10）
- M3：迁 Supabase + pgvector（HNSW）+ 真正 FTS GIN

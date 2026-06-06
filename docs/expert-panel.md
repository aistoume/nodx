# 专家组对话思考引擎 — 实现状态（as-built）

> nodx 核心卖点「想得好」的落地：Survey 选定方向后，组建 3–5 位互补 AI 专家，跑
> 「独立首发 → 交叉质疑 → 修正立场 → 主持人综合」的结构化辩论，收敛出一个
> **Local Maximum** 结论供用户采纳。对应 PRD §3.14 / §8.9。
>
> 本文档记录已落地的实现，供后续设计新功能时参考。最后更新：2026-06。

---

## 1. 全景：分了几轮做的

| 阶段 | 交付 |
|---|---|
| ① 引擎 + 持久化 | `packages/ai` prompts + 编排循环；`db/panels.ts` 四表读写；`ai/panel.ts` 包装 |
| ② 专家组 UI | `components/panel/*`；中栏「📄 文档 / 🎙 专家组」切换；流式辩论展示 |
| ③ 轮数控制 | 动态轮数 + 可配置上限；模型放宽到 1..11；migration v5；UI 轮数下拉 |
| ④ 防截断 | `assistant_prefill` 续写：发言 + 主持人综合都不再被 `max_tokens` 截断 |
| ⑤ Markdown 渲染 | 发言 / Local Max 用 `.prose-doc` 渲染（含代码块/表格样式）|

---

## 2. 数据模型（`packages/models`）

全套 schema + 100% 单测：
`expert-panel.ts` / `expert-agent.ts` / `panel-round.ts` / `panel-exchange.ts` /
`local-maximum.ts` / `persona-template.ts`。

- **ExpertPanel**：`{ id, topicId, domain, members[], status, rounds[], localMaximum?, createdAt, updatedAt }`
  - status：`forming → debating → converged →（accepted | rejected_by_user）`
- **PanelRound**：`{ id, roundNumber, type, exchanges[], stopSignalsHit? }`
  - type：`initial | critique | refined | synthesis`
  - `roundNumber` 上限 = `MAX_PANEL_ROUNDS = 11`（最多 10 辩论轮 + 1 综合）
- **PanelStopSignal**（当前枚举）：`semantic_convergence | marginal_decay | max_rounds`
- **LocalMaximumResult**：`{ consensus[], divergence[{point,conditions}], openQuestions[], bestAnswer, confidence, acceptedByUser, acceptedAt? }`

---

## 3. 引擎（`packages/ai`）

### Prompts（`src/prompts/panel/`，均带版本号 + 单测）
| 文件 | 模型 | 输出 | 作用 |
|---|---|---|---|
| `domain-detect.ts` | Haiku | JSON | 识别决策领域（§8.9 step 1）|
| `recommend.ts` | Sonnet | JSON | 提议 3–5 位专家，`.refine` 强制含 1 个 `critic`（防 echo chamber）|
| `round.ts` | Sonnet | 文本 | 三个 builder：initial（闭门）/ critique（读他人）/ refine（更新立场）|
| `synthesis.ts` | Sonnet | JSON | 独立主持人 → `SynthesisOutput`（= LocalMax 去掉用户侧字段）|
| `judge.ts` | Haiku | JSON | 边际改进评分，`MARGINAL_THRESHOLD = 0.15` |

### 编排循环 `src/panel/run-panel.ts`
- 纯控制流，依赖注入（`PanelSteps` + `PanelCallbacks`），用 fake steps 单测，不碰网络。
- **动态轮数**：永远先跑标准 3 轮（initial/critique/refined），之后只要还在改进就追加
  `refined` 轮，直到 `maxRounds`；任一轮命中停止信号则提前停。
  - `DEFAULT_MAX_ROUNDS = 5`，`MAX_DEBATE_ROUNDS = MAX_PANEL_ROUNDS - 1 = 10`
  - `maxRounds = 3` 完全等同旧的固定流程
- **当前停止信号**：`marginal_decay`（判官分 < 0.15）、`max_rounds`（达上限）。
- 成员每轮**并行**发言（`Promise.all`），回调逐条/逐轮触发以便边跑边落库 + 流式 UI。

---

## 4. 桌面持久化 + AI 包装（`apps/desktop`）

### `src-tauri/src/migrations.rs`
- **v4**：四表 `persona_templates / expert_panels / panel_rounds / panel_exchanges`
  （members 内嵌 `members_json`，LocalMax 拍平进 `expert_panels` 列）。
- **v5**：放宽 `panel_rounds.round_number` 的 `CHECK` 从 `BETWEEN 1 AND 5` → `>= 1`
  （SQLite 不能 ALTER CHECK，做了 FK-safe 表重建，保留旧数据；模型层守住真实上限）。

### `src/db/panels.ts`
`createPanel / updatePanelStatus / insertRound / updateRoundStopSignals / insertExchange /
saveLocalMaximum / acceptLocalMaximum / getPanelByTopic / deletePanel / clearPanelRounds`
（行↔模型翻译沿用 `db/topics.ts` 模式，`getPanelByTopic` join 四表水合 + `ExpertPanelSchema.parse`）。
`acceptLocalMaximum` 会把 `bestAnswer` 回写到 `topics.ai_summary`。

### `src/ai/panel.ts`
- `formPanel(topic, parentContext?)` → detect domain + recommend，建 panel（forming），返回 `{panel, question, context}`
- `runDebate(formed, { maxRounds?, progress? })` → 跑 `runPanel`，逐轮落库，存 LocalMax，回写 aiSummary
- `runPanelForTopic` → form + debate 一把梭
- `registerPanelDevTrigger()` → DEV 下挂 `window.__nodxRunPanel(topicId)` / `__nodxGetPanel(topicId)`

---

## 5. UI（`apps/desktop/src/components/panel/`）

- `ExpertPanelView.tsx` — 主体，按 status 渲染：空态 CTA / forming（成员 + 轮数下拉 + 开始辩论 / 重新组建）/
  debating（流式 transcript）/ converged（Local Max + 采纳/拒绝）/ rejected（重新辩论）
- `PanelMembers.tsx` — 角色色卡（systemPrompt 可折叠）
- `PanelTranscript.tsx` — 按轮渲染发言（角色染色）+ 停止信号徽章；**Markdown 渲染**
- `LocalMaxCard.tsx` — bestAnswer + 把握度 + 共识/分歧/开放问题 + 采纳/拒绝；**Markdown 渲染**
- `roles.ts` — 五角色 → emoji/中文名/配色（复用主题五色 note token，critic 用红）
- 接入：`CenterPanel.tsx` 顶部「📄 文档 / 🎙 专家组」分段切换（仅在话题已有 document 时出现）
- **轮数下拉**：forming 态 + rejected/重新辩论态都有，选项 `[3,5,8,10]`（≤ `MAX_DEBATE_ROUNDS`），默认 5
- Markdown：`lib/markdown.ts` 的 `markdownToHtml` / `markdownToInlineHtml` + `.prose-doc`（index.css 已补 `pre`/`table` 样式）

---

## 6. 防截断（续写机制）—— 贯穿三层

**问题**：单次 `max_tokens` 再大也有上限，后期专家反驳多人时一条发言天然超长，写到上限被静默截断。
**解法**：检测 `stop_reason === 'max_tokens'` → 把已写内容作为 `assistant_prefill` 喂回，模型无缝续写，循环拼成完整内容。

| 层 | 改动 |
|---|---|
| **Worker** `ai-gateway` | `/v1/complete` 接受 `assistant_prefill`（拼成 assistant 消息）；续写空块不报错；`HARD_MAX_TOKENS=8192` |
| **Client** `@nodx/ai` | `completeText` 返回 `stopReason` + 接受 `assistantPrefill`；新增 `completeTextUntilDone`（文本续写）和 `completeUntilDone<T>`（JSON 续写：拼完再 extract+校验）|
| **Desktop** `ai/panel.ts` | 发言 `runExchange` 用 `completeTextUntilDone`（8000/块，最多 4 续写）；主持人综合 `synthesize` 用 `completeUntilDone`（8000/块，最多 2 续写）|

短回复仍只 1 次调用，只有长的才续写——自适应。Sonnet 调用仍走全局串行限流。

---

## 7. 关键常量 / 可调参数

| 参数 | 值 | 位置 |
|---|---|---|
| `MAX_PANEL_ROUNDS` | 11 | `models/panel-round.ts` |
| `DEFAULT_MAX_ROUNDS` | 5 | `ai/panel/run-panel.ts` |
| `MAX_DEBATE_ROUNDS` | 10 | 同上 |
| `MARGINAL_THRESHOLD` | 0.15 | `ai/prompts/panel/judge.ts` |
| 发言额度 / 续写 | 8000 / 4 | `desktop ai/panel.ts` runExchange |
| 综合额度 / 续写 | 8000 / 2 | `desktop ai/panel.ts` synthesize |
| Worker 硬上限 | 8192 | `ai-gateway/index.ts` |
| UI 轮数选项 | 3/5/8/10 | `ExpertPanelView.tsx` |

---

## 8. 明确未做 / 下一步候选

**引擎对齐 PRD v0.7（停止规则改版，已决定推迟）**：
- 判分与判停解耦（判官只出原始分，阈值判停在 orchestrator）
- `T_marg` 0.15 → 0.05（常数经济门槛）
- 新增 `marginal_ratio` 信号（ΔQ(N)/ΔQ(N-1) < 0.4）
- `PanelRound` 持久化 `convergenceScore` / `marginalScore`（需 migration）
- **语义收敛**信号（需 Gemini Embedding 端点，网关尚无）

**功能侧未做**：
- `openQuestions → Comment.type='open_question'` 卡点回写（需 comment 类型 migration + UI）
- `Topic.reasoningTrace`（topics 表无此列，现只回写 `ai_summary`）
- persona 库种子数据（现 recommender 即时生成，`personaTemplateId` 用占位 UUID）
- Chair 权力：`@专家`中途插话、强制结束、成员增删改、跨方向打断、user_proxy 真人替身
- **决策汇报导出**消费各方向 Local Max 集合（M1 §3.10，尚未做）
- 思考快照索引（§3.15，把 converged Topic 入私有索引供复用）

---

## 9. 如何跑 / 验证

**起服务**（手动验收需 AI 网关 + token）：
```
pnpm --filter @nodx/ai-gateway dev      # worker on :8787（需 .dev.vars 的 ANTHROPIC_API_KEY + CLIENT_TOKEN）
pnpm --filter desktop tauri dev          # Tauri 窗口（DB 走 plugin-sql，必须 Tauri 运行时）
```
**点一遍**：新建话题 → Survey 选方向 → 进子话题 → 切「🎙 专家组」→ 选轮数 → 组建 → 开始辩论
（看四轮流式 + 停止信号徽章）→ 读 Local Max → 采纳（回写 aiSummary）。
也可 devtools：`await __nodxRunPanel("<topicId>")` / `await __nodxGetPanel("<topicId>")`。

**自动化**：
```
pnpm --filter @nodx/models test      # 104
pnpm --filter @nodx/ai test          # 95（含续写 + 动态轮数测试）
pnpm --filter @nodx/ai-gateway test  # 17
pnpm --filter desktop typecheck
```

---

## 10. 涉及文件速查

```
packages/models/src/        panel-*.ts / expert-*.ts / local-maximum.ts / persona-template.ts
packages/ai/src/prompts/panel/   domain-detect / recommend / round / synthesis / judge (.ts + .test.ts)
packages/ai/src/panel/      run-panel.ts (+ .test.ts)
packages/ai/src/client.ts   completeText(+stopReason) / completeTextUntilDone / completeUntilDone
workers/ai-gateway/src/     index.ts / anthropic.ts（assistant_prefill）
apps/desktop/src-tauri/src/migrations.rs   V4_SQL / V5_SQL
apps/desktop/src/db/panels.ts
apps/desktop/src/ai/panel.ts / gateway.ts
apps/desktop/src/components/panel/   ExpertPanelView / PanelMembers / PanelTranscript / LocalMaxCard / roles
apps/desktop/src/components/CenterPanel.tsx   （文档/专家组切换）
apps/desktop/src/lib/markdown.ts   markdownToHtml / markdownToInlineHtml
```

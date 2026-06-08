# 卖点②「不丢失」— 思路复现 / 卡点 / 思考会话（as-built）

> 思考不会被中断打断：重开旧话题时自动「上次回顾」卡片；随手标「卡点」并全局聚合；
> 把连续思考切成会话、增量维护推理路径。对应 PRD §3.11 / §3.12 / §3.13 / §8.8。
>
> 状态：✅ 已完成并在真实 app 验证（回顾卡片 + 卡点 + 全局清单都跑通）。最后更新：2026-06。

---

## 1. 数据模型（`packages/models`）

- **`topic.ts`** +`reasoningTrace?: string`（AI 维护的推理路径，思路复现核心）、
  `hasOpenQuestions: boolean`（`.default(false)`；有未解卡点 = true）
- **`message.ts`** +`sessionId: string`（必填；旧 NULL 行读取时合并为 `'legacy'`）、
  type 枚举 +`'replay_card'`（上次回顾卡片 = 一条特殊消息，content 存结构化 JSON）
- **`comment.ts`** type 枚举 +`'open_question'`（卡点）；
  +`openQuestionData?: { question, blockedReason?, resolvedAt? }`（superRefine：open_question 必须带它，其它类型禁止带）
- **`thinking-session.ts`**（新）`ThinkingSession{ id, topicId, startedAt, endedAt, messageCount, aiRecap? }`
  - 「打开」= `aiRecap` 为 NULL；`endedAt` 始终有值（活跃时=最后活动时间，关闭时定格）
- 全部带/补单测（models 138 passed，+14）。

## 2. SQL migrations

- **v8**（`replay_sessions_and_open_questions`）：
  - topics ADD `reasoning_trace` / `has_open_questions`
  - messages ADD `session_id`（旧消息 NULL）
  - comments **表重建**放宽 type CHECK 加 `open_question` + 加 `open_question_data_json`
  - 新建 `thinking_sessions` 表 + 索引 `(topic_id, started_at DESC)`
- **v9**（`allow_replay_card_message_type`）：**修 v8 漏的** —— messages.type CHECK 还卡在 4 类，
  插 replay_card 报 `CHECK constraint failed`。重建 messages 表加 `replay_card`（保数据/触发器/draft_items FK）。
- 两条都用系统 sqlite3 端到端验证（重建保数据、CHECK、级联、FK），并在真实 app 应用到 v9。
- ⚠️ 依赖 SQLite **JSON1**（`json_extract` 查未解卡点）——标准内置。

## 3. AI 层（`packages/ai`）

| 文件 | 模型 | 作用 |
|---|---|---|
| `prompts/replay/recap.ts` | Sonnet | 上次回顾卡片 → `RecapOutput{ startingPoint, path[], stuckPoints[], newProgress[] }`（固定四段，§8.8）|
| `prompts/replay/trace.ts` | Haiku | 会话关闭时**一次调用产出两样**：`{ trace, sessionRecap }`（增量更新推理路径 + 本次会话小结，省一次调用）|
| `replay/recap-card.ts` | — | `toRecapInput(topic, sessions, openQuestions)` 域对象→输入（取近 5 个有 recap 的会话、未解卡点）|
| `replay/reasoning-trace.ts` | — | `toTraceInput(question, previousTrace, sessionMessages)`（只取 text 消息，加「我/AI」前缀）|

- 都挂了 `JSON_QUOTE_RULE`（防中文半角引号崩 JSON）。
- 测试：ai 150 passed（+10：recap-card 5 / reasoning-trace 5）。

## 4. 桌面 db（`apps/desktop/src/db`）

- **`sessions.ts`**（新）`ensureActiveSession`（复用近 10min 的开放会话，否则新建）/ `bumpSession` /
  `listStaleSessions`（开放 + 有消息 + 超 `SESSION_IDLE_MS=10min` 闲置）/ `finalizeSession` / `listSessions`
- **`messages.ts`** insertMessage 自动 `ensureActiveSession` + `bumpSession`（调用方无感）；
  rowToMessage 合并 NULL→`'legacy'`；+`createReplayCardMessage` / `getLatestReplayCard` / `listMessagesBySession`
- **`comments.ts`** open_question 支持；+`createOpenQuestion` / `resolveOpenQuestion` / `listOpenQuestions`（单话题）/
  `listAllOpenQuestions`（全局带话题标题）；create/resolve/delete 后 `recomputeHasOpenQuestions`
- **`topics.ts`** +`setReasoningTrace` / `recomputeHasOpenQuestions`（按未解卡点数算 0/1）；rowToTopic 读新列

## 5. 桌面 UI + 钩子（`apps/desktop/src`）

- **`ai/replay.ts`**（编排，best-effort）：`closeStaleSessions`（关旧会话→Haiku recap+trace）、
  `maybeGenerateReplayCard`（>24h 且近期没生成 且有素材 → Sonnet 生成 → 插 replay_card 消息）、
  `onTopicOpened`（先关会话再可能生成）、`registerReplayDevTrigger`（`__nodxReplay(topicId)` 强制生成）
- **`components/replay/ReplayCard.tsx`** 四段横幅 + 「带着卡点重新推理」（预填输入框）+ 收起
- **`DocumentView.tsx`** 选区菜单 +「📍 卡点」→ `NotePopover` 红色 stuck 变体 → `createOpenQuestion`；
  顶部渲染 ReplayCard 横幅；ChatComposer 加 `seedDraft`/`seedNonce`（重新推理预填）
- **`RightPanel.tsx`** 卡点第 5 类红色样式 + 图例
- **`Header.tsx`** 「📍 卡点 N」红角标 + 下拉清单（跳转话题）
- **`CenterPanel.tsx`** 打开话题时后台 `onTopicOpened`（once/挂载，guard）→ 生成则刷新；从 messages 取最新 replay_card 解析渲染
- **`App.tsx`** 加载 `listAllOpenQuestions` → 喂 Header；卡点跳转 = 选话题 + 切对话视图

## 6. 关键设计决策

1. **会话关闭 = 惰性（无常驻定时器）**：下次打开话题时关闭超 10min 闲置的旧会话。更稳、跨重启不丢，
   recap 恰在「下次打开」需要时生成（replay 卡正好要读它）。
2. **ReplayCard = `replay_card` 消息（JSON）+ 渲染成中栏顶部横幅**（不进聊天流，贴文档式 UI）。
3. **sessionId 必填**（按 PRD）+ 旧 NULL 行读取合并 `'legacy'`。
4. **去重**：replay_card 插入会经触发器把 last_activity 刷新到现在 → 24h 内重开不再生成。
5. 三步 AI 调用都 best-effort（失败不崩主流程，控制台 warn）。

## 7. 触发条件（自然流程）

- 打开话题 → `onTopicOpened`：① 关闭闲置会话（Haiku）② 若 `now - lastActivity > 24h` 且有素材（trace/recap/卡点）且近 24h 没生成过 → Sonnet 生成回顾卡 → 横幅。
- 打字 → 自动建/续会话；连续 10min 无输入 = 会话边界（下次打开惰性关闭 + 更新 trace）。
- 选中文字 →「📍 卡点」→ 红卡 + 全局角标 +1。

## 8. 验证

- models 138 / ai 150 / worker 23 测试；4 包 typecheck + desktop build clean。
- migration v8/v9 系统 sqlite3 验证 + 真实 app 应用到 v9。
- **真实 app**：`__nodxReplay(topicId)` 生成回顾卡 ✓；选区「📍卡点」✓；Header 角标 + 下拉 ✓；右栏红卡 ✓。
- **手动造 24h 旧话题**：回拨 `topics.last_activity` 到 2 天前 + 设 `reasoning_trace` + 加一个卡点，
  Cmd+R（让 app 重读时间戳）后打开话题即触发；或 devtools `await __nodxReplay("<topicId>")` 强制生成。

## 9. 本轮未做（严格不做项）

决策汇报导出、CBR 反哺评分 / fork_adapt 精确接线、思考时间线可视化（V2）、反向引用（V2）。

## 10. 涉及文件速查

```
packages/models/src/   topic.ts message.ts comment.ts thinking-session.ts (+ .test.ts)
packages/ai/src/prompts/replay/   recap.ts trace.ts
packages/ai/src/replay/   recap-card.ts reasoning-trace.ts (+ .test.ts)
apps/desktop/src-tauri/src/migrations.rs   V8_SQL / V9_SQL
apps/desktop/src/db/   sessions.ts(new) messages.ts comments.ts topics.ts
apps/desktop/src/ai/replay.ts
apps/desktop/src/components/   replay/ReplayCard.tsx DocumentView.tsx ChatThread.tsx RightPanel.tsx CenterPanel.tsx Header.tsx
apps/desktop/src/App.tsx
```

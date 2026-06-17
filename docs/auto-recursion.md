# 自动递进引擎（Auto-Recursion Engine）— as-built

> PRD §3.19 / §4「自动递进」角色组 / §5「// === 自动递进引擎 ===」类型块。
> 状态：**Sprint A + Sprint B 完成**（数据层 + PM/评分员 + 编排状态机 + DB 读写
> + 「采纳并推进」/路径预览 UI）；Sprint C（CBR 复用 + Auto-Run）未开始。

---

## 1. 这是什么

专家组解决"想得深"，但每次收敛后都停下来等用户。自动递进加一个**项目经理 PM**：
Local Maximum 被采纳后评估"够不够原子"（who / what / when / deliverable 四要素），
分流四种状态，按可行性排序候选子话题，沿 topPick 自动 spawn 下一层，直到方案落到
实操级或触发硬封顶（预算 $5 / 深度 4）。

核心设计红线（PRD §11）：
- `needs_real_world_data` 不是逃避——"这个不是想出来的"，标了就停，不让 AI 编造调研
- Auto-Run 永不默认；用户 Chair 随时可打断/改向/回退
- 每层强制路径预览卡片

## 2. Sprint A 交付（2026-06-08）

### 数据层（packages/models + migration v10）

| 文件 | 内容 |
|---|---|
| `feasibility-breakdown.ts` | 5 维评分（cost/time/risk 越低越好 + value + dependencies） |
| `child-candidate.ts` | 候选子话题 + `RecommendedActionSchema`（spawn_and_run/spawn_only/skip/flag_as_real_world_action） |
| `next-move-plan.ts` | PM 产出 + `NextMovePlanStatusSchema` 四态；childCandidates `.max(5)` |
| `auto-recursion-run.ts` | Run 记录 + Mode/Status enums + `RunInterruptionSchema` |
| `topic.ts` | +3 可选字段：`generatedByAutoRecursionRunId` / `autoRecursionDepth` / `parentNextMovePlanId` |

**Migration v10**（`auto_recursion_engine`）：topics +3 列、`next_move_plans`、
`auto_recursion_runs` + 索引。JSON 数组一律 TEXT 列（与 panel 表一致）。
已在真实 DB 应用（v10 干跑验证过默认值/CHECK/旧数据兼容；`db/topics.ts` 用显式
SELECT 列名单，新列对现有读写透明）。

### AI 层（packages/ai）

| 文件 | 内容 |
|---|---|
| `prompts/auto-recursion/pm.ts` | PM prompt（Sonnet）+ `PmOutputSchema`。PM 只出定性判断（status/atomicityScore/whatsMissing/候选 title/topPick 草稿），**不打分**。可选字段 `nullish→undefined` 加固（真模型会输出 null） |
| `prompts/auto-recursion/feasibility-judge.ts` | 评分员 prompt（Haiku，紧凑省 token，bestAnswer 截断 600 字） |
| `auto-recursion/feasibility-judge.ts` | `scoreFeasibility`（调用+校验）+ `computeFeasibilityScore`：`(1-cost)×0.2+(1-time)×0.2+(1-risk)×0.3+value×0.3`，clamp [0,1] |
| `auto-recursion/project-manager.ts` | `generateNextMovePlan(topic, localMax, steps, parentContext?)`：PM → 候选并行评分 → 降序排序 → topPick 回填（与 PM 草稿不一致时在 reasoning 追加 `[PM 原推荐：X，被评分员分流改为 Y]`）→ Schema 校验返回。**不写库**。`atomic_complete`/`needs_real_world_data` 强制丢弃候选且零评分员调用 |

**依赖注入**：`AutoRecursionSteps { runPm, runFeasibilityJudge }`，沿 run-panel 的
`PanelSteps` 范式——packages/ai 纯净无网络，desktop 在 Sprint B 接网关，测试用 fake。

### 验证

```
pnpm --filter @nodx/models test   # 184（+46）
pnpm --filter @nodx/ai test       # 175（+18，含 null 容错回归）
```

**真模型冒烟**（2026-06-08，本地网关 + 真实 DB 的 3 条 Local Max）：
- PM（Sonnet，12–15s/次）：3/3 输出合法 NextMovePlan；三条均判 `needs_real_world_data`
  且理由成立（使馆认证/外部法律意见/供应商文档）
- 评分员（Haiku，~5s）：合法 breakdown，判断合理（Kill Switch 阈值 → decisionRisk 0.85）
- 抓到并修复：Sonnet 给可选字段输出 `null` → schema nullish 加固 + 单测回归

**成本实测**：一次完整 PM 评估（1×Sonnet + ≤5×Haiku）≈ **$0.02–0.03**。
$5 预算的大头是每个 spawn 子话题的专家组辩论（~$0.3–0.8/场），Sprint B 预算监控按场次计。

## 3. PM prompt v2 分流校准（Sprint B 顺手完成）

Sprint A 冒烟发现 3/3 真实输入都走 `needs_real_world_data`，其中"资金性质/策略
频率/是否商业化未回答"被误归 real_world（实为用户可答的分叉）。**v2 修复**：
prompt 加「分流边界」规则——用户一句话能回答的前提问题 → `multi_path_choice` /
`needs_deepening`，real_world 只留给外部世界产生的事实（实测/报价/法律意见/访谈）。

**v2 真模型验证**：同一条曾误判的输入（基础设施 MVP）重跑 → 正确转为
`multi_path_choice`，5 个候选全走 Haiku 并行评分（0.92→0.43 降序），topPick=
"前置三问收敛"且 reasoning 原话复述新规则；真正的外部事实（Polygon.io 能力核查）
正确标 `flag_as_real_world_action`。完整管线（PM→并行评分→排序→回填）真模型全验。

## 4. Sprint B 交付（2026-06-12）

**db 层**（`apps/desktop/src/db/auto-recursion.ts`）：
plans/runs 行↔模型翻译 + `insertNextMovePlan` / `getLatestPlanForTopic` /
`createRun`（默认 $5 / 4 层）/ `finishRun` / `addRunSpend` / `recordSpawnedTopic`
/ `addInterruption` / `setTopicAutoRecursionLineage`；`db/topics.ts` 的
SELECT/rowToTopic 带出 3 个 lineage 字段。

**成本计量**：`ai/gateway.ts` 加 **usage tap**（`onAiUsage` 监听器，每次
complete 族调用广播 model+usage）+ `ai/pricing.ts`（Sonnet $3/$15、Haiku $1/$5
每 M token；未知模型按 Sonnet 保守计）。Run 期间订阅 → 真实花费实时累计到
`total_spent_usd`（覆盖 PM + 评分员 + 整场子话题专家组辩论）。

**状态机**（`ai/auto-recursion.ts` + 纯策略 `ai/auto-recursion-policy.ts`，带单测）：
```
采纳的 Local Max → PM 评估 → 存 plan → resolveStopAfterPlan
  (atomic_complete→completed / real_world→hit_real_world_block / 无候选→completed)
→ 路径预览等用户决定 (stop→paused_by_user)
→ resolveStopBeforeSpawn (预算≥上限→budget_exhausted / 深度>上限→depth_exhausted)
→ spawn 子话题（写 lineage 三字段 + run 记账）→ 专家组辩论 → auto-accept
→ 子话题 Local Max 喂回 PM → 递归
```
选中候选若为 `flag_as_real_world_action` → 诚实停（hit_real_world_block）。
auto 采纳暂不触发 CBR 入库（留 Sprint C，控制每层成本）。

**UI**（`components/auto-recursion/AutoRecursionModal.tsx`）：
- LocalMaxCard 新增「🚀 采纳并推进」（未采纳时在采纳旁；已采纳显示「🚀 自动推进」）
- 弹窗四态：**配置**（Auto-Step 默认 / Pilot / Auto-Run，见 §4d；预算+深度输入）
  → **运行中**（流式 phase + 实时花费）→ **路径预览**（推理链面包屑 + 原子度 +
  whatsMissing + 候选卡片：分数条/动作徽章/来源/依赖，Auto-Step 单选推进、
  Pilot 多选 spawn、随时「停在这里」）→ **终局报告**（状态/花费/层深/新建话题数）

## 4b. 卡点不丢推理 + real_world 先搜后停（2026-06-12 改进）

**问题**：run 一旦停止（尤其 `hit_real_world_block`），停止前各层 PM 的推理只躺在
`next_move_plans` 表里，节点上看不到；且很多"真实世界数据"其实公开可查，直接停太武断。

**改进① 每层评估落到节点**（`ai/plan-record.ts` 纯渲染 + `recordPlanAtNode`）：
- `topic.reasoningTrace` 追加一行紧凑摘要（`db/topics.ts:appendReasoningTrace`
  —— SQL 级追加，不覆盖思路复现维护的内容；replay 回顾卡能读到）
- 思考文档 append「🤖 自动递进 · PM 评估」节（状态/原子度/缺口/候选排名/PM 推荐/
  搜索发现/停止原因）。**有文档就 append；run 在该节点终止则必创建**——中途的无文档
  子话题跳过 doc（保住"首次打开自动生成聚焦文档"的行为），数据仍在 plans 表 + trace
- `hit_real_world_block` 停止时，仍缺的数据逐条写成 **卡点**（`createOpenQuestion`，
  blockedReason="自动递进：需要真实世界数据"→ 右栏红卡 + Header 全局角标 + 全局卡点清单）
- 每层恰好落档一次，五种终止路径（plan 停/用户停/pilot 完成/外部行动候选/封顶）全覆盖
- **非正常终止时由用户手动确认保存**（StopConfirm 阶段）：弹出"是否把这一层的推理
  记录保存到节点？"，列明将写入的内容（文档 PM 评估节 / trace 一行 / N 个卡点预览）；
  「不保存」则节点不动，PM 计划仍留在 next_move_plans 表。`completed` 成功记录静默保存
  （`RunController.onStopRecord` 回调，未提供时默认保存）

**改进② real_world 先搜后停**（默认开，config 可关）：
- PM 判 `needs_real_world_data` → **研究员**（Sonnet + `enableWebSearch`，freeform
  Markdown，逐条核实缺口，要求"查不到就明说，绝不编造"）→ **裁决员**（Haiku JSON：
  resolvedGaps / stillMissing / verdict，拿不准选 still_blocked）
- `resolved_enough` → PM 带 `researchFindings` **重新分流**（prompt 明示"已有数据的
  缺口不得再标 real_world"）→ 继续推进；`still_blocked` → 照旧诚实停，但搜索发现
  全文落进节点文档、stillMissing 成为卡点
- 每话题每 run 最多搜一次（防循环）；搜索成本同样进 usage tap 计入预算

**裁决员按编号判定（防截断，真机修复）**：裁决员（Haiku）原本被要求把每条缺口
**原文**抄进 resolvedGaps/stillMissing，而 PM 的缺口常是几百字长段，5 条就撑爆
600 token 上限 → JSON 截断、解析失败（真机婚礼话题复现）。改为 schema 输出**缺口
编号**（`number[]`，1-based），run loop `runWebResearch` 再映射回完整缺口文本——
输出从几百字压到 `[1]`/`[2,3]`，卡点/文档仍保留全文。越界/重复编号自动忽略。

文件：`packages/ai/src/prompts/auto-recursion/researcher.ts`（研究员+裁决，+测试）、
`pm.ts` PmInput.researchFindings、`project-manager.ts` 第四参改 opts 对象、
`apps/desktop/src/ai/plan-record.ts`（+测试）、`auto-recursion.ts` run loop、
`db/topics.ts:appendReasoningTrace`、Modal config「🌐 先网络搜索」开关。

## 4c. 常见疑问（行为不是 bug）

- **深度上限 ≠ 推进目标**：「4 层」是封顶，run 在 PM 命中任一终止状态时立刻停。
  设成 4 不代表一定跑满 4 层——`atomic_complete` / `needs_real_world_data`（搜后仍缺）
  / 无候选 / 用户停 都会提前收束。话题若在第 0 层就缺现实数据，就只会出第 0 层结论。
- **Auto-Step 是「每层等确认」**：自动 spawn + 跑专家组，但每层结束停在路径预览等用户
  点「▶ 推进」。看到预览卡片挂着不动 = 在等你选候选，不是停止。**真·全自动到底是
  Auto-Run（§4d，已实现）**——每层只给 3 秒预览窗口，否则自动放行。
- **僵尸 run**：关弹窗 / 关 app 时未达终止状态的 run 会留在 `running`（max_depth 0、
  低花费）。无害但不干净；Sprint C 可加「关闭即标记中断」。

## 4d. Auto-Run 全自动模式（2026-06-12）

🟡 **Auto-Run** 已落地（config 不再置灰）：沿 topPick 全自动递归到底，只在
原子 / 预算 / 深度 / 真实数据缺口时停。护栏按 PRD §3.19：

- **二次确认**：选 Auto-Run 后首次点「开始」弹琥珀色确认条（写明会自动 spawn /
  自动跑专家组 / 自动采纳、不再每层等确认 + 当前预算/深度），再点一次才真启动
- **每层 3 秒预览可关**：路径预览顶部显示「⏱ Ns 后自动推进」倒计时；倒计时归零自动
  沿当前 pick 推进。用户在窗口内可「▶ 立即推进」/「↩ 打回上一层」/「⏸ 暂停」
- **打回上一层**（`LayerDecision.rollback`）：engine 用**帧栈**实现——archive 刚
  spawn 的子话题（`archiveTopic` + interruption `rolled_back`），弹回父层、把导致
  这层的候选加入父层 `excluded`，重新展示父层预览（不重跑 PM）。被排除的候选在 UI
  里灰显划线、不可再选；`resolvePickedCandidate(plan, pick, excluded)` 过滤后选次优

实现：run loop 重构为 `evaluateLayer`（PM+研究→帧 / planStop）+ 帧栈驱动；
`auto-recursion-policy.ts:resolvePickedCandidate` 加 excluded 过滤（+测试）；
Modal 加 auto_run 选项 / 二次确认 / `key=previewNonce` 重挂触发倒计时 / 倒计时与
rollback 按钮。**注意**：rollback 只 archive 子话题（软删），不退已花的 token——
回退是"换条路"，不是"退钱"。

## 5. ⏳ Sprint C 待办

- spawn 前查 CBR 索引，命中走 Fork & Adapt（省专家组）+ auto 采纳接 CBR 入库
- 关闭弹窗 / 退出时把未终止的 run 标记为 `paused_by_user`（清僵尸 run）
- PM eval 集（30 题，含分流边界校准）；Settings 里预算/深度默认值可改
- 路径树可视化（基于 topics 的 lineage 三字段）

## 6. 文件速查

```
packages/models/src/  feasibility-breakdown / child-candidate / next-move-plan / auto-recursion-run (.ts+.test.ts)、topic.ts(+3)
packages/ai/src/prompts/auto-recursion/  pm.ts(v2 含分流边界) / feasibility-judge.ts (+pm.test.ts)
packages/ai/src/auto-recursion/          project-manager.ts / feasibility-judge.ts (.ts+.test.ts)
apps/desktop/src-tauri/src/migrations.rs V10_SQL
apps/desktop/src/db/auto-recursion.ts    plans/runs 读写 + lineage
apps/desktop/src/ai/auto-recursion.ts    run loop（steps 接网关）
apps/desktop/src/ai/auto-recursion-policy.ts  停止条件纯函数 (+test)
apps/desktop/src/ai/pricing.ts           计价 (+test)；ai/gateway.ts onAiUsage tap
apps/desktop/src/components/auto-recursion/AutoRecursionModal.tsx
apps/desktop/src/components/panel/LocalMaxCard.tsx（采纳并推进）/ ExpertPanelView.tsx
```

## 7. 验证

```
pnpm -r typecheck                  # 4 包全过
pnpm -r test                       # worker 23 / models 184 / ai 189 / desktop 31
pnpm --filter desktop build        # 通过
```

**真机手验路径**：任一话题 → 🎙 专家组 → 辩论收敛 → Local Max 卡点
「🚀 采纳并推进」→ 选 Auto-Step（$5/4 层默认）→ 看 PM 评估 → 路径预览选候选 →
「▶ 推进」→ 等子话题专家组辩完 → 下一层预览…「⏹ 停在这里」随时收束 →
终局报告核对花费/层深，左栏出现新子话题（带 lineage，可 sqlite3 查
`SELECT title, auto_recursion_depth FROM topics WHERE generated_by_auto_recursion_run_id IS NOT NULL`）。

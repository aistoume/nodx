# 自动递进引擎（Auto-Recursion Engine）— as-built

> PRD §3.19 / §4「自动递进」角色组 / §5「// === 自动递进引擎 ===」类型块。
> 状态：**Sprint A 完成**（数据层 + PM/评分员 AI 调用 + 单测 + 真模型冒烟）；
> Sprint B（编排状态机 + DB 读写 + 路径预览 UI）/ Sprint C 未开始。

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

## 3. ⚠️ 留给 Sprint B 的观察

三条真实输入 3/3 走 `needs_real_world_data`，`needs_deepening` 路径未被真实数据触发
（管线本身有单测覆盖）。其中"资金性质/策略频率/是否商业化未回答"被 PM 归入
real_world，但这是**用户可回答的分叉**，按 PRD 更接近 `multi_path_choice`。
→ Sprint B eval 集应专门放"内部可推演"案例，校准分流边界；必要时在 PM prompt
里把"用户一句话能回答的问题"显式划给 multi_path_choice / needs_deepening。

## 4. Sprint B/C 待办（严格分期）

**Sprint B — 编排状态机 + DB 读写 + 最小 UI**：
- `apps/desktop/src/db/`：next_move_plans / auto_recursion_runs 读写（行↔模型翻译）
- desktop 把 `AutoRecursionSteps` 接网关（Sonnet/Haiku）
- Run 状态机：running → completed/budget_exhausted/depth_exhausted/hit_real_world_block；
  预算实时累计；深度计数；spawnedTopicIds 记账
- LocalMaxCard「采纳并推进」按钮 + 模式选择（默认 Auto-Step）+ 路径预览卡片
- spawn 子话题时写 topics 三个 lineage 字段

**Sprint C — CBR 复用接入 + Auto-Run 全自动 + 打回上一层**：
- spawn 前查 CBR 索引，命中走 Fork & Adapt（省专家组）
- Auto-Run 二次确认 + 3s 可关预览 + 回退换候选
- PM eval 集（含分流边界校准）

## 5. 文件速查

```
packages/models/src/  feasibility-breakdown / child-candidate / next-move-plan / auto-recursion-run (.ts+.test.ts)、topic.ts(+3)
packages/ai/src/prompts/auto-recursion/  pm.ts / feasibility-judge.ts
packages/ai/src/auto-recursion/          project-manager.ts / feasibility-judge.ts (.ts+.test.ts)
apps/desktop/src-tauri/src/migrations.rs V10_SQL
```

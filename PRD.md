# nodx — AI 决策思考工作台 PRD

> 版本: v0.8（CBR 流水线 V1 省钱版：抽象 + 双路检索 + Fusion + 简化 GraphRAG；Reranker / 原子化 / Neo4j 留 V2/V3）| 作者: LaoMo + AI | 日期: 2026-06-02

---

## 1. 产品定位

**一句话**：帮高管把模糊的战略问题，拆成可执行原子任务的网状决策工具。

**核心场景**：管理层做决策时，常常面对模糊问题（"要不要 ALL IN AI？""现在该投资股票吗？"）。传统工具帮你画图（xmind）或写字（Notion），但不帮你**思考**。nodx 用 AI 作为思考陪练，结合"网状对话 + 第一性原理拆解 + 原子化任务"，把模糊问题变成可执行决策。

**核心理念**：AI 不替你思考，AI 陪你思考；用户主导深挖，AI 在结论时整合。

**目标用户**：
- 主要：企业高管 / 创业者（决策场景）
- 次要：知识工作者 / 学生（研究、写作场景）

---

## 2. 产品卖点与差异化

### 2.1 价值主张

**AI 陪你想，不替你想——让每一次思考成为可积累、可复用的资产。**

复杂决策从来不是一次想清楚的。它会被时间冲淡、被分支淹没、被新人重复推演、被不专业的判断浪费。nodx 用四个互补的能力，把思考从"一次性消耗品"变成**可深、可续、可复用的资产**。

**三条不可妥协的信条**：

1. **AI 陪练，不代劳**——抵抗"一键生成完整 mind map"的诱惑
2. **用户主导方向与价值判断，AI 主导深度与专业**
3. **思考是资产，不是消耗品**——每一次想透的问题都应该可被自己、被组织、未来的同行接得上

### 2.2 四大卖点

按战略权重排序（① 最重）：

| # | 卖点 | 对抗什么 | 一句话 |
|---|---|---|---|
| ① | **可积累**（头牌） | 重复推理 + 思考孤立 | 思考资产化，跨人 / 跨时间复用 |
| ② | **不丢失** | 时间遗忘 + 中断 | 思路复现，秒接续 |
| ③ | **想得好** | 浅尝辄止 + 不专业 | 专家组协议，每个方向想到 Local Max |
| ④ | **想得到** | 思想盲点 + 逻辑断层 | 盲点哨兵，抓住没想到的 |

---

#### 卖点 ① 可积累 —— 思考是资产，不是消耗品（核心差异点 / 最深护城河）

每一次完整思考的过程和结论被结构化"快照化"，建立可检索索引。下次同类问题出现时，**先查老快照、再适配**（Fork & Adapt），避免从零重复推理。

**类比**：Google 是**网页**的 crawler + indexer + ranker；nodx 是**思考过程**的 crawler + indexer + ranker。

**具体能力**：
- **个人记忆（V1，MVP）**：你自己的 Topic 自动入私有索引，下次提相似问题先查"我以前怎么想的"
- **团队记忆（V2）**：组织内部共享，"我们公司之前讨论过这个吗？" —— 高管最痛点
- **公共匿名索引（V3）**：opt-in 脱敏共享，跨公司思考模式复用
- **策展专家库（V4）**：授权的真实专家文本（咨询报告 / 投资人札记 / 案例库）接入

**护城河**：所有市面思考工具都是"一次性消耗品"—— ChatGPT / Claude 没有结构化复用、Notion / Roam 没有 AI 排序、FunBlocks 一键生成不可索引、Perplexity 检索的是网页不是思考过程。nodx 是唯一把思考"网页化 + Google 化"的产品。**这个护城河需要时间和用户量沉淀，竞品复制不了**。

---

#### 卖点 ② 不丢失 —— 思考不会被中断打断

复杂问题往往不是一次能想透的，需要反复思考和推理。但间隔一段时间后，之前的思路被打断、被遗忘。nodx 能**重新复现当时的推理思路**，帮用户快速回忆思考要点和**卡点（stuck point）**。

**具体能力**：
- **"上次回顾"卡片**：隔 N 天重开话题，AI 自动生成回顾——你从哪出发、走过的推理路径、停在哪、卡在什么、期间有无相关新进展
- **卡点标记**：用户可显式标记"我卡在这里了"，AI 结构化记录悬而未决的问题与卡住原因
- **再推理触发**：AI 主动问"上次你卡在 X，要重新推一遍吗？还是已有新信息？"
- **思考时间线**：每个话题记录"思考会话"（哪天想了多久），让用户看到自己的思考节奏

**护城河**：竞品（FunBlocks AIFlow / Nodini.ai / TrAIn of Thought）都把思考当成"一次性会话"，没有任何一个解决"隔几天回来接不上"的问题。

---

#### 卖点 ③ 想得好 —— 每个方向都想到 Local Maximum

针对用户选定的每个方向，AI 主导推理深度——但**不替用户决定方向**。用专家组协议把方向想到当前知识下的最优解。

**具体能力**：
- **专家组协议**：3–5 个互补 AI 专家（含强制的魔鬼代言人），按 Propose → Critique → Refine → Synthesize 四轮辩论
- **Local Maximum 判定**：语义收敛 / 边际改进递减 / 硬上限，三选一即停
- **用户作为 Chair**：任意 Round 可 `@专家X` 追问、替换成员、强制结束、拒绝结论
- **第一性原理拆解**：每个方向从本质问题开始拆，不停留在表象

**护城河**：vs FunBlocks 那种"输入问题 → AI 一键生成完整 mind map"—— nodx 坚持 AI 陪练而非代劳。但 AI 在用户选定方向后**主导深度**——这是与"一切让 AI 干"和"一切让人干"两端都不同的中间位置。

---

#### 卖点 ④ 想得到 —— 抓住思想上的漏洞

帮用户把思想上、策略上、逻辑上的漏洞捕捉到，并给出应对分析和补充。AI 在这里当**哨兵**，不替用户决定，只提示用户没看到的。

**具体能力**：
- **引导式 Survey**：用户输入问题后，AI 不立刻回答，先给 5–7 个候选关注维度的多选卡片
- **盲点扫描**：思考进行中 AI 持续扫描全图——"你完全没碰过 X 维度"
- **隐含假设审计**：标出用户陈述里没说出口的假设
- **跨支矛盾检测**：分支 A 说"快速扩张"、分支 B 说"保守现金"，高亮冲突让用户裁决
- **逻辑断层检测**：发现"从 A 直接跳到 C，缺了 B"
- **幽灵节点**：Survey 没选的维度保留可激活，避免遗漏

**支撑能力（不单列卖点，但服务全局）**：
- **网络链接式记忆**：跨分支 @ 引用 + AI 主动提示关联
- **决策可移交**：五色备注（便签 / 解释 / 原子动作 / 卡点 / 引用）让思考过程能被同事接手——决策不再是"黑箱在某个人脑子里"

### 2.3 与竞品的差异化

| 对象 | 竞品做法 | nodx 做法 |
|---|---|---|
| ChatGPT / Claude | 单线程对话，原生分支不可视化、不可索引 | 网状多对话 + 可视化 + 快照可复用 |
| FunBlocks AIFlow | AI 一键生成完整 mind map（代劳）；无专家辩论；无复用索引 | AI 陪练；专家组四轮辩论收敛到 Local Max；快照 Fork & Adapt |
| Nodini.ai / TrAIn of Thought | 分支式对话，把思考当一次性会话；无跨时间接续 | 思路复现 + "上次回顾"卡片 |
| Notion AI | 文档优先；无结构化辩论；无质量排序 | 结构化思考 + 专家级深度 + 执行落地闭环 |
| xmind / Roam Research | 静态画图 / 纯手动关联笔记；无 AI 主导深度 | AI 协同 + 第一性原理 + 专家组 + 快照索引 |
| Perplexity | 检索**网页** + 综合答案 | 检索**思考过程** + 适配复用 |

**核心信条**（不可妥协，是产品的灵魂）：

1. **AI 陪练 vs 代劳**——抵抗"一键生成完整 mind map"的诱惑
2. **永不 replay，只 Fork & Adapt**——老快照是脚手架不是答案
3. **用户主导方向与价值判断，AI 主导深度与专业**

这三条让 nodx 与所有"AI 替你思考"的产品分野，也让快照系统成为可信、可用、可持续的资产，而不是"决策黑箱"。

---

## 3. 核心功能

### 3.1 引导式 Survey
用户输入问题 → AI 不立刻回答，先弹出 5–7 个候选关注维度的多选卡片 → 用户勾选 3–5 项 → 未选项保留为"幽灵节点"可后续激活。

### 3.2 第一性原理拆解
基于用户选中的维度，AI 用第一性原理把每个维度拆成关键子问题。每个子问题可点击「→ 深入讨论」生成子对话。

### 3.3 网状对话工作台
- 每个节点 = 一个完整 AI 对话
- 网络图作为导航与全局视图
- 节点状态：探索中 / 已总结 / 已得出原子动作 / 幽灵
- 关系类型：父子（实线箭头）/ AI 跨支语义关联（紫色虚线动画）

### 3.4 三栏对话页面
- 左栏：面包屑 + 兄弟/子对话/幽灵节点列表 + 迷你网络图
- 中栏：对话流（含 Survey 卡片、第一性原理拆解、@ 引用胶囊、"上次回顾"卡片）
- 右栏：Google Doc 风格五色备注（黄=便签 / 蓝=解释 / 绿=原子动作 / 紫=引用 / 红=卡点），虚线锚定到中栏对应段落

### 3.5 即时解释
用户在对话中选中任意文字 → 浮现「解释」按钮 → AI 在右栏生成蓝色解释卡片（不污染主对话流）。

### 3.6 原子化检查器
节点结论需满足 4 要素才算原子：**谁** + **做什么** + **何时** + **产出物**。AI 自动检查并提示补全。颗粒度可配置（战略级 = 周；执行级 = 天/小时）。

### 3.7 子对话折叠 + 向上合并
- 节点可折叠成单点（带 +N 徽章），减少前端渲染压力。
- 「合并回父对话」：AI 自动生成子对话核心结论摘要 → 用户编辑确认 → 插入父对话相应位置（保留来源标记）。

### 3.8 @ 跨对话引用
- 输入 `@` 自动补全所有对话节点。
- 嵌入为蓝色胶囊，点击跳转。
- AI 看到 @ 时只取被引用对话的总结作为上下文（节省 token）。
- 支持细粒度 `@对话名#段落`。
- **TODO**：反向引用（被引用方显示"被 X 引用 N 次"），V2 实现。

### 3.9 草稿区
讨论中冒出来的无关新点子先扔草稿区（顶部抽屉），不创建节点污染网络图。整理时再决定并入对话或起新对话。

### 3.10 决策汇报输出
任意节点上点「产出决策汇报」→ AI 扫描子树 → 生成三件产物：
1. 决策摘要（3–5 句给老板）
2. 行动清单（按时间/责任人组织的甘特图）
3. 未解问题清单

支持导出 Word / Markdown / PPT 草稿。

### 3.11 思路复现 / "上次回顾"卡片（卖点 ①）
用户重新打开一个间隔较久的话题时，AI 自动在对话顶部生成"上次回顾"卡片：你从哪出发、走过的推理路径、停在哪、卡在什么、期间有无新进展。卡片末尾附「重新推理」按钮，带着卡点重新展开苏格拉底追问。

### 3.12 卡点标记（卖点 ①）
用户可在对话任意位置标记"我卡在这里了"，生成一条红色卡点备注（结构化记录：悬而未决的问题 + 卡住原因）。所有卡点跨话题聚合，形成全局"卡点清单"，与全局 Todo 并列。

### 3.13 思考时间线（卖点 ①）
每个话题按"思考会话"切分（一次连续思考为一个 session），可视化展示用户在该话题上的思考节奏与每次会话的小结。

### 3.14 问题拆解 + 专家组协议（核心引擎）

Survey 完成后，对每个用户选中的方向自动组建**专家组**，跑一套结构化的多智能体辩论协议，直到该方向收敛到 **Local Maximum Solution**。所有方向收敛 = 整体 Survey 阶段完成。

> **理论锚点**：「想得好」= AI 主导推理深度，人主导方向与价值判断。专家组是"AI 主导"的具体实现；用户作为 **Chair（主席）** 全程掌控。

**专家组组成（Panel Composition）**

每方向 3–5 位 AI 专家，强制包含互补角色：
- 🔵 **正方主推**：带框架给方案
- 🔴 **魔鬼代言人**：必备，防止 echo chamber
- 🟢 **实操经验**：『我做过这事，告诉你坑』
- 🟡 **外部约束**：法务 / 监管 / 财务规则
- 🟣 **用户自带（可选）**：用户拉真人朋友/同事的"AI 替身"

AI 自动提议人格栈 → 用户可替换 / 增删 → 确认后开始辩论。

**四轮辩论协议（Propose → Critique → Refine → Synthesize）**

| Round | 名称 | 任务 |
|---|---|---|
| 1 | 独立首发 | 每位专家闭门写初判，避免相互污染 |
| 2 | 交叉质疑 | 每位专家读他人初判，写反驳/补充 |
| 3 | 修正立场 | 每位专家更新立场（明确被说服哪些、坚持哪些） |
| 4 | 主持人综合 | 独立"主持人"角色阅读全部 transcript，输出 Local Max |

**Local Maximum 判定（启发式 + 经济停止 + 二阶信号）**

> **方法论锚点（v0.7 修订）**：受 Bullard et al. *PNAS* 2026.6 启发——他们证明 i.i.d. 探索/利用问题中线性递减阈值近最优。但 nodx 的辩论结构**不严格满足 i.i.d.**：每轮专家都读取所有先前 transcript，信息**单调累积**，ΔQ 在期望上自然递减。所以我们只借用"线性递减"作为简单可解释的启发式（且只用于 T_conv），marginal improvement 维度改用更贴合 diminishing-returns 特性的**经济常数 + 比率检测**。

设：
- `N` = 当前轮数（1 ≤ N ≤ R）
- `R` = 最大轮数（默认 5）
- `τ` = N / R（进度比例，0–1）
- `ΔQ(N)` = 本轮综合相对上轮的改进分（Haiku-as-judge 评，0–1）

**三组停止信号**：

① **语义收敛接受阈值**（线性递减，**分歧平台逻辑**）

`T_conv(τ) = 0.85 - 0.15 × τ`

| N | T_conv | 含义 |
|---|---|---|
| 1 | 0.85 | 早期需高度一致才停 |
| 3 | 0.76 | 中段适度收敛即可考虑停 |
| 5 | 0.70 | 晚期承认剩余分歧是结构性的，七成一致就够 |

直觉：convergence 随 N 自然单调上升，但会撞到**结构性分歧的平台**——剩下的分歧可能是真实的价值判断分歧，不是模型失败。晚期降低阈值是承认天花板，不为最后 0.1 浪费一轮。形式上和 Feynman 线性一样纯属碰巧，**理由换成了分歧平台检测**。

② **边际改进经济门槛**（常数）

`T_marg = 0.05`

含义：本轮改进 < 5% 即触发停止。**纯经济门槛**——5% 的质量提升不值得一轮的 token 成本。与 N 无关，因为 ΔQ 本身已经在自然递减，再让阈值也变化是重复表达。

③ **改进比率检测**（二阶信号，N ≥ 3 起生效）

`ratio(N) = ΔQ(N) / ΔQ(N-1)`

若 `ratio(N) < 0.4` → 触发停止。

含义：改进幅度**相对腰斩**，是 diminishing returns 的典型信号。剩下的轮次大概率比这轮还小，不值得再投。

**停止规则（任一触发即停）**：

1. `semantic_convergence(N) ≥ T_conv(N/R)` — 收敛到当轮门槛
2. `N ≥ 2` 且 `ΔQ(N) < 0.05` — 改进太小，经济上不划算
3. `N ≥ 3` 且 `ΔQ(N) / ΔQ(N-1) < 0.4` — 改进腰斩，diminishing returns
4. `N ≥ R` — 硬上限

满足任意一条 → 该方向标记 `localMaximum: true`，主持人输出固化为 `LocalMaximumResult`。

**为什么留四个信号而不是合并**：每个信号原始分数（`convergenceScore` / `marginalScore`）落库后可独立 eval 调参。MVP 跑起来后基于实测数据可能：保留全部、只留 ① + ④、或换成 ρ-拟合的纯经济模型预测剩余收益。设计意图是**把阈值策略和判官分数解耦**，保留全部可观测性。具体数学模型在 MVP 实测后定。

**用户作为 Chair 的权力**

- 任意 Round 可 `@专家X` 插话追问
- 替换 / 删减专家成员，循环可重启
- 强制结束跳到 Synthesize
- 拒绝 Local Max → 强制再来一轮
- 跨方向打断（暂停 A，跳到 B）

**与已有功能的衔接**

- §3.1 Survey 选完方向 → 自动触发专家组组建
- 每个方向的 Local Max → 作为该方向 Topic 的 `aiSummary` + `reasoningTrace`
- 跨方向的 Local Max 集合 → 喂给「收尾整理者」生成决策汇报（§3.10）
- 主持人输出的"未解开放问题" → 自动落到 `Comment.type='open_question'` 卡点（§3.12）

### 3.15 思考快照索引（Thinking Snapshot Index）

**愿景**：把每一次完整思考的过程和结论"快照化"，建立可检索的索引。下次同类问题出现时，先查老快照、再适配，避免从零重复推理。把思考从"一次性消耗品"变成**可积累、可复用的资产**。

**类比**：Google 是网页的 crawler + indexer + ranker；nodx 是**思考过程的 crawler + indexer + ranker**。

**核心原则：Fork & Adapt，绝不 Replay**

决策依赖语境（公司、行业、时点），老答案直接给新人用就是误导。所有复用必须走「复用适配员」路径——**老快照是脚手架，不是答案**。

**索引单元：Topic 级（不是整决策、不是单条消息）**

每个达到 `localMaximum: true` 的 Topic 自动成为候选 Snapshot。整决策太粗、单消息太细，方向级最合适。

**复用流程**

```
新用户提问
  ↓
向量检索（pgvector + Gemini Embedding 2）→ Top-K 候选
  ↓
多维重排：相似度 × 质量分 × 时效衰减 × 语境匹配
  ↓
Top-3 候选给用户："发现 3 个相似思考，要参考吗？"
  ↓
选某条 → 复用适配员（Sonnet）分析：相似处 / 不同处 / 该保留的框架 / 该重做的部分
  ↓
用户三选一：
  A. as_is             - 完全采用（仅低风险/常识性问题）
  B. fork_adapt        - 以老快照为种子，专家组只跑差异部分（推荐，省 60% token）
  C. inspiration_only  - 完全重启，老快照仅作启发并排展示
```

**隐私分层（三档可见性）**

| 档位 | 谁能搜到 | 默认 |
|---|---|---|
| `private` | 只有创建者 | ✅ 默认 |
| `team` | 组织/团队内部 | 企业版（V2）|
| `public_anonymous` | 全网，强脱敏 | 每次显式 opt-in（V3）|

脱敏流程：AI 自动脱敏（去公司名 / 规模数字 / 人名 / 行业识别细节）→ 用户人工 review → 入库。

**质量门槛 + 时效衰减**

只有以下条件全部满足的快照能进 public 索引：
- 质量评分 > 阈值（来自评分系统）
- 创建超过 N 天（防止热乎错误污染）
- 时效衰减：检索时按 `quality × exp(-age/τ)` 排序
- 累计 3+ 负反馈 → 自动从公共索引下架

**分阶段路径**

| 阶段 | 索引范围 | 目标 | MVP 归属 |
|---|---|---|---|
| **V1 个人记忆** | 只索引你自己的 Topic | 下次问类似的能秒查自己以前怎么想的 | ✅ MVP V1 |
| **V2 团队记忆** | 组织内部共享 | "我们公司之前讨论过这个吗？" | Backlog |
| **V3 公共匿名索引** | opt-in 脱敏共享 | 跨公司思考模式复用 | Backlog |
| **V4 策展专家库** | 授权的真实专家文本（咨询报告 / 投资人札记 / 案例库）| 让"专家级"真有据可依 | Backlog |

### 3.16 CBR 检索流水线（V1 省钱版）

§3.15 的快照索引升级为完整的 case-based reasoning（CBR）流水线。V1 走"最便宜的等价替代"——质量不够再升级。

**省钱原则**：不引入新服务（一切在 Supabase + Worker）；不引入新框架（纯 TS 函数，不上 LangGraph）；Haiku 优先 Sonnet；one-time 成本可花，per-query 成本必抠。

**CBR 四步 V1**

**① 抽象 + 去标识化**（Topic localMaximum 时一次性触发）

```
[Haiku]   脱敏（去公司名 / 人名 / 数字量级化）
   ↓
[Sonnet]  抽象师：输出 AbstractedCase
   - problemSignature  { domain, decisionType, keyDimensions, constraints }
   - reasoningPath     { frameworks, keyQuestions, pivotalDecisions }
   - solutionPattern   { structure, keyLevers, riskMitigations }
   - outcome           { qualityScore, userFeedback? }
   ↓
[索引器]  算 2 个 embedding（不是 4，省 50%）
   - problemEmb  = embed(problemSignature 文本化)
   - solutionEmb = embed(solutionPattern 文本化)
   ↓
[关系发现者] 顺手算与已有案例的边（见 §3.18 简化 GraphRAG）
   ↓
写入 abstracted_cases + case_relations 表
```

成本：~$0.052 / 案例（一次性）。

**② 建立"问题场景"索引**

- pgvector HNSW 索引：`problem_emb`、`solution_emb`
- Postgres FTS GIN：`signature_text`、`solution_text`
- B-tree：`domain` / `quality_score` / `freshness_date`
- 关系表索引：`case_relations(source_id, target_id, relation_type)`

**③ 检索与召回**（用户提新问题时）

```
[Haiku]  大脑中枢 Brain Hub
   query → ≤ 3 个 sub_intents（简单 query 跳过此步）
   ↓
对每 sub_intent 并行 2 路召回：
   ┌─ pgvector 语义召回（Top-30）
   └─ Postgres FTS 关键词召回（Top-30）
   ↓
Heuristic 加权排序（不用 reranker，全免费）
   score = 0.60 × semantic_sim
         + 0.30 × keyword_sim
         + 0.10 × freshness_decay
   Top-5 出
```

成本：~$0.001（Haiku 拆解）+ DB 操作免费。

**④ Top-K Fusion + 方案适配**

```
[Sonnet] 多路融合师
   输入：Top-5 候选
   输出：综合参考报告
     - 3 条最相关核心借鉴
     - 2 条对照案例（不同选择对比）
     - 跨案例可借鉴模式
     - 不可借鉴的关键差异（语境警示）
   ↓
用户决定是否采用
   ↓
若用户点"采用" → [Sonnet] 适配执行师真改写
   输出 AdaptedSolution
     { inheritedStructure, contextualizedLevers,
       newRiskMitigations, requiresExpertPanel }
   ↓
若 requiresExpertPanel == true → 衔接 §3.14 专家组只跑差异部分
```

成本：Fusion ~$0.05，Adaptation ~$0.03（30% 触发，期望 ~$0.01）。

**V1 单次查询期望成本 ≈ $0.06**（完整版 $0.30 的 1/5）

**故意延期项（不是遗漏）**

| 项 | V1 替代 | V2 升级触发条件 |
|---|---|---|
| Reranker | 多路分数加权 heuristic | P@5 < 0.6（详见 §3.18）|
| 4 个细分 embedding | 仅 problem + solution 两个 | 检索粒度被实测证明不够时 |
| LangGraph 编排 | 纯 TS 顺序函数 | 流程出现条件分支+并行需求时 |

### 3.17 知识库乐高化（atomic modularity，V3 远期）

把方案进一步拆成**可独立检索 + 可重组**的"推理原子动作"：

```typescript
type AtomicReasoningMove = {
  id: string;
  type: 'framework_application' | 'assumption_check' | 'data_query'
      | 'analogy' | 'devils_advocate' | 'quantification' | 'staging';
  template: string;             // 参数化模板，如 "对 {X} 做 Porter 五力分析"
  parameters: string[];
  applicableDomains: string[];
  usageCount: number;
  successRate: number;
  embedding: number[];
};
```

**例子**："对 {方向} 做敏感性分析"、"用 {框架} 拆解 {问题}"、"找 {领域} 中失败的反例"。

**为什么放 V3 而不是 V1**：抽出干净的原子块**很难**（Sonnet 容易给出又长又具体不够泛化的块），需要严格 prompt 设计 + 人工校验循环。但回报很大——从"复用整案"升级到"按块拼装新方案"。

**V3 启动条件**：CBR-V2 跑 3 个月，案例库 > 500 条，且观察到清晰可识别的复用模式。

### 3.18 GraphRAG（V1 简化版）+ Reranker（V2 升级）

**V1 简化版 GraphRAG：纯 SQL 关系表**

不上图数据库，case 间的图结构落到关系表 + 递归 CTE 查询。

```typescript
type CaseRelation = {
  id: string;
  sourceCaseId: string;
  targetCaseId: string;
  relationType: 'shares_framework' | 'shares_domain' | 'contrasts'
              | 'composed_from' | 'caused_by';
  weight: number;             // 0–1
  createdAt: number;
};
```

**关系怎么产生**：`关系发现者`（Sonnet，在抽象师之后顺手算）扫已有案例库，写入 case_relations。一次性成本。

**查询方式**：SQL 递归 CTE，2 跳内：

```sql
WITH RECURSIVE related AS (
  SELECT target_case_id, 1 AS depth
  FROM case_relations
  WHERE source_case_id = $1 AND relation_type = 'shares_framework'
  UNION ALL
  SELECT cr.target_case_id, r.depth + 1
  FROM case_relations cr
  JOIN related r ON cr.source_case_id = r.target_case_id
  WHERE r.depth < 2
)
SELECT DISTINCT target_case_id FROM related;
```

**V2 升级路径**：案例库 > 10 万 或递归 CTE 性能扛不住时，迁 **Postgres + Apache AGE 扩展**（仍同栈无新服务）。再扛不住才考虑 Neo4j。

**Reranker（V1 跳过，V2 加）**

V1 用多路分数加权代替（见 §3.16 ③）。

**触发升级条件**：上线后 100 个真实查询的人工 eval，**P@5 < 0.6** → 接入 **Cohere Rerank 3.5 lite** API（~$1/1000 calls）。Cohere 不达标 → 自托管 **BGE-Reranker-v2-m3**。

---

## 4. AI 角色设计

AI 在 nodx 里承担十七种角色，按触发场景划分：

**对话内**

| 角色 | 触发 | 任务 |
|---|---|---|
| 开场分析师 | 用户输入新问题 | 生成候选关注维度（Survey） |
| 苏格拉底追问者 | 用户在对话中输入 | 用第一性原理反问，拆解到原子级 |
| 即时解释者 | 用户选中文字 → 点解释 | 生成 50–150 字解释，写入右栏 |
| 收尾整理者 | 用户点「总结」/「合并回父对话」 | 提取结论、原子动作、跨对话关联建议 |
| 思考复现者 | 用户重开间隔 > 24h 的话题 | 生成"上次回顾"卡片，唤起卡点与推理路径 |

**专家组协议（§3.14）**

| 角色 | 触发 | 任务 |
|---|---|---|
| 领域分类员 | Survey 方向确认 | 给方向打领域标签（M&A / 市场进入 / ……），决定调哪个人格栈 |
| 人格栈推荐器 | 领域确认后 | 从人格库选 3–5 个互补专家，提议给用户确认 |
| Panel 成员（× N） | 四轮辩论 | 按各自 persona 独立首发 / 交叉质疑 / 修正立场 |
| Panel 主持人 | Round 4 | 阅读全部 transcript 输出 Local Maximum 综合 |
| 收敛判官 | 每轮末尾 | 算语义相似度 + 边际改进，决定是否停止辩论 |

**快照索引（§3.15）**

| 角色 | 触发 | 任务 |
|---|---|---|
| 快照策展员 | Topic 达到 `localMaximum` | 评估是否够格入库（质量分 / 原子化 / 置信度）；自动脱敏，请用户确认 |
| 复用适配员 | 检索命中候选时 | 把老快照与新用户语境对照，输出相似 / 不同 / 该保留 / 该重做的分析 |

**CBR 检索流水线（§3.16）**

| 角色 | 触发 | 任务 |
|---|---|---|
| 抽象师（Sonnet） | Topic localMaximum 时 | 输出 problemSignature / reasoningPath / solutionPattern |
| 关系发现者（Sonnet） | 抽象之后 | 算与已有案例的边（shares_framework / contrasts 等），写 `case_relations` |
| 大脑中枢 Brain Hub（Haiku） | 用户提新问题 | 拆 query 为 ≤ 3 个 sub_intents；简单 query 跳过 |
| 多路融合师（Sonnet） | Top-5 候选就位 | 综合多路结果，输出参考报告 |
| 适配执行师（Sonnet） | 用户点"采用某条" | 真改写老方案到新语境，输出 `AdaptedSolution` |

---

## 5. 数据模型

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
  reasoningTrace?: string;  // AI 持续维护的"推理路径"摘要 —— 思路复现核心
  hasOpenQuestions: boolean;// 是否有未解决的卡点（网络图上打标记）
};

type Message = {
  id: string;
  topicId: string;
  sessionId: string;        // 所属思考会话（支撑思路复现 / 时间线）
  role: 'user' | 'ai';
  type: 'text' | 'survey' | 'factor_list' | 'explanation' | 'replay_card';
  content: string;          // markdown
  anchors?: string[];       // 段落锚点 id 列表（绑定右栏 comment）
  mentions?: string[];      // @ 引用的 topicId 列表
  createdAt: number;
};

type Comment = {
  id: string;
  topicId: string;
  anchorId: string | null;  // 绑定的 message 段落锚点
  type: 'note' | 'explanation' | 'atomic' | 'reference' | 'open_question';
  content: string;
  // type === 'atomic'
  atomicData?: {
    who: string;
    what: string;
    when: string;             // ISO date
    deliverable: string;
    isComplete: boolean;
  };
  // type === 'open_question'（卡点 / stuck point）
  openQuestionData?: {
    question: string;         // 悬而未决的问题
    blockedReason?: string;   // 卡住原因（缺数据 / 缺判断 / 缺共识 ...）
    resolvedAt?: number;      // 解决时间（null = 仍未解决）
  };
  createdAt: number;
};

type ThinkingSession = {    // 一次连续的思考会话
  id: string;
  topicId: string;
  startedAt: number;
  endedAt: number;
  messageCount: number;
  aiRecap?: string;         // 会话结束时 AI 生成的小结
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

// === 专家组协议（§3.14） ===

type PersonaTemplate = {        // 人格库（系统预置 + 远期社区贡献）
  id: string;
  domain: string[];             // 适用领域，如 ['m&a', 'market-entry']
  role: 'proposer' | 'critic' | 'practitioner' | 'constraint' | 'user_proxy';
  displayName: string;          // "资深 M&A 律师 · Anna"
  systemPrompt: string;
  frameworks: string[];         // 擅长框架
  evalScore?: number;           // 盲评基线，可证伪
};

type ExpertAgent = {            // Panel 中的一员（基于模板实例化）
  id: string;
  personaTemplateId: string;
  displayName: string;
  role: PersonaTemplate['role'];
  systemPrompt: string;         // 可能基于模板做了上下文注入
};

type PanelExchange = {          // 一位专家在一轮里的发言
  agentId: string;
  content: string;
  citations?: string[];         // 引用数据/资料（远期 RAG）
  createdAt: number;
};

type PanelRound = {
  roundNumber: 1 | 2 | 3 | 4 | 5;
  type: 'initial' | 'critique' | 'refined' | 'synthesis';
  exchanges: PanelExchange[];
  // 收敛判官原始分数（0.0–1.0），用于事后调参 / A-B 对比线性 vs 非线性曲线
  convergenceScore?: number;     // pairwise embedding similarity mean
  marginalScore?: number;        // Haiku-as-judge 对本轮 vs 上轮综合的改进评分（N ≥ 2 才有）
  stopSignalsHit?: ('semantic_convergence' | 'marginal_decay' | 'marginal_ratio' | 'max_rounds')[];
};

type LocalMaximumResult = {
  consensus: string[];           // 共识点
  divergence: { point: string; conditions: string }[]; // 分歧点 + 前提
  openQuestions: string[];       // 未解问题（自动落到 open_question 卡点）
  bestAnswer: string;
  confidence: number;            // 0-1
  acceptedByUser: boolean;
  acceptedAt?: number;
};

type ExpertPanel = {
  id: string;
  topicId: string;               // 挂在哪个方向 Topic 上
  domain: string;
  members: ExpertAgent[];
  status: 'forming' | 'debating' | 'converged' | 'rejected_by_user';
  rounds: PanelRound[];
  localMaximum?: LocalMaximumResult;
  createdAt: number;
  updatedAt: number;
};

// === 思考快照索引（§3.15） ===

type DirectionSnapshot = {       // 一个方向的浓缩
  direction: string;
  domain: string;
  localMaximum: LocalMaximumResult;
};

type ThinkingSnapshot = {
  id: string;
  sourceTopicId: string;         // 来源 Topic
  questionEmbedding: number[];   // Gemini Embedding 2，默认 768 维
  domains: string[];             // 领域标签
  qualityScore: number;          // 综合质量分（来自评分系统）
  freshnessDate: number;         // 信息时效基准
  visibility: 'private' | 'team' | 'public_anonymous';
  payload: {
    question: string;
    directions: DirectionSnapshot[];
    finalDecision?: string;
    panelTranscriptsRef?: string; // Supabase Storage 路径，可选
  };
  contextMeta: {                 // 用于适配匹配
    industry?: string;
    companySizeRange?: string;
    timeContext?: string;        // 如 "2024 高利率环境"
    decisionScale?: 'tactical' | 'strategic';
  };
  reuseStats: {
    reusedCount: number;
    averageReuseRating: number;
    downvoteCount: number;
  };
  sourceUserHash?: string;       // 不可逆匿名哈希
  createdAt: number;
};

type SnapshotReuse = {           // 一次复用事件，反哺质量
  id: string;
  snapshotId: string;
  newTopicId: string;
  mode: 'as_is' | 'fork_adapt' | 'inspiration_only';
  reuseRating?: number;          // 1-5
  reuseFeedback?: string;
  createdAt: number;
};

// === CBR 流水线（§3.16） ===

type AbstractedCase = {
  id: string;
  sourceTopicId: string;
  problemSignature: {            // 文本化后 embed → problemEmb
    domain: string;
    decisionType: 'go_no_go' | 'allocation' | 'sequencing' | 'tradeoff';
    keyDimensions: string[];
    constraints: string[];
  };
  reasoningPath: {
    frameworks: string[];
    keyQuestions: string[];
    pivotalDecisions: string[];
  };
  solutionPattern: {             // 文本化后 embed → solutionEmb
    structure: string;
    keyLevers: string[];
    riskMitigations: string[];
  };
  outcome: {
    qualityScore: number;        // 0–1
    userFeedback?: string;
  };
  problemEmb: number[];          // 768 维（Gemini Embedding 2）
  solutionEmb: number[];         // 768 维
  visibility: 'private' | 'team' | 'public_anonymous';
  freshnessDate: number;
  createdAt: number;
};

type CaseRelation = {            // 简化 GraphRAG（§3.18），不用图数据库
  id: string;
  sourceCaseId: string;
  targetCaseId: string;
  relationType: 'shares_framework' | 'shares_domain' | 'contrasts'
              | 'composed_from' | 'caused_by';
  weight: number;                // 0–1
  createdAt: number;
};

// type AtomicReasoningMove —— 见 §3.17，V3 远期，V1 不实现
```

**关键设计**：
- `aiSummary` 单独存储，避免 @ 引用时拉全文。
- `reasoningTrace` 是思路复现的核心：AI 在每次会话后增量更新它，记录"推理走到哪一步、为什么"。
- `ThinkingSession` 支撑"思考时间线"和"上次回顾"卡片；消息通过 `sessionId` 归属会话。
- `anchors` 用于实现"虚线锚定"——message 段落和 comment 通过 anchorId 绑定。
- 全局 Todo = 所有 `Comment.type === 'atomic'` 的并集；全局卡点清单 = 所有 `type === 'open_question'` 且未 resolved 的并集，均跨 topic 聚合。
- "上次回顾"卡片 = 一条特殊 Message（`type === 'replay_card'`），插在对话顶部。
- `ExpertPanel.localMaximum.bestAnswer` 收敛后会同步写入该方向 Topic 的 `aiSummary`；transcript 摘要写入 `reasoningTrace`。
- `LocalMaximumResult.openQuestions` 自动转为 `Comment.type='open_question'`，与卡点系统统一聚合到全局清单。
- `ThinkingSnapshot` 由「快照策展员」从已 `localMaximum` 的 Topic 抽取生成；脱敏经用户确认才入库。
- 检索路径：用户提问 → `questionEmbedding` 余弦相似 + `qualityScore × exp(-age/τ)` 重排 → Top-3 候选。
- **永不 replay**：所有复用必经「复用适配员」分析新旧语境差异，输出 fork-adapt 建议。

---

## 6. 技术选型

> **2026 选型校准说明**：此版本基于 2026 年 5 月的技术现状重新校准。所有版本号、benchmark、价格信息均为最新；过时的旧推荐（如 React 18、Tauri 2.0、Tailwind v3、OpenAI Embedding）已替换。

### 6.1 平台策略
| 平台 | 选型 | 理由 |
|---|---|---|
| 桌面 | **Tauri 2.11+** (Rust + WebView) | 当前最新版（2026.4.30 发布）。比 Electron 体积小 10x、内存少 50%；Rust 安全沙箱；新版加强了权限/能力系统 |
| 移动 | **React Native + Expo SDK 52+** | 共享 TS 业务逻辑；Expo Router 文件路由；生态成熟 |
| 共享层 | TypeScript Monorepo (pnpm + Turborepo 2.x) | 桌面/移动共享数据模型、AI 客户端、同步引擎 |

> **2026 已考虑过的备选方案**：
> - Tauri 2.x 现在已**原生支持 iOS/Android**，理论上"一份 Tauri 跑全平台"。但移动端依然走 WebView，性能（尤其网络图渲染）不如 RN 原生组件，且 RN 移动生态（语音、相机、推送）成熟得多。决定仍走 Tauri（桌面）+ RN（移动）。
> - **Flutter / Kotlin Multiplatform / .NET MAUI** 都已排除：网络图渲染生态弱于 Web，且现有 TS 业务代码无法跨复用。

### 6.2 前端核心
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

### 6.3 后端 / 持久化
| 模块 | 选型 | 理由 |
|---|---|---|
| 本地存储 | **SQLite** (Tauri SQL Plugin / expo-sqlite) | 离线优先；查询快；事务保证 |
| 云端 | **Supabase** (Postgres + Auth + Realtime + Storage + pgvector) | 一站式 BaaS；免运维；pgvector 原生支持向量搜索；Pro $25/月起 |
| 同步 | **Yjs 13** (CRDT) over **WebSocket**（V1 默认）/ **Loro**（性能瓶颈时迁移）| Yjs 生态最成熟、React 绑定完善（SyncedStore）；Loro 是 2025+ 的 Rust 新秀，rich-text/movable-tree 性能更优，未来可平滑迁移 |
| 向量搜索 | **pgvector** + **Gemini Embedding 2**（768 维默认 / 3072 维高精度，MRL）| 多模态原生（文本+图+视频+音频+PDF）；MTEB 多语言榜首（69.9）；为 V2 多模态附件搜索铺路 |
| 文件存储 | Supabase Storage | 附件、导出文件 |

> **为什么不选 Convex / Firebase**：Convex 的"实时优先"模型确实诱人（2024 开源、2025 支持自托管），但**没有 pgvector** —— nodx 强依赖向量搜索做跨支语义关联，所以 Supabase 仍胜出。Firebase 是 NoSQL（Firestore），无法用 SQL 做复杂层级查询，且无自托管选项，vendor lock-in 严重。

### 6.4 AI 集成
| 用途 | 模型 | 理由 |
|---|---|---|
| 主对话 / 第一性原理追问 / 思路复现 | **Claude Sonnet 4.6** | 推理质量高，上下文长（200k） |
| 即时解释 / 标签生成 | **Claude Haiku 4.5** | 便宜 10x，延迟低（适合 hover 触发） |
| Embedding | **Gemini Embedding 2**（gemini-embedding-2，2026.4.30 GA）| 首个原生多模态嵌入模型；MTEB 多语言榜首（69.9）、英语榜首（68.32）；MRL 可截断维度（3072→1536→768）；$0.20/M tokens（批量 $0.10/M） |
| 调用方式 | 流式输出（SSE） + 工具调用 | 提升 perceived latency |

> **为什么混用 Anthropic + Google**：Claude 在结构化推理（第一性原理拆解、原子化检查、思路复现）上表现最稳；Gemini Embedding 2 的多模态能力对 V2 至关重要（用户附图/PDF 决策场景）。两家都是稳定大厂，依赖风险可控。

**Token 优化策略**：
- @ 引用只取 `aiSummary`（约 200 tokens），不取全文。
- 上下文窗口管理：父对话只取最近 10 条 + AI 总结，子对话单独维护。
- 备注/解释类调用走 Haiku。
- 思路复现优先用 `reasoningTrace`（已浓缩），而非重读全部历史消息。
- 缓存常见解释（PE / PEG / 美林时钟等通用术语）到 Redis。

### 6.5 部署
- 桌面：Tauri 自动更新（Updater）+ GitHub Releases 分发。
- 移动：Expo EAS Build → App Store / TestFlight / 国内应用市场。
- 后端：Supabase Cloud（起步阶段，月成本可控在 $25 内）。
- AI 网关：自建 Cloudflare Workers（鉴权、速率限制、用量统计）。

---

## 7. 系统架构

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
                       │ Gemini Embedding 2     │
                       └────────────────────────┘
```

---

## 8. 关键实现细节

### 8.1 Survey 候选生成（模板兜底 + AI 微调）
```
1. 输入用户问题
2. 用 keyword classifier 判断问题类型（决策类 / 研究类 / 学习类...）
3. 加载对应模板（决策类: 7 个标准维度）
4. 调用 Claude Sonnet：基于用户的具体问题，对模板做个性化改写 + 补 1–2 个新维度
5. 返回 5–7 个候选给用户勾选
```

### 8.2 第一性原理拆解 Prompt
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

### 8.3 原子化检查器
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

### 8.4 网络图渲染（Cytoscape）
- **布局**：根节点用 `preset` 固定中心，其余用 `cose-bilkent`（力导向 + 重力）。
- **折叠子树**：用 cytoscape-expand-collapse 插件，节点带 `+N` 徽章。
- **跨支语义边**：用 `taxi` 边样式 + CSS 动画 dashFlow。
- **卡点标记**：`hasOpenQuestions === true` 的节点显示红色角标。
- **大图性能**：>100 节点时启用 `headless` 模式 + LOD（level of detail）：远距离只显示节点不显示文字。

### 8.5 同步引擎（Yjs）
```
本地写入流程:
  1. UI 改动 → Zustand 更新
  2. Zustand → 写入 Yjs Doc
  3. Yjs 自动持久化到 IndexedDB（桌面）/ AsyncStorage（移动）
  4. WebSocket Provider 同步到 Supabase Realtime
  5. 其他端订阅同一 Doc，实时合并

冲突解决: CRDT 自动处理，无需手动逻辑
```

### 8.6 跨支语义关联（"全局总结"触发）
```
1. 取所有 status === 'summarized' 的 Topic 的 aiSummary（多模态附件也一并 embed）
2. 批量计算 embedding（Gemini Embedding 2 batch API，省 50%）
3. 计算 pairwise cosine similarity
4. 阈值 > 0.75 的对，生成 type='semantic' 的 Edge（isUserConfirmed=false）
5. 网络图上显示紫色虚线 + 闪烁，等用户确认
6. 用户点击"接受"后 isUserConfirmed=true，固化到数据库
```

### 8.7 决策汇报生成
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

### 8.8 思路复现（"上次回顾"卡片生成）
```
触发：用户重新打开一个 lastActivity 距今 > 24h 的 Topic

1. 拉取该 Topic 的：
   - reasoningTrace（已浓缩的推理路径）
   - 所有 ThinkingSession（含每次会话的 aiRecap）
   - 未 resolved 的 open_question（卡点）
2. 拉取该 Topic 上次活跃后、用户其他对话里产生的、与之语义相关的新结论
   （embedding 相似度 > 0.75）
3. 单次 Claude Sonnet 调用，生成"上次回顾"卡片，结构固定四段：
   - 起点：你从什么问题出发
   - 路径：走过的 3–5 步推理（基于 reasoningTrace）
   - 卡点：上次停在哪、卡在什么（基于 open_question）
   - 新进展：期间有无相关新信息（基于第 2 步）
4. 作为一条 type='replay_card' 的 Message 插入对话顶部
5. 卡片末尾附「重新推理」按钮 → 触发苏格拉底追问者带着卡点重新展开

reasoningTrace 维护：每次 ThinkingSession 结束（或用户点「总结」）时，
Claude Haiku 增量更新 reasoningTrace —— 不重写，只追加/修订关键推理步骤。
```

### 8.9 专家组循环（§3.14 协议实现）

```
触发：用户在 Survey 确认某方向时

1. 领域识别（Haiku JSON）
   input : { topicTitle, parentContext }
   output: { domain: string, confidence: number }

2. 人格栈推荐（Sonnet）
   input : { domain, frameworks }
   output: { proposed: ExpertAgent[3..5] }
   → 用户在 UI 编辑 / 确认 / 增删

3. 四轮循环（每轮内 N 个 Panel 成员并行调用 Sonnet）

   Round 1 (initial)
     system = persona.systemPrompt
     user   = 方向问题 + 上下文（不含其他专家发言）
     → PanelExchange[]

   Round 2 (critique)
     user = 自己的 Round 1 + 其他人的 Round 1
     prompt: "你会反驳/补充什么？"

   Round 3 (refined)
     user = 自己的 Round 1+2 + 其他人 Round 2 的质疑
     prompt: "更新你的立场，明确哪些被说服、哪些坚持"

   每轮末尾：收敛判官（混合 Haiku + 阈值逻辑）

     步骤 1：判官只算原始分数，不做阈值比较
       convergence_score = mean(pairwise_embedding_similarity(round_N_positions))
       if N >= 2:
         marginal_score = Haiku-as-judge(round_N_synthesis vs round_(N-1)_synthesis)
       两个分数都落库（PanelRound.convergenceScore / .marginalScore）

     步骤 2：阈值比较在 Orchestrator 做（公式见 §3.14）
       τ = N / R
       T_conv = 0.85 - 0.15 * τ          # 线性递减（分歧平台逻辑）
       T_marg = 0.05                     # 常数经济门槛
       ratio_threshold = 0.4             # 改进腰斩信号

       # ① 语义收敛
       if convergence_score >= T_conv:
         stopSignalsHit += 'semantic_convergence'

       # ② 边际改进经济门槛
       if N >= 2 and marginal_score < T_marg:
         stopSignalsHit += 'marginal_decay'

       # ③ 改进比率检测（N>=3 起）
       if N >= 3:
         prev_marginal = PanelRound[N-1].marginalScore
         if prev_marginal and prev_marginal > 0:
           if (marginal_score / prev_marginal) < ratio_threshold:
             stopSignalsHit += 'marginal_ratio'

       # ④ 硬上限
       if N >= R:
         stopSignalsHit += 'max_rounds'

       任一触发 → 跳到 Round 4

     设计意图：把"打分"和"判停"解耦——判官只产生事实（分数），策略层做决定。
     MVP 跑起来后基于实测数据可以 eval 不同策略：
       - T_conv：线性 vs 常数 vs Feynman 非线性
       - T_marg：常数 vs ρ-拟合的几何级数预测
       - 是否启用比率检测、阈值用 0.4 还是别的
     都不需要重训判官，只改 Orchestrator 的几行。

   Round 4 (synthesis)
     独立 Panel 主持人 Sonnet 调用
     user = 全部 transcript
     输出 LocalMaximumResult JSON

4. 写回数据库
   - ExpertPanel.localMaximum = result
   - ExpertPanel.status       = 'converged'
   - Topic.aiSummary          = bestAnswer
   - Topic.reasoningTrace     = 摘要化 transcript
   - openQuestions            → 自动创建 Comment.type='open_question'

Token 预算（典型）：
  4 专家 × 3 轮 × ~3k tokens + Round 4 综合 ~10k = ~46k Sonnet tokens / 方向
  4 方向并行 ≈ ~180k tokens / 决策
  按 Sonnet 4.6 $3/$15 计 → 约 $1.5–3 / 决策
```

### 8.10 思考快照：写入、检索、复用（§3.15 实现）

**写入路径（触发：Topic.localMaximum 收敛）**

```
1. 快照策展员（Haiku）评估是否入库
   - qualityScore > 阈值
   - 至少 1 个原子动作落地
   - 主持人 confidence > 0.6
   不达标 → 跳过

2. 自动脱敏（Sonnet）
   - 去公司名、人名、内部代号
   - 数字按数量级保留（"亿级"而非"3.7 亿"）
   - 时间相对化（"2024 末高利率周期"而非"2024.12.15"）

3. 用户确认脱敏结果（可手动修改）

4. 默认 visibility = 'private'；用户可改 team / public

5. 算 questionEmbedding（Gemini Embedding 2，768 维）

6. 写入 Supabase + pgvector 索引
```

**检索路径（触发：用户提新问题，Survey 之前）**

```
1. 算新问题 embedding
2. pgvector 召回 Top-50，cosine > 0.7
3. 多维重排：
     score = sim × 0.40
           + qualityScore × 0.25
           + freshness_decay(age) × 0.15
           + contextMatch(industry, size, scale) × 0.20
4. Top-3 候选展示
5. 用户跳过 → 走正常 Survey 流程
   用户选某条 → 进入复用适配
```

**复用适配（Sonnet，独立调用）**

```
输入：
  - 老 Snapshot（question + directions + localMax）
  - 新用户语境（industry / size / time / 问题措辞）

输出 JSON：
{
  similarity: '高度相似' | '部分相似' | '仅启发性',
  keepFrameworks: string[],      // 该保留的思维框架
  rediscussDirections: string[], // 该重新讨论的方向
  contextDifferences: string[],  // 关键语境差异
  recommendedMode: 'as_is' | 'fork_adapt' | 'inspiration_only',
  prefilledSurvey?: string[]     // 若 fork_adapt，预填的 Survey 维度
}

用户确认后：
  - as_is：直接转结论到新 Topic 的 aiSummary
  - fork_adapt：把 rediscussDirections 拉成新 Survey 选项，专家组只跑这些
  - inspiration_only：老快照固定显示在侧栏，新 Topic 完全独立跑
```

**反哺循环**

- 每次复用产生 `SnapshotReuse` 记录
- 复用结束后请求用户评 `reuseRating`
- > 3 星 → `snapshot.reuseStats.reusedCount++`
- ≤ 2 星 → `downvoteCount++`，累计 3 次自动从 public 下架
- private 快照不受社区评分影响，但用户自己可标记"以后别给我推这条"

---

## 9. MVP 范围（V1）

**必须做**：
- ✅ 网络图视图（Cytoscape）
- ✅ 三栏对话页面
- ✅ Survey 卡片（模板兜底版本）
- ✅ 第一性原理追问（Claude Sonnet）
- ✅ 即时解释（Claude Haiku）
- ✅ 五色备注 + 锚定（含卡点）
- ✅ 子对话生成 + 折叠
- ✅ 向上合并（AI 草稿 + 用户编辑）
- ✅ @ 引用（不含反向引用）
- ✅ 草稿区
- ✅ 原子化检查器
- ✅ **卡点标记 + "上次回顾"卡片（思路复现 MVP）**
- ✅ **个人快照检索（思考资产化 V1）**：已完成 Topic 自动入私有索引；新问题先查"我以前怎么想的"
- ✅ **CBR 流水线 V1（§3.16 省钱版）**：抽象 / 索引 / 双路召回 / Heuristic 排序 / Fusion / 适配，每查询期望成本 ~$0.06
- ✅ **简化 GraphRAG（§3.18 V1）**：Postgres 关系表 + 递归 CTE，无图数据库无新服务
- ✅ 决策汇报导出（Markdown 起步）
- ✅ 桌面端（Tauri） + Mac 优先

**V2 / Backlog**：
- **专家组协议 + Local Maximum 判定（§3.14）**
- **人格库系统（系统预置 + 用户自定义专家）**
- **团队快照共享（企业版）+ 公共匿名快照索引 + 策展专家库（§3.15 V2–V4）**
- **Reranker 接入（§3.18，触发条件：P@5 < 0.6）**：Cohere Rerank 3.5 lite → 必要时 BGE-Reranker-v2-m3 自托管
- **CBR-V2：4 路细粒度 embedding + LangGraph 编排**
- **GraphRAG-V2：Postgres + Apache AGE 扩展**（案例库 > 10 万触发）
- **知识库乐高化（§3.17 V3）**：AtomicReasoningMove 抽取 + 重组
- 移动端（React Native）
- 反向引用
- 跨支语义关联自动建议（AI 主动提示引用）
- 思考时间线可视化
- Word / PPT 模板导出
- 多人协作
- 移动端语音便签
- 决策模式之外的"研究模式""学习模式"模板

---

## 10. 里程碑

| 阶段 | 时间 | 产出 |
|---|---|---|
| M0：原型确认 | 已完成 | HTML 交互原型 |
| M1：核心闭环 | 4 周 | 桌面单机版，跑通 Survey → 拆解 → 子对话 → 备注 → 卡点 → 上次回顾 → 决策汇报 |
| M2：AI 打磨 | 2 周 | Prompt 优化，原子检查器准确率 > 85%，思路复现 eval |
| M3：云同步 | 2 周 | Supabase 接入 + Yjs 同步 |
| M4：移动端 | 4 周 | RN 只读版 + 语音便签 |
| M5：公测 | 持续 | 邀请 10 位高管真实使用，迭代 |

---

## 11. 风险与开放问题

| 风险 | 应对 |
|---|---|
| AI 成本（Sonnet 调用频繁） | 严格区分 Sonnet/Haiku；缓存常见解释；@ 引用与思路复现只取浓缩字段 |
| 网络图节点 100+ 性能 | Cytoscape headless + LOD；默认折叠到 2 层 |
| 移动端体验受限 | 移动端定位为"输入终端"（语音便签 + 浏览），编辑能力降级 |
| 第一性原理 Prompt 质量 | 准备 30 个真实决策问题做 eval；定期人工 review AI 输出 |
| "思路复现"卡片质量 | reasoningTrace 需 AI 持续准确维护；"上次回顾"卡片用 eval 集验证"有没有真的帮用户接上思路" |
| Yjs + Supabase 同步可靠性 | M3 阶段做压测；本地 SQLite 始终是 source of truth |
| 竞品 FunBlocks 已有第一性原理 | 死守"AI 陪练 vs 代劳"差异；垂直决策场景 + 思路复现 + 执行落地形成组合护城河 |
| 专家组 echo chamber（专家观点同源） | 协议强制必有"魔鬼代言人"角色；远期混用 Sonnet + Gemini + GPT 增加视角异质性 |
| 专家组 Token 成本爆炸 | 默认 3 人栈，用户按需扩到 5；硬封顶 5 轮；Settings 提供"经济 / 平衡 / 深度"档位 |
| Persona 幻觉（AI 假装专家在编） | 每个声明必须挂"依据"标签；远期接 RAG 接专业文档；盲评分数低于阈值的人格自动停用 |
| 快照决策语境错配（A 公司答案用在 B 公司） | **强制走复用适配员**，禁止 as_is 用在战略级问题；UI 永远标"参考"不标"答案" |
| 快照隐私泄漏 | 三层脱敏（AI + 用户 review + 法务条款）；public 默认关闭、每次显式 opt-in；战略级只允许 private/team |
| 快照回声室（社区级决策同质化）| Top-3 多样性约束；UI 显示"已被参考 N 次"；AI 提示"你的情况可能不同" |
| 快照过时（旧判断用在新环境） | 时效衰减函数 + UI 明显时间戳 + AI 标"这一条可能过时（关键事实变更）" |
| CBR 抽象质量风险（problemSignature 不够好 → 检索召回差） | Sonnet 抽象时强制结构化 JSON 输出；人工抽检前 100 案例；上线 100 query 后做 P@5 eval，<0.6 直接加 Reranker |
| 简化 GraphRAG 性能（递归 CTE 在案例库 > 10 万时卡顿） | 限制 2 跳内；触发条件清晰：扛不住时迁 Apache AGE，仍同栈无新服务 |
| Brain Hub 过度拆解（简单 query 被拆 → 浪费 Haiku 调用 + 重复检索） | Haiku 自己判定"是否简单"，简单则跳过；输出长度 ≤ 3 个 sub_intents 硬限 |

**待你拍板的开放问题**：
1. **首发平台**：Mac 优先 vs Windows 优先 vs 同时？（建议 Mac 优先，目标用户匹配）
2. **AI 模型**：是否锁定 Claude？还是支持用户自己接 OpenAI / DeepSeek / 本地模型？
3. **数据隐私**：决策内容敏感，是否需要"完全本地模式"（不上云、AI 走本地 LLM）？
4. **MVP 是否需要登录**：单机版可以无账号，但失去同步能力；登录会增加上手成本。
5. **代码仓库结构**：单仓 monorepo 还是分仓？建议 monorepo（pnpm workspace + Turborepo）。

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
│   ├── ai/               # Claude / Gemini 客户端 + Prompt 模板
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

**END of PRD v0.8**

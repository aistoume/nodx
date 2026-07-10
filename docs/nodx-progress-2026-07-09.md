# nodx 工作进度报告 · 2026-07-09 ~ 07-10

> 个人存档记录 · 本次工作会话总结
> 记录人：LaoMo + AI（Claude）

---

## 摘要

本次会话围绕 **nodx Lens 浏览器扩展**、**多平台扩张（Safari / Android）** 与 **创业比赛材料** 三条线推进，另外顺手做了一次 **默认模型升级**。核心成果：

- 扩展的「🎨 生成」「🛒 购物」「🔍 搜索」交互重做，radial 菜单升级为**二级节点**，文字选择也接入四向菜单；
- Gemini 出图从"打开网页赌自动填"改为**程序化 API 出图（2×2 四分区）**；
- Safari 加了兼容 guard、Android 搭出**可编译 MVP 骨架**；
- 产出 **路演 PPT / 商业计划书 / 参赛摘要** 三份 PDF（中国国际大学生创新大赛）。

> ⚠️ **重要**：扩展/桌面代码改动仍在 **working tree、未 commit**；Android 骨架**未经真机验证**。07-10 更新：选词四向已 build 验证、全局记录为新代码（typecheck 通过、待再 build 一次）——详见下方 **‹追加更新 2026-07-10›**。

---

## 追加更新（2026-07-10）

> 承接 07-09。本日在扩展侧做了两件事、并厘清了桌面端启动方式。**扩展 `tsc --noEmit` 通过（exit 0）**；改动仍在 working tree，需 `pnpm build` + reload 生效，未 commit。

### A. 选词触发按钮正式改名「nodx」
- 选中文字后浮出的触发按钮，文案从「🔍 解释」改为 **nodx**（`i18n.ts` 的 `triggerLabel`，中英文都改）。
- 点「nodx」弹出与图片模式同构的**四向 radial**：📖 解释（short）/ 📚 深入（deep）/ 🔎 搜索（Google 文字搜）/ 📋 复制。（四向接线 07-09 已完成，本次只把按钮显式命名为品牌名。）
- 用户反馈"选完还是只有 explain"的原因是**旧打包产物没刷新**；rebuild 后已变 nodx（已截图确认）。

### B. 搜索 / 购物 / 生成 → 全局操作记录（侧栏可回看）★本次重点
- **问题**：搜索/购物会开新标签页、生成用完关弹窗，这些操作"用完即消失"，右侧栏留不下痕迹。
- **根因**：侧栏是**按当前标签页 URL 分组**的；搜索/购物**跳到新标签页**（另一个网址），记录若挂在"发起页"名下，在结果页就看不到。
- **解法**：把这类操作改成**全局历史**（不绑定页面）——
  - `highlights.ts` 新增全局 store `nodx.actions`（`addAction` / `listActions` / `deleteAction` / `subscribeActions`，上限 100 条）+ 新类型 `HighlightAction`（`kind`: search/shopping/generate、`label`、`query`、`url`）。
  - `marquee.ts` 新增 `recordAction()`；搜索（Lens / 图片）、购物（Google Shopping / Amazon，带 AI 识别关键词）、生成（自动记录那张 2×2 图）三条链路各落一条记录。
  - `highlights-layer.ts` 对 action 记录**跳过页面黄框**（与 generated 同处理）。
  - `sidepanel.tsx` 顶部新增常驻区「🕘 搜索 / 购物 / 生成记录」：卡片含缩略图 + 类型徽标 + 识别关键词 + **↗ 重新打开**（点缩略图/按钮重开那次搜索或购物；生成卡片点开看图），支持单条删除。**不论当前在哪个页面都能看到。**
- 生成弹窗原「💾 存到侧栏」因已自动记录，改为「📂 在侧栏查看」（直接跳到那条记录）。
- 注：07-09 旧构建里手动存的记录仍按页面分组；07-10 起所有新搜索/购物/生成都进全局历史。

### C. 桌面端 nodx desktop 启动方式（厘清）
- desktop 是 **Tauri 应用**（`@nodx/desktop`，Rust 壳 + Vite 前端）。
- Rust 端 `lib.rs` 的 `setup()` **无条件 spawn 一个内置 axum gateway 于 `127.0.0.1:8787`**（`ai_gateway::spawn(8787,…)`），正是扩展「发到 nodx」POST 的 `/v1/capture-image`。→ **桌面 App 一开着，扩展发送就通**，无需另起 Cloudflare worker。
- **启动**（仓库根目录）：`pnpm install`（如需）→ `pnpm desktop:dev`（= `tauri dev`，开窗口 + 起 8787）。首次编译 Rust 慢，之后秒开。
- **别再同时跑 `pnpm start`**（旧的独立 worker gateway 流程，会和内置的抢 8787 端口）。
- 想要可双击的正式 App：`pnpm desktop:build`（产物在 `apps/desktop/src-tauri/target/release/bundle/`）。
- 参考：`README.md`（第 115 行 `pnpm desktop:dev`）、`docs/inproc-gateway.md`。

### 本日改动文件
`apps/extension/src/`：`shared/highlights.ts`、`shared/i18n.ts`、`content/marquee.ts`、`content/highlights-layer.ts`、`content/content.ts`、`sidepanel/sidepanel.tsx`。`tsc --noEmit` **通过**。

### 本日待办
- [ ] 再 `pnpm build` + reload，验证全局记录区：搜索/购物/生成各留一条、↗ 重新打开、删除、生成自动入库。
- [ ] （可选）全局记录加"清空全部 / 按类型筛选"。
- [ ] 联调 `pnpm desktop:dev` + 扩展「发到 nodx」→ 灵感池落库。

---

## 一、默认模型升级到 Sonnet 5

### 已完成
- **Claude Code 项目默认模型**：`apps/extension`… 实为项目根 `.claude/settings.local.json` 顶层加 `"model": "claude-sonnet-5"`（原 permissions 未动）。
- **应用代码周边升级** Sonnet 4.6 → Sonnet 5（4 处源码）：AI 网关白名单 `workers/ai-gateway`、扩展 `options.tsx` / `settings.ts`、`lens-mac` 模型选项；并删掉带日期的 `claude-sonnet-4-6-20251001` 别名（Sonnet 5 无日期变体）。

### 关键决策 / 注意
- **核心推理 tier 保持 `claude-opus-4-8` 未动**：`packages/ai/src/models.ts` 里的 `sonnet` 这个键，其值在 2026-07-08 已从 sonnet-4-6 升级为 **opus-4-8**（key 名是语义 tier 标签，非模型家族）。本次只升周边、不动核心。
- **潜在隐患（待确认）**：`ai-gateway` 白名单里**没有 `claude-opus-4-8`**。若 desktop 走 API-key 模式经网关调用核心 tier，会被白名单拦截。走 CLI provider 订阅模式则无影响。→ **待办：确认是否需要把 opus-4-8 加进白名单。**

---

## 二、nodx Lens 浏览器扩展（本次重点）

### 2.1 Gemini 程序化出图（替换失效的网页 handoff）
- **问题**：原「生成」是构造 `gemini.google.com/app?q=<prompt>` 打开网页、指望 Gemini 自动填输入框——该机制已失效（URL 带 prompt 但输入框空）。
- **改法**：Sonnet 看截图写 prompt → **直接调 Gemini image API（`gemini-2.5-flash-image` 的 `:generateContent`）** 拿回 `inlineData` base64 → 扩展内显示。
- 涉及：`providers.ts`（新增 `generateGeminiImage`）、`settings.ts`（新增 `imageGen` 配置）、`service-worker.ts`（`GENERATE_IMAGE_FROM_PROMPT` 消息）、`marquee.ts`（generate 流程 + 结果弹窗）、`options.tsx`（图片生成配置区）、`i18n.ts`。
- **架构约束记录**：扩展**直连各家 API**（用户 BYOK），不走 ai-gateway；`callAnthropic` 支持 vision，`callGoogle`/`callOpenAI` 仅文本。Anthropic **不出图**，故出图需**独立的 Google key**（方案 A：Sonnet 写 prompt + Google key 出图）。

### 2.2 2×2 四分区单图
- 用户澄清：**不是渲染 4 张再拼**，而是让 Gemini **一次生成一张 2×2 四象限图**（四风格，含一张产品照）。
- 改 `marquee.ts` 的 generate 分支为单次调用 + 四象限 prompt（左上产品照 / 右上手绘 / 左下 3D / 右下线稿）。实测效果好。

### 2.3 结果弹窗「保存到侧栏」+ 降像素
- `Highlight` 加 `generated?` 标记；`highlights-layer` 的 `drawHighlight`/`renderAll` **跳过 generated**（生成图无页面区域、不画黄框）。
- 生成图统一 **降到最长边 640px**（`downscaleDataUrl`），减小体积、利于存 `chrome.storage`。
- `showImageResultModal` 加「💾 存到侧栏」按钮（存为 generated highlight + 打开侧栏）。

### 2.4 Google Shopping 修复（关键认知修正）
- **根因（几经反复才确认）**：**Google Shopping 只接受文字查询、不接受图片**；`lens.google.com/uploadbyurl?url=` **永远落在 Lens 视觉匹配**，即便是真实商品图也不进购物页。所以"以图搜购物"没有纯 URL 方案。
- **最终方案**：**AI 认图 → 文字搜购物**。Sonnet(Haiku vision)认出商品 → 用关键词打开 `google.com/search?q=…&udm=28`（真购物页）。同款做法接 Amazon（`amazon.com/s?k=`）。
- 用 `about:blank` 先同步开标签页、认完再导航，规避异步后 `window.open` 被当弹窗拦截。

### 2.5 radial 菜单升级为二级节点
- 一级四个节点**全部改为纯图标**（🔍 💡 🛒 🎨），名字改为 hover 提示。
- **🔍 放大镜** → 二级：**📖 解释 / 🔎 搜索**；**🛒 购物** → 二级：**🏷 Shopping / 📦 Amazon**。中心键在二级变「↩ 返回」，子节点带虚线连出。
- 功能接线：搜索 =（有网页原图）Lens 视觉搜 /（无）AI 认图→Google 图片搜(`udm=2`)；Shopping/Amazon = AI 认图→文字搜。
- **去掉**「复制图 + Lens 粘贴」和中间 handoff 弹窗。
- `showRadialMenu` 泛化为接受动作集（`IMAGE_OPTIONS` 默认 / `TEXT_OPTIONS`）。

### 2.6 方向1：文字选择也接入四向菜单
- 选中文字 → 🔍 按钮 → 点击弹 **四向**：**📖 解释（short）/ 📚 深入（deep）/ 🔎 搜索（Google 文字搜）/ 📋 复制**。
- `content.ts` 接线到已有 explain/deepen，`openPanelForNewSelection` 加 mode 参数。

### 扩展改动文件清单（本次涉及）
`packages/ai/src/models.ts`（未动核心，仅注释）、`workers/ai-gateway/src/index.ts`、
`apps/extension/src/`：`shared/providers.ts`、`shared/settings.ts`、`shared/i18n.ts`、
`shared/highlights.ts`、`background/service-worker.ts`、`content/marquee.ts`、
`content/highlights-layer.ts`、`content/handoff-modal.ts`、`content/radial-menu.ts`、
`content/content.ts`、`options/options.tsx`。

### 扩展待办
- [ ] `cd apps/extension && pnpm build` 并**真机加载测试**所有改动（云沙盒因 rollup 跨平台二进制跑不了 vite）。
- [ ] options 里填 **Google AI key**（出图用）；确认出图 / 四分区 / 存侧栏 / Shopping / Amazon 各链路。
- [ ] 若某账号需 `responseModalities` 才出图、或想接 Nano Banana Pro（`gemini-3-pro-image`，走不同端点）再调。
- [ ] 确认 ai-gateway 白名单是否补 `claude-opus-4-8`（见第一节隐患）。
- [ ] 所有改动 **review + commit**（当前仅在 working tree）。

---

## 三、多平台扩张

### 3.1 Safari
- **已做（代码层）**：`service-worker.ts` 三处 `chrome.sidePanel` 调用加 **optional-chaining guard**，让 Safari（无 sidePanel API）下 SW 不报错。typecheck 通过。
- **待办（须在 Mac 上）**：
  - [ ] `pnpm build` → `xcrun safari-web-extension-converter dist --macos-only …` → Xcode Run → Safari 启用（开发菜单允许未签名扩展）。
  - [ ] **侧栏重做**：Safari 无 side panel API，`sidepanel.tsx` 需改为**页内注入抽屉**（方向2 的 M2，真工作量）。
  - [ ] localhost(127.0.0.1:8787 发桌面) 的 ATS 例外、快捷键替代。
  - [ ] Apple Developer 账号 + App Store 审核。

### 3.2 Android（`apps/android/` MVP 骨架）
- **已搭（16 个文件，完整 Gradle 项目）**：悬浮球（`SYSTEM_ALERT_WINDOW`）→ 点击 **MediaProjection 截屏** → **框选 overlay** → **解释**（OkHttp 调 Anthropic vision，BYOK）。
- **关键设计**：用**悬浮球**而非 AccessibilityService 触发——避开 Google Play 对 a11y 的政策红线。
- 文件：`MainActivity.kt`（权限/授权/启动）、`FloatingBubbleService.kt`（前台服务+悬浮球）、`ScreenCaptureManager.kt`（截屏）、`SelectionOverlayView.kt`（框选+AI）、`ai/AnthropicClient.kt`、`Prefs.kt` + Manifest/Gradle/res + README。
- **⚠️ 未编译 / 未真机验证**（本地无 Android SDK）。
- **待办**：
  - [ ] Android Studio 打开 `apps/android`、生成 Gradle Wrapper、调 AGP/Kotlin/SDK 版本、跑通。
  - [ ] 框选后补 **radial 四向菜单**（现在只有单个"解释"），对齐扩展体验。
  - [ ] `POST_NOTIFICATIONS` 运行时请求、结果卡片替代 Toast、Quick Settings 磁贴、后台稳定性。

### 规划文档
- `docs/multiplatform-roadmap.md`：Safari / Android 两方向的技术路径、里程碑、工作量、风险与推荐顺序（结论：**先 Safari 后 Android**）。

---

## 四、创业比赛材料（中国国际大学生创新大赛 2026 · 高教主赛道 · 本科生初创组）

### 已产出三份 PDF（视觉统一：nodx 深色/蓝/琥珀）
1. **路演 PPT**（13 页）—— 直接复用仓库里 `pitch/build-zh.js`，补依赖、改硬编码输出路径后生成。
2. **商业计划书**（14 页）—— 基于 PRD 四大卖点（可积累/不丢失/想得好/想得到）+ 市场数据新写。
3. **参赛项目摘要**（9 页）—— 严格按大赛 **五维度评审框架**组织：商业性 30 / 创新 20 / 团队 20 / 教育(专创融合) 20 / 社会价值 10；商业性写两页。

### 关键数据（存档）
- 市场：决策智能 2025≈$178 亿、2030≈$363 亿、CAGR 15.4%（Grand View Research）。
- 竞品定价：Notion AI $20/席/月、Mem $8–10、Reflect $10；共同短板=不做"结构化思考引导 + 思考资产复用"。
- 融资 Ask：$800K 种子轮 / 18 个月到 PMF（沿用 pitch 口径）。

### 待办（据实补齐 → 直接影响评分/资格）
- [ ] **报名资格确认**：初创组要求**公司已工商注册（未满 3 年）+ 负责人为法定代表人 + 股权达标**。若未注册，要么先注册、要么改报**创意组**。
- [ ] 补真实：注册主体全称/信用代码、股权结构、用户/营收数据、团队成员背景、知识产权、就业带动、财务假设（材料里已用红色 `[待替换]` 标出）。
- [ ] 可选：英文版（pitch 有 `build-en.js`，BP/摘要可翻译）。

---

## 五、总的下一步 TODO（按优先级）

1. **扩展再 build + 全链路真机测试**：重点验证 07-10 的**全局操作记录**（搜索/购物/生成各留一条、↗ 重新打开、删除）+ 07-09 的出图/四分区/Shopping/Amazon/选词四向。通过后 **commit**。
2. **比赛材料补真实信息 + 确认初创组注册资格**（有截止时间压力）。
3. **桌面端联调**：`pnpm desktop:dev` 起来，扩展「发到 nodx」→ 灵感池落库走通。
4. **Safari**：Mac 上跑通 MVP 看效果 → 评估侧栏重做投入。
5. **Android**：Studio 跑通骨架 → 补 radial 四向菜单。
6. 决策：ai-gateway 白名单是否补 `claude-opus-4-8`。

---

## 附：关键技术决策 / 认知（备忘）

- **核心 tier ≠ Sonnet**：`models.ts` 的 `sonnet` 键当前值是 `claude-opus-4-8`；升级"周边"不等于升级核心。
- **Anthropic 不出图**：出图必须借 Google/OpenAI，扩展需独立 image key。
- **Gemini 出图**：`gemini-2.5-flash-image` + `:generateContent`，图在 `candidates[0].content.parts[].inlineData.data`；无需 responseModalities（image 专用模型）。
- **Google 以图搜购物无纯 URL 方案**：`uploadbyurl` 永远落 Lens 视觉匹配；到 Shopping 必须"AI 认图→文字查询→`udm=28`"。
- **Safari 无 side panel API**：侧栏是移植的主要工作量。
- **Android 触发避坑**：悬浮球 / 磁贴替代"长按任意处"，绕开 Play 的 a11y 政策。
- **环境边界**：本地 `device_bash` 是 Linux 无网、无 Android SDK；Safari 转换 + 扩展 build（rollup 原生二进制）+ Android 编译都**须在你自己的机器上**完成。

---

*报告结束 · 更新至 2026-07-10*

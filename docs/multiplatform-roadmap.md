# nodx Lens 多平台扩展规划（方向 2 / 3）

> 承接方向 1（**选中文字 → 四向 radial 菜单**，已实现并 typecheck 通过）。
> 本文规划另外两个方向：**Safari 插件** 与 **Android app**。
> 状态：规划稿 v1（Claude 调研整理，关键决策待 LaoMo 拍板）。日期：2026-07-09。

---

## 0. 现状基线（从这里出发）

现在的形态是一个 **Chrome MV3 扩展**（`apps/extension`，nodx Lens）。核心能力：

- 选中文字 / 框选区域 → **radial 菜单**（放大镜→解释/搜索、保存、购物→Shopping/Amazon、生成）
- 结果落到**侧栏卡片**（side panel），可继续问 Sonnet，可选发送到 nodx 桌面
- 直连各家 API（Anthropic / Gemini），不走中间服务器

**关键 `chrome.*` 依赖**（决定移植难度）：

| API | 用途 | 跨平台风险 |
|---|---|---|
| `sidePanel` | 侧栏卡片（核心 UI） | Safari ❌ 无此 API；Android 无浏览器概念 |
| `tabs.captureVisibleTab` | 截图 | Safari ⚠️ 有限；Android 用 MediaProjection |
| `runtime.connect`/`Port` | 流式解释 | Safari ✅ / Android 自己实现 |
| `scripting` / `storage.local` | 注入 / 存储 | 基本 ✅ |
| `commands` | Alt+Shift+S 快捷键 | Safari ⚠️ 弱 |
| host `127.0.0.1:8787` | 发桌面 | Safari/Android 都要另验证 |

---

## 方向 2：Safari 插件

### 价值
覆盖 Mac / iOS 的 Safari 用户；**iOS 上浏览器扩展只能走 Safari**，这是触达 iPhone 的唯一入口。

### 技术路径
1. Safari 支持标准 **WebExtensions**（`browser` / `chrome` 命名空间都兼容），用 Apple 的 `xcrun safari-web-extension-converter` 把现有扩展**一键转成 Xcode 项目**（可同时出 macOS + iOS target）。
2. 大部分逻辑可直接复用：content script、marquee 截图、radial 菜单、AI 调用、options 页。

### 必须改的（按工作量排序）
1. **侧栏要重做（最大的一块）**：Safari **没有 side panel / sidebar API**（MDN 明确：Chrome 用 `side_panel`、Firefox 用 `sidebar_action`，Safari 两者都不支持）。`sidepanel.tsx` 那套需要改成**页内注入面板**——在 content script 里挂一个 Shadow DOM 的侧边抽屉/浮层，把 highlights 卡片渲染迁过去。逻辑能搬，容器要换。
2. **快捷键**：`chrome.commands` 在 Safari 支持弱，`Alt+Shift+S` 截图可能要改成工具栏按钮 / 页内触发。
3. **发桌面**：`127.0.0.1:8787` 在 Safari 下受 App Transport Security 约束，需要在 app 层加 localhost 例外并实测。
4. **打包 + 审核**：Safari 扩展必须**包进一个 macOS/iOS 宿主 app 上架 App Store**——需要 Apple Developer 账号（$99/年）+ 隐私审核（要如实声明截图 / 剪贴板 / 网络请求用途）。

### 里程碑（粗估）
- **M1**（~1 周）converter 转换 + content/marquee/radial 在 Safari 跑通
- **M2**（~1–2 周）页内注入侧栏，替代 `sidePanel`，highlights 迁移
- **M3**（~1 周）快捷键 / localhost / 权限打磨，Xcode 打包，TestFlight
- **M4**（~0.5–1 周 + 审核等待）上架
- **合计 ~4–5 周 + 审核周期**

### 风险
- 侧栏重做是**真工作量**，不是纯移植。
- iOS 触屏要重新适配 marquee 框选 + overlay 交互（鼠标 → 手指）。
- App Store 对"截图 + 联网"类应用可能追问隐私。

---

## 方向 3：Android app

### 价值
系统级「**长按 → 框选 → 菜单**」，不限于浏览器——**任何 app 的屏幕都能用**。这是扩展做不到的差异化，也是最"杀手级"的形态。

### 技术路径
- 基本是**全新原生 app（Kotlin）**，和浏览器扩展**几乎不共享代码**（系统集成、UI 完全不同；只有 AI 调用的 prompt / 契约可参考）。
- 截屏：**MediaProjection API**。
- 框选 + radial 菜单：**SYSTEM_ALERT_WINDOW** 悬浮窗上用 Compose/Canvas 画。
- AI：同样直连 Anthropic / Gemini（OkHttp）。
- 结果：app 内页面或 overlay 卡片。

### 关键挑战（**合规是头号风险**）
1. **「长按屏幕任意处」触发 ⚠️ 红线**：监听任意位置的全局长按需要 **AccessibilityService**，而 **Google Play 对 a11y 政策极严**——只允许真正的无障碍用途，"截图工具借 a11y 做全局手势"大概率被拒审 / 下架。
   - **合规替代**：**悬浮球**（overlay 上的可拖动按钮）、**Quick Settings 磁贴**、通知栏按钮、或系统**分享菜单**（"分享到 nodx"）。建议放弃"任意长按"，改"点悬浮球/磁贴"触发截屏。
2. **截屏授权**：MediaProjection 每会话弹一次系统授权；`FLAG_SECURE` 的页面（银行 / DRM 视频）截不了。
3. **后台常驻**：需 **Foreground Service** + 常驻通知；2026 的 FGS 政策要求声明服务类型 + 正当用途，并要引导用户**关掉电池优化**才能稳定常驻。
4. **悬浮窗权限**：`SYSTEM_ALERT_WINDOW` 要用户手动授予。

### 里程碑（粗估）
- **M1**（~2–3 周）悬浮球 + MediaProjection 截屏 + 框选 overlay
- **M2**（~2 周）radial 菜单 + AI 接线（解释 / 搜索 / 购物 / 生成）
- **M3**（~1–2 周）结果展示（卡片 / 侧栏）+ 设置 / API key
- **M4**（~1–2 周）后台常驻 + 权限引导 + 合规打磨
- **合计 ~7–9 周**，且上架有政策不确定性

### 风险
- **Play 政策**：a11y 全局触发是红线，必须用悬浮球/磁贴替代"任意长按"。
- 后台常驻 + 电池优化：稳定性受系统限制。
- 代码几乎不复用扩展 —— **等于开一条新产品线**。

---

## 推荐顺序 / 结论

1. **先做 Safari（方向 2）**：复用度高（业务逻辑基本能搬），主要成本是**侧栏重做 + Apple 打包审核**；能较快把现有产品覆盖到 Mac / iOS Safari，性价比最高。
2. **Android（方向 3）放后**：工作量最大、代码不复用、且撞 Play 政策；**先把"长按任意处"降级成"悬浮球/磁贴触发"的合规方案**，再评估是否值得 ~2 个月投入。

一句话选型：
- 想**快速多覆盖一个平台** → Safari。
- 想要**系统级随处可用的杀手交互** → Android，但要接受它是独立新 app + 政策风险 + ~2 个月。

---

## 待你拍板

- **Safari**：愿意开 Apple Developer 账号 + 走 App Store 审核吗？侧栏用"页内注入抽屉"替代 side panel 可以接受吗？
- **Android**：接受用「悬浮球 / 磁贴」替代「任意长按」来合规吗？要不要先做一个最小 MVP（悬浮球 + 截屏 + 框选 + 解释）验证手感和政策，再决定继续？

---

## 参考
- MDN — [Chrome incompatibilities（WebExtensions）](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities)
- Apple — [Safari Web Extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions)
- Android — [Media projection](https://developer.android.com/media/grow/media-projection)
- Google Play — [AccessibilityService API 政策](https://support.google.com/googleplay/android-developer/answer/10964491)
- Google Play — [前台服务要求](https://support.google.com/googleplay/android-developer/answer/13392821)

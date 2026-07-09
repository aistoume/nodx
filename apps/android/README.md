# nodx Android — 悬浮球 MVP 骨架

> ⚠️ **未经真机 / 编译验证的骨架**。我（Claude）这边没有 Android SDK，无法编译。
> 在 Android Studio 打开后，可能需要调 Gradle/AGP/Kotlin 版本与个别 import。

## 这是什么

系统级的"长按替代方案"——**不用 AccessibilityService**（避开 Google Play 政策红线），
改用 **悬浮球 + MediaProjection**：

悬浮球 → 点它截屏 → 在截图上框选任意区域 → **解释**（Sonnet/Haiku vision）。

## 跑起来

1. Android Studio「Open」选择 `apps/android`（作为独立项目打开）
2. 若提示缺 Gradle Wrapper：让 Studio 生成，或终端 `cd apps/android && gradle wrapper`（需本机装 gradle）
3. Sync 后 Run 到真机 / 模拟器（Android 8.0 · API 26+）
4. 首屏填入 **Anthropic API key** → 点「启动 nodx 悬浮球」
5. 依次授权：① 显示在其他应用上层 ② 屏幕录制
6. 悬浮球出现 → 点它 → 框选 → 解释结果以 Toast 弹出

## 权限

| 权限 | 用途 |
|---|---|
| `SYSTEM_ALERT_WINDOW` | 悬浮球 + 全屏框选 overlay |
| `FOREGROUND_SERVICE(_MEDIA_PROJECTION)` | 常驻前台服务持有投屏 |
| `INTERNET` | 调 Anthropic |
| `POST_NOTIFICATIONS` | 前台服务通知（Android 13+ 需运行时请求，MVP 暂未做） |

## 文件

| 文件 | 职责 |
|---|---|
| `MainActivity.kt` | 权限/投屏授权、启动服务、API key 输入 |
| `FloatingBubbleService.kt` | 前台服务 + 可拖动悬浮球 + 点击触发截屏 |
| `ScreenCaptureManager.kt` | MediaProjection + ImageReader 截一帧为 Bitmap |
| `SelectionOverlayView.kt` | 全屏框选 + 裁剪 + 调 AI（当前单个"解释"动作） |
| `ai/AnthropicClient.kt` | OkHttp 调 Anthropic Messages（vision），对齐浏览器扩展 |
| `Prefs.kt` | SharedPreferences 存 BYOK key |

## MVP 范围 & 下一步

**已搭**：悬浮球、MediaProjection 截屏、框选、单个「解释」动作、BYOK。

**下一步**（对齐浏览器扩展体验）：
- 框选后弹 **radial 四向菜单**（解释 / 搜索 / 购物 / 生成）
- 结果用卡片 / overlay 面板替代 Toast；历史记录
- `POST_NOTIFICATIONS` 运行时请求（Android 13+）
- **Quick Settings 磁贴**作为第二触发入口
- 后台常驻稳定性 + 电池优化引导

## 已知坑（在 Studio 里处理）

- 需生成 Gradle Wrapper；AGP/Kotlin/SDK 版本按你的 Studio 调
- Android 14+ 对 MediaProjection 前台服务时序更严——本骨架已按「先 `startForeground(mediaProjection)` 再 `getMediaProjection`」处理
- 截屏大图内存未做缩放/回收优化（MVP）
- 与浏览器扩展、桌面端**不共享代码**，仅共享 AI 调用契约（prompt / 模型）

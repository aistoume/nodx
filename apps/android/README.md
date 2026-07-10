# nodx Android — 悬浮球 + 动作轮

系统级的"长按替代方案"——**不用 AccessibilityService**（避开 Google Play 政策红线），
改用 **悬浮球 + MediaProjection**：

悬浮球 → 点它截屏 → 在截图上框选任意区域 → **radial 动作轮**（对齐浏览器扩展 Lens 0.9）：

```
    上 = 🔍 → 📖 解释 / 🔎 搜索        （二级展开）
    右 = 💡 保存（存入相册 Pictures/nodx）
    下 = 🛒 → 🏷 Shopping / 📦 Amazon  （二级展开）
    左 = 🎨 生成（暂未接入，需 Gemini key）
```

- **解释**：Haiku vision「这是什么」→ Toast（结果卡片待做）
- **搜索 / 购物**：Haiku 认图出 query（与扩展同款 prompt）→ 开浏览器
  `google.com/search?udm=2|28` / `amazon.com/s?k=`
- **保存**：裁剪图直接进相册（移动端等价于扩展的「存入 nodx 灵感池」）
- 中心按钮：一级 ✕ 取消 / 二级 ↩ 返回；点空白处取消

## 构建（已验证 ✅ 2026-07-09）

版本组合：**AGP 8.7.3 + Kotlin 2.0.21 + Gradle 8.9 + compileSdk/targetSdk 35 + minSdk 26**，
JDK 用 Android Studio 自带 JBR（Java 21）。

```bash
cd apps/android
# local.properties 写 sdk.dir（首次）：
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

或 Android Studio「Open」选 `apps/android` 直接 Run。

## 跑起来

1. Run 到真机 / 模拟器（Android 8.0 · API 26+）
2. 首屏填入 **Anthropic API key** → 点「启动 nodx 悬浮球」
3. 依次授权：① 通知（13+）② 显示在其他应用上层 ③ 屏幕录制
4. 悬浮球出现 → 点它 → 框选 → 动作轮

## 权限

| 权限 | 用途 |
|---|---|
| `SYSTEM_ALERT_WINDOW` | 悬浮球 + 全屏框选 overlay（也豁免后台开 Activity，用于跳浏览器） |
| `FOREGROUND_SERVICE(_MEDIA_PROJECTION)` | 常驻前台服务持有投屏 |
| `INTERNET` | 调 Anthropic |
| `POST_NOTIFICATIONS` | 前台服务通知（Android 13+，MainActivity 启动时运行时请求） |

## 文件

| 文件 | 职责 |
|---|---|
| `MainActivity.kt` | 权限/投屏授权、启动服务、API key 输入 |
| `FloatingBubbleService.kt` | 前台服务 + 可拖动悬浮球 + 点击触发截屏 |
| `ScreenCaptureManager.kt` | MediaProjection + ImageReader 截一帧为 Bitmap |
| `SelectionOverlayView.kt` | 全屏框选 → 弹动作轮 → 分发动作（SELECT/MENU 状态机） |
| `RadialMenu.kt` | 动作轮纯 Canvas 实现（布局/配色/二级展开对齐扩展 radial-menu.ts） |
| `Actions.kt` | 六个动作的执行器（AI 调用 / MediaStore 存图 / 开浏览器） |
| `ai/AnthropicClient.kt` | OkHttp 调 Anthropic Messages（vision）：explain + identify |
| `Prefs.kt` | SharedPreferences 存 BYOK key |

## 下一步

- 结果用卡片 / overlay 面板替代 Toast；历史记录（对齐扩展侧栏）
- 🎨 生成接入（需第二个 BYOK：Gemini 图像模型）
- **Quick Settings 磁贴**作为第二触发入口
- 后台常驻稳定性 + 电池优化引导
- 截屏大图内存缩放/回收优化

## 已知设计约束

- Android 14+ 对 MediaProjection 前台服务时序更严——已按「先
  `startForeground(mediaProjection)` 再 `getMediaProjection`」处理
- 框选 overlay 用 `FLAG_LAYOUT_IN_SCREEN|FLAG_LAYOUT_NO_LIMITS` 铺满全屏，
  保证 view 坐标与 real-metrics 截图 1:1 对齐
- 与浏览器扩展、桌面端**不共享代码**，仅共享 AI 调用契约（prompt / 模型 /
  搜索 URL 模式）

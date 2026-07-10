# 图片捕获（Lens marquee → nodx 灵感池）

> 桌面 **0.5.0** + 扩展 **0.6.0**。M1：Chrome 框选任意区域 → 发到桌面灵感池。M2：Sonnet vision 解释这张图。

---

## 1. 架构

```
┌─────────────────────────────────────────────────────────────────┐
│ Chrome tab                                                       │
│  ─ user clicks Lens icon → popup "📸 Screenshot region → nodx"   │
│  ─ service-worker: chrome.tabs.captureVisibleTab (PNG dataURL)   │
│  ─ content-script (marquee.ts): overlay + crosshair marquee      │
│  ─ crop via <canvas>                                             │
│  ─ POST http://127.0.0.1:8787/v1/capture-image                   │
└──────────────────────────────┬───────────────────────────────────┘
                               │ JSON { imageBase64, meta }
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ nodx desktop (Tauri, macOS)                                      │
│  ─ axum handler /v1/capture-image                                │
│  ─ base64 decode + write to                                      │
│    ~/Library/Application Support/app.nodx.desktop/media/{id}.png │
│  ─ emit Tauri event `nodx://capture` (image payload)             │
│  ─ App.tsx listener → upsertCaptured(...) → SQLite               │
│  ─ Migration v14: attentions.image_path + image_mime + w + h     │
│  ─ AttentionInboxView renders image card (asset:// URL)          │
│  ─ "✨ AI 解释" button on image card → explainImage(imagePath)   │
│    → Rust `read_media_file` command (base64 + MIME)              │
│    → gateway POST /v1/complete with image content block          │
│    → Sonnet vision returns explanation                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 端到端手验清单

需要一台装了 Xcode + Rust + Chrome 的 Mac。

### 2.1 桌面

```
# 从仓库根目录
cd apps/desktop
pnpm install                     # 头一次装依赖
pnpm tauri dev                   # dev build 起来
```

第一次跑会：

- 编译 Rust（首次 ~5 分钟，之后增量 <30s）
- 应用会自动跑 migration v14（`attentions` 加 4 列）
- 在 App Support 里创建 `media/` 目录

### 2.2 扩展

```
cd apps/extension
pnpm install
pnpm build                       # 产 dist/
```

Chrome：`chrome://extensions/` → 打开开发者模式 → 载入已解压的 `apps/extension/dist/`。

### 2.3 试一发

1. 打开任意网页
2. 点扩展工具栏的 nodx Lens 图标
3. 弹出的 popup 里点 **📸 Screenshot region → nodx**
4. 弹窗自动关闭，网页上进入截图模式（十字光标）
5. 拖一个矩形 → 松鼠标
6. 右下角应弹 "Sent to nodx ✓" toast
7. 切到 nodx 桌面 App → 灵感池 → 出现新的图片卡片
8. 卡片上点 **✨ AI 解释** → 30 秒后灵感卡下方出现 Sonnet 生成的图片描述

### 2.4 常见失败

| 现象                                                                             | 排查                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toast 弹 `nodx desktop isn't running…`                                           | nodx 桌面没起，或者不是 in-proc gateway 模式（CLI 模式下 :8787 也在跑，应该没问题）。先 `curl http://127.0.0.1:8787/health` 确认 gateway 活着。                                                                                                                                                                              |
| 灵感池里图片卡片显示不出图，只有文件名                                           | `asset://` 协议未开或 scope 不匹配。检查 `tauri.conf.json` 里 `security.assetProtocol.enable === true`，`scope` 包含 `$HOME/Library/Application Support/app.nodx.desktop/media/**`。                                                                                                                                        |
| 点 ✨ AI 解释报 "路径超出媒体目录"                                               | `read_media_file` 有反越界检查；如果 imagePath 是外部路径（不是 media/ 下），会拒。检查 `attentions.image_path` 是否是 canonicalised 的 `media/xxx.png` 路径。                                                                                                                                                              |
| Chrome 扩展提示 `Cannot connect to 127.0.0.1`                                    | 检查 manifest 的 host_permissions 里是否有 `http://127.0.0.1:8787/*`。0.6.0 已经加了。                                                                                                                                                                                                                                      |
| service-worker 报 `Cannot read 'devicePixelRatio' of undefined`                  | 我已经把 DPR 读移到 content script 了，如果扩展是从旧代码打的 dist，重新 `pnpm build`。                                                                                                                                                                                                                                     |

### 2.5 打包正式版

```
# 桌面 dmg
cd apps/desktop
pnpm tauri build

# 扩展 zip（送 CWS）
cd apps/extension
pnpm build
cd dist && zip -r ../nodx-lens-0.6.0.zip . && cd ..
```

---

## 3. 存储与隐私

- 图片字节 **只写在本地**：`~/Library/Application Support/app.nodx.desktop/media/{uuid}.png`
- DB 只存路径，不存 base64（图片 10MB DB 也不会膨胀）
- `.nodx` 数据包导出会打包 media 目录（TODO：见 §4）
- AI 解释请求：图片 base64 直接从桌面发到 `api.anthropic.com`；不经过任何 nodx 服务器
- Chrome 扩展 → nodx desktop 的 POST 是 `127.0.0.1` 环回，永不出网

---

## 4. 未完事项 / TODO

- [ ] `.nodx` bundle 导出需要把 media 目录一起打进去（现在只导 DB 行，media 文件会留在原机器）
- [ ] Lens 里加"复制到剪贴板 / 下载"选项（现在只有"发到 nodx"）
- [ ] 图片卡上加"综合到某话题"入口，配合 SynthesisModal 让图片也进思考文档
- [ ] Windows 支持：`read_media_file` 已经有 Windows 分支，但没真机测过
- [ ] 快捷键 `Alt+Shift+S` 一步进截图模式（现在必须点 popup）—— 加 `commands` manifest 项即可

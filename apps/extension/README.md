# nodx Lens — Chrome Extension

Inline AI explanations on any webpage. Select text, click "🔍 解释", get a 50-150 word explanation in a floating panel. Use your own Anthropic / OpenAI / Google API key.

See [`PRD.md`](./PRD.md) for full design.

## Development

```bash
pnpm install
pnpm --filter @nodx/extension dev
```

Then in Chrome:

1. Open `chrome://extensions/`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**, choose `apps/extension/dist/`
4. Pin the extension to the toolbar
5. Click the icon → **⚙ Settings** → fill in your API key

## Building for distribution

```bash
pnpm --filter @nodx/extension build
```

The Chrome Web Store-ready package lands in `dist/`.

## Architecture (V0.1)

```
content script  → background worker  → provider API (user's key)
       ↑                                       ↓
   浮按钮 + Shadow DOM 浮窗            历史落 chrome.storage.local
```

All data stays in the browser. The extension never talks to nodx servers.

## TODOs

- [ ] Icons in `public/icons/` (currently missing — extension won't load until added)
- [ ] Streaming response (current V0.1 buffers full response then renders)
- [ ] Web Crypto API encryption for API key (currently plain in chrome.storage)
- [ ] Hotkey trigger (Alt+E) — V2
- [ ] "Save to nodx" desktop deep link — V2

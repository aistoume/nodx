# nodx desktop v0.2.0 — Self-Contained

**Double-click → fill API key → done.** No more terminal, no more worker process, no more `.env.local`. nodx is now a real desktop app.

---

## Headline change — in-process AI gateway

0.1.0 required you to keep a `pnpm cli-gateway` or `pnpm dev` terminal running for AI features to work. That's gone.

The Cloudflare-worker-shaped gateway has been **rewritten in Rust and embedded inside the Tauri process** (axum + reqwest + SSE parser, in its own OS thread). The frontend still fetches `http://127.0.0.1:8787` exactly like before — the contract is identical — but the server is now part of nodx.app itself.

What this unlocks:

- **Zero external dependencies.** Install, open, go.
- **API keys stored in the macOS Keychain.** Same encryption Safari/Mail use. Search `app.nodx.desktop` in Keychain Access to see exactly where your key lives — there's nothing else.
- **No nodx server in the data path.** Every Anthropic / Gemini call goes directly from your machine to the upstream provider.

## Two AI backends, switchable at runtime

In Settings → AI 接入方式, pick one:

| Mode | When to use |
|---|---|
| 🔑 **API key 直连** | You have / want a `sk-ant-...` key. Lowest latency (~500 ms). Embeddings (CBR) work. Web search works. |
| 🎫 **Claude Code 订阅** | You already pay for Claude Pro / Max. nodx spawns your installed `claude -p` CLI — no API key needed. nodx never touches your OAuth token; it just reads subprocess output. |

Switch any time. Setting persists across restarts.

## ⚙ Settings view

A real settings page now exists. Tabs handles:

- Provider mode toggle (above)
- Anthropic / Gemini / OpenAI key input (per-provider, password-masked, save/replace/delete) — keys go straight to the OS keychain
- Claude Code CLI detect (shows path + version when found, gives install instructions if not)

## New 💡 灵感池 (Inspiration Pool)

The nodx side of the Lens pipeline. Whenever you click 🔍 or 💾 inside nodx Lens (Chrome or macOS) the highlighted snippet flies into nodx desktop via the `nodx://capture` deep link, and shows up in **💡 灵感池** as a card with:

- 📌 Source page title + favicon + relative time
- ✨ "Let AI explain" button for bare snippets (calls Haiku locally)
- 🎯 "Upgrade to topic" — creates a Topic seeded with the snippet, kicks off Survey
- 🏷 Tags, ✏️ Edit explanation, 🗑 Delete

## ComfyUI-style network graph

Replaced Cytoscape with React Flow:

- Rich React nodes: title + AI summary preview + status dot + sub-topic chip (custom inline branch icon, not the old 🌳 emoji) + open-question pulse + auto-recursion flag
- Bezier connections, dark dot grid background, MiniMap, zoom Controls, dagre auto-layout (LR, ComfyUI-style)
- "⎌ 自动整理" + "⊡ 适配窗口" toolbar
- Drag nodes anywhere — positions persist per-subtree

## ComfyUI-style topic tabs

Header now has a tab strip:

- Each open topic is a tab with status dot + close ×
- Click LeftPanel topic → adds to tabs
- **+ button**: pick from existing topics OR inline "新建话题…" form (Enter to create + open in one shot)
- Tabs persist across restarts

## Bug fixes

- **Crash on launch** (the big one): `tauri::async_runtime::spawn` panicked inside the macOS `applicationDidFinishLaunching:` callback because no tokio runtime was entered on the main thread. The AI gateway now runs on its own OS thread with its own tokio runtime — fully decoupled.
- **401 unauthorized on every AI call**: stale `VITE_AI_CLIENT_TOKEN` in `.env.local` overrode the in-proc Rust-generated random token. In Tauri builds we now always use the Rust token, ignoring `.env.local`.
- **`claude` not found** on GUI launch: macOS strips PATH for apps opened from Finder/Dock, so `Command::new("claude")` couldn't find npm-installed binaries. Now resolves via env var → common absolute paths → `$SHELL -lic 'command -v claude'`. Plus injects the user's shell PATH into the spawned process so claude can find its own node/npm deps.
- **Lens `+`-encoded spaces** turning into garbage in Topic seeds: the Rust deep-link parser now substitutes `+` → space before percent-decoding (URLSearchParams form-encoding compatibility).

## Internal

- `keyring` 3.x with `apple-native` feature for Keychain access
- `axum 0.7` + `reqwest 0.12` (rustls) + `tokio` minimal feature set
- Mode persistence at `~/Library/Application Support/app.nodx.desktop/ai_mode.txt`
- Custom Tauri commands: `ai_key_set / ai_key_has / ai_gateway_token / ai_mode_get / ai_mode_set / cli_detect`

See `docs/inproc-gateway.md` for the full architecture writeup.

---

## Install

1. Download `nodx-0.2.0-arm64.dmg` (Apple Silicon, macOS 12+)
2. Drag `nodx.app` to `/Applications`
3. Right-click → Open (signed, not Apple-notarized in this build — Gatekeeper prompts once)
4. Open ⚙ 设置 → pick API key mode (paste `sk-ant-...`) or Claude Code mode (uses your installed CLI)
5. That's it. No terminals to keep open.

## Known limits

- Apple Silicon only (Intel build next)
- Windows / Linux not built
- Cloud sync (Yjs + Supabase) not in this release — single-device first
- DMG signed but not Notarized; first launch shows "could not verify"
- CLI mode: no embeddings (CBR features unavailable); 2–5s latency per call due to cold-start

## Coming next

- 0.2.x: Intel Mac build, Notarization, Lens 0.4 Chrome Web Store release
- 0.3: Cloud sync (Supabase) + Windows build
- 0.4: Mobile read-only companion (Expo)

---

**Repo**: https://github.com/aistoume/nodx (private)
**Lens**: https://aicon.solutions/nodx/lens/
**Contact**: ryan@aicon.solutions · 𝕏 [@LaoMo9394](https://x.com/LaoMo9394)

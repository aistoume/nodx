# In-process AI gateway (0.2.0+)

Replaces the Cloudflare worker / CLI gateway for desktop usage. Goal:
**double-click nodx.app → fill API key in Settings → done**. No terminal,
no Node, no Docker, no `.env.local`.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ nodx.app (single process)                                       │
│                                                                  │
│  ┌─────────────┐    fetch :8787      ┌──────────────────────┐  │
│  │  WebView    │ ───────────────────▶│  Rust axum gateway   │  │
│  │  (React)    │ ◀───────────────────│  (apps/desktop/      │  │
│  └─────────────┘     JSON / SSE      │   src-tauri/src/     │  │
│         │                            │   ai_gateway/)       │  │
│         │                            └──────────┬───────────┘  │
│         │ Tauri command                         │              │
│         │ (ai_key_set / ai_key_has /            │ keyring crate│
│         │  ai_gateway_token)                    ▼              │
│         │                            ┌──────────────────────┐  │
│         └───────────────────────────▶│  macOS Keychain       │  │
│                                       │  service: app.nodx.   │  │
│                                       │           desktop     │  │
│                                       │  accounts: anthropic  │  │
│                                       │            _api_key,  │  │
│                                       │            gemini_…   │  │
│                                       └──────────┬───────────┘  │
│                                                  │              │
└──────────────────────────────────────────────────┼──────────────┘
                                                   │
                                                   ▼
                                      api.anthropic.com / Gemini
```

Three guarantees:

1. **API keys never touch disk in plain text** — Keychain stores them
   AES-encrypted by the user's login password; only this exact app
   identifier (`app.nodx.desktop`) can read them.
2. **No nodx server in the data path** — every Anthropic / Gemini call goes
   directly from the user's machine to the upstream provider.
3. **Zero setup** — `pnpm install` + `pnpm tauri build` produces a DMG
   that works on a fresh machine; the only user action is "paste your key".

## Gateway HTTP contract

Unchanged from `workers/ai-gateway` so the `@nodx/ai` client works
verbatim. Only differences:

| | Old (worker) | New (in-proc) |
|---|---|---|
| Where it runs | Cloudflare edge (or `pnpm dev` locally on :8787) | Inside nodx.app, on `127.0.0.1:8787` |
| Bearer token | Hard-coded in worker `.dev.vars` + `.env.local` | Random per-launch, stored in Rust state, retrieved via Tauri command |
| API key | Worker env var (`ANTHROPIC_API_KEY`) | macOS Keychain (`app.nodx.desktop` / `anthropic_api_key`) |
| Web search tool | ✓ | ✓ |
| SSE streaming | ✓ | ✓ (axum + reqwest + futures-util) |
| `/v1/embed` (Gemini) | ✓ | ✓ |
| Sonnet rate-limit queue | Client-side (`packages/ai`) | Same — client-side unchanged |

## Files

```
apps/desktop/src-tauri/
  Cargo.toml                            +axum, reqwest, tokio, keyring, subtle
  src/
    lib.rs                              spawns gateway in setup(); 3 tauri commands
    ai_gateway/
      mod.rs                            axum router, auth, routes
      anthropic.rs                      SSE → CompleteResponse
      gemini.rs                         batch embed
      keychain.rs                       keyring-backed key storage

apps/desktop/src/
  ai/gateway.ts                         REWORKED — async getGatewayConfig(),
                                        token fetched via Tauri command
  components/SettingsView.tsx           NEW — UI to set/clear API keys
```

## Token security

A web page in the user's browser shouldn't be able to drive nodx's AI
just because it knows the URL. Three layers of defence:

1. **Bind 127.0.0.1 only** — gateway is `[127, 0, 0, 1]`, not `0.0.0.0`.
   Other machines on the LAN can't reach it.
2. **Random per-launch bearer** — Rust generates a 32-hex token at startup
   and only the Tauri webview can read it (via `invoke('ai_gateway_token')`).
   No outside fetch knows the value.
3. **Constant-time compare** — `subtle::ConstantTimeEq` to neutralise
   timing oracles.

A future hardening pass might pick a random port too (not :8787), but the
fixed port keeps the JS client config-free.

## Migration from .env.local (existing dev users)

If you used to run `pnpm start` with a worker:

```bash
# 0.2.0 ignores .env.local for the bearer token (uses Rust-generated random).
# You can leave .env.local in place or delete it — it has no effect on
# the in-proc gateway path.

# To use the in-proc gateway end-to-end:
cd apps/desktop
pnpm tauri build
open src-tauri/target/release/bundle/macos/nodx.app
# Open ⚙ Settings inside nodx, paste your sk-ant-... key.

# To keep using the worker (debugging the worker itself):
# Set VITE_AI_GATEWAY_URL=http://localhost:8787 + VITE_AI_CLIENT_TOKEN=<real>
# in .env.local AND keep `pnpm start` running. The gateway.ts file detects
# the env override and uses the worker instead of the in-proc one.
```

## CLI mode (Claude Code subscription)

A second backend, in addition to direct API-key, runtime-selectable from
Settings. Routes:

```
                    ┌──── api_key ────▶ reqwest → api.anthropic.com
/v1/complete ──────▶│
                    └──── cli ────────▶ tokio::process::Command "claude -p ..."
                                          └─ stdin = prompt
                                          └─ stdout = JSON envelope
                                          └─ uses caller's Claude Code login
```

Why: users with a **Claude Pro / Max subscription** can drive nodx without
paying for API tokens — they leverage what they already pay for.

Important caveats:

- Cold-start: each call spawns `claude` fresh → +2–5 s latency vs API mode.
- No embeddings: Claude Code doesn't expose an embedding endpoint, so
  CBR features (case library indexing / retrieval) are unavailable.
  `/v1/embed` returns 501 in CLI mode; the frontend prompts to switch back.
- No continuation: the CLI can't accept an `assistant_prefill` to resume a
  truncated turn. We always rewrite `stop_reason: max_tokens` → `end_turn`
  before returning, so the client's continuation loop never re-runs (a
  re-run would concat garbage). Practical impact: large outputs may stop
  at the CLI's per-turn cap; bump `--max-turns` if needed.
- Web search: works via `--allowedTools WebSearch WebFetch --max-turns 8`,
  but Claude Code occasionally serialises tool use differently from the
  direct API. Falling back to API mode is more predictable for web-heavy
  prompts.

Mode persists to `<AppData>/app.nodx.desktop/ai_mode.txt` so restarts
preserve the user's choice.

Tauri commands added:

| Command | Returns | Purpose |
|---|---|---|
| `ai_mode_get` | `"api_key" \| "cli"` | Read current mode |
| `ai_mode_set` | `void` | Switch + persist |
| `cli_detect` | version string OR error | Probe `claude --version` |

## Known limits / TODO

- **OpenAI provider not yet wired** — Settings UI lists it but the Rust
  adapter is missing. Will land alongside the "let user pick which provider
  for which prompt tier" feature.
- **No streaming exposed to frontend** — Anthropic stream is consumed in
  Rust and aggregated into one JSON, same as the original worker. The
  desktop UI shows the full reply at once (acceptable for current
  use cases). To re-enable token-by-token streaming we'd add a
  `POST /v1/complete-stream` returning SSE.
- **Embeddings need Gemini key** — same as the worker. CBR features prompt
  for it on first use.
- **No Windows / Linux Keychain testing yet** — `keyring` crate supports
  both, but we haven't validated the credential UX on those platforms.

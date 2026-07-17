# nodx-lens-gateway

Local AI gateway that lets **[nodx Lens](https://aicon.solutions/nodx/lens.html)** (Chrome extension) and **nodx desktop** run on your **Claude Code CLI** — your existing Claude subscription or key, with **no API key pasted anywhere**.

It listens on `127.0.0.1:8787` and shells out to `claude -p` (your locally-authenticated Claude Code session) for each request. Zero npm dependencies.

## Prerequisites

- Node.js ≥ 18
- [Claude Code CLI](https://claude.com/claude-code) installed and logged in (`claude` works in your terminal)

## Use with nodx Lens (Chrome extension)

```bash
npx nodx-lens-gateway
```

Then in the extension's ⚙ Settings → **AI Provider → nodx (local gateway)**. That's it — "Ask AI", explanations, and custom instructions now run through your local Claude. Keep the terminal window open while you use it.

## Options

| Env var | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | Listen port (the extension and nodx desktop expect 8787) |
| `CLI_GATEWAY_HOST` | `127.0.0.1` | Bind address — loopback only by default; don't expose it |
| `CLI_GATEWAY_TOKEN` | *(unset)* | Optional bearer token the clients must send |

## What it does / doesn't do

- ✅ Text + vision completions via `claude -p` (`POST /v1/complete`, `GET /health`)
- ✅ Tools locked down — the spawned CLI gets an empty `allowedTools` list (it cannot touch your filesystem); web search is enabled only when a request asks for it
- ❌ Embeddings (`POST /v1/embed` → 501) — nodx desktop's CBR retrieval degrades gracefully
- ⏱ Each call cold-starts a `claude` process (~5–7 s overhead) — fine for on-demand explanations, not for bulk jobs

## Legitimacy note

This drives the Claude Code CLI you are licensed to run, as local automation. It does **not** extract or replay OAuth tokens against the Anthropic API.

## Source

Part of the [nodx monorepo](https://github.com/aistoume/nodx) — `workers/cli-gateway`.

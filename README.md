# nodx

> AI-assisted decision-thinking workspace. The user drives the depth; AI organises the result.

A local-first desktop app that helps managers turn fuzzy decision questions into structured, actionable thinking. Instead of one-shot chat, nodx walks the user through:

1. **Survey** — AI proposes 5–7 candidate factors; user picks 3–5 (or types their own).
2. **First-principles decomposition** — selected factors expand into essence + sub-questions.
3. **Thinking document** — Sonnet drafts a Google-Doc-style markdown deliverable based on the decomposition. Editable in-place via TipTap.
4. **Selection refinement** — highlight any passage to ask AI for a deeper version, accept / reject the proposed replacement.
5. **Annotations** — yellow notes / blue explanations / (later) green atomic actions / purple cross-references float on the right margin, anchored to the selected text.

The "chat" channel sits at the bottom of the document for free-form follow-up; the document is the artefact.

## Status

Mid-M1 (per [`CLAUDE.md`](./CLAUDE.md) §5). All Week-1 + most of Week-2 scope is in:

- ✅ Tauri 2.11 desktop shell with SQLite (3 migrations)
- ✅ pnpm + Turborepo monorepo, 4 packages, 107 vitest cases
- ✅ Three-column layout with Tailwind v4 design tokens lifted from [`prototype.html`](./prototype.html)
- ✅ Topic CRUD (create / archive / delete / parent-child)
- ✅ Cloudflare Worker AI gateway with streaming + Anthropic `web_search`
- ✅ Survey card (with custom factor input) → decompose → thinking document
- ✅ Selection menu (解释 / 便签 / 深化) with accept-reject suggestion UX
- ✅ Right-panel cards anchored to doc selection, scroll-tracked
- ⏳ Atomic-action checker (M1 Week 2 closer)
- ⏳ Cytoscape network-graph view (M1 Week 3)
- ⏳ Yjs sync / Supabase (M3)

Full roadmap and design rationale in [`PRD.md`](./PRD.md).

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ apps/desktop  (Tauri 2.11 + React 19 + Vite 6)       │
│   ├─ TipTap editor (the document)                    │
│   ├─ Local SQLite via @tauri-apps/plugin-sql         │
│   └─ Calls AI through @nodx/ai → worker, never       │
│      directly to Anthropic                           │
└────────────────────┬─────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌───────────────┐         ┌─────────────────────┐
│ packages/     │         │ workers/ai-gateway  │
│ - models      │         │ Cloudflare Worker   │
│ - ai          │ ◀──────▶│ (Bearer-token auth, │
│ (Zod schemas, │         │  SSE streaming,     │
│  prompts,     │         │  web_search tool)   │
│  client SDK)  │         │                     │
└───────────────┘         └─────────────────────┘
                                    │
                                    ▼
                           Anthropic Messages API
                           (Sonnet 4.6 / Haiku 4.5)
```

Workspaces:

| Path | Purpose |
|---|---|
| [`packages/models`](./packages/models) | Zod-typed domain entities — Topic / Message / Comment / Edge / DraftItem / TopicDocument |
| [`packages/ai`](./packages/ai) | Versioned prompt builders, output schemas, gateway client (`complete` / `completeText` / `pingGateway`) |
| [`apps/desktop`](./apps/desktop) | The Tauri/React app the user sees |
| [`workers/ai-gateway`](./workers/ai-gateway) | The Cloudflare Worker that holds the Anthropic key and forwards prompts |

## Quick start

### Prerequisites

- Node 20+, pnpm 9+
- Rust toolchain (`rustup default stable`) — required by Tauri
- macOS Xcode CLT for Tauri (`xcode-select --install`)
- An Anthropic API key with access to Claude Sonnet 4.6 + Haiku 4.5

### 1. Install

```bash
git clone https://github.com/aistoume/nodx.git
cd nodx
pnpm install
```

### 2. Worker secrets

```bash
cp workers/ai-gateway/.dev.vars.example workers/ai-gateway/.dev.vars
# Edit and fill in real values:
#   ANTHROPIC_API_KEY=sk-ant-api03-...
#   CLIENT_TOKEN=$(openssl rand -hex 32)
```

`.dev.vars` is gitignored. Production secrets go via `pnpm --filter @nodx/ai-gateway exec wrangler secret put NAME`.

### 3. Desktop env

```bash
cp apps/desktop/.env.example apps/desktop/.env.local
# Edit and set:
#   VITE_AI_GATEWAY_URL=http://localhost:8787
#   VITE_AI_CLIENT_TOKEN=<same value as worker .dev.vars CLIENT_TOKEN>
```

### 4. Run

Two terminals:

```bash
# Terminal A — AI gateway (wrangler dev on :8787)
pnpm --filter @nodx/ai-gateway dev

# Terminal B — Tauri desktop app
pnpm desktop:dev
```

First Tauri build takes a few minutes (Rust compilation); subsequent runs are fast.

### 5. Verify the gateway

```bash
curl http://localhost:8787/health
# {"ok":true,"service":"nodx-ai-gateway"}

TOKEN=<your CLIENT_TOKEN>
curl -X POST http://localhost:8787/v1/complete \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5","prompt":"reply with JSON {\"hi\":\"world\"}","max_tokens":100}'
```

If you get a `text` field back, the path is healthy.

## Development

```bash
pnpm -r typecheck     # all packages
pnpm -r test          # 107 vitest cases
pnpm desktop tauri build   # produce a release .app / .dmg
```

Tauri-side checks:

```bash
cd apps/desktop/src-tauri && cargo check
```

## Tech choices

| Concern | Pick | Why |
|---|---|---|
| Desktop shell | Tauri 2.11 | smaller / safer than Electron; Rust security model |
| UI framework | React 19.2 + Vite 6 | latest stable, ref-as-prop, async transitions |
| Styling | Tailwind v4 (Oxide) | CSS-native `@theme`, no JS config, fast builds |
| Editor | TipTap 2 + ProseMirror | richest collab story for v3 (Yjs integration) |
| Local DB | SQLite via Tauri SQL plugin | offline-first, foreign keys, triggers |
| AI gateway | Cloudflare Workers | edge-deploy, SSE streaming, generous free tier |
| AI providers | Anthropic Sonnet 4.6 + Haiku 4.5 | structured reasoning + cheap hot-path |
| Sync (future) | Yjs over WebSocket → Supabase Realtime | CRDT, mature React story |

Full rationale in [`PRD.md`](./PRD.md) §5.

## Project layout

```
nodx/
├── apps/
│   └── desktop/           # Tauri 2.11 + React 19 frontend
│       ├── src/           #   TipTap doc, Survey card, right-panel anchors
│       └── src-tauri/     #   Rust backend, SQLite migrations
├── packages/
│   ├── models/            # Zod schemas
│   └── ai/                # Prompt templates + gateway client
├── workers/
│   └── ai-gateway/        # Cloudflare Worker (Anthropic forwarder)
├── CLAUDE.md              # Working context for AI pair-programmer
├── PRD.md                 # Full product spec
└── prototype.html         # M0 design prototype (D3-based)
```

## License

Not yet declared. Treat as private until otherwise noted.

# nodx desktop v0.1.0 — First Public Beta

**The decision-thinking workspace where reading becomes thinking, and thinking compounds.**

This is the first public beta of nodx desktop, the full sibling to nodx Lens.
Bring your own Claude / GPT / Gemini API key — no subscription, no telemetry,
no nodx server in the data path.

---

## What's in 0.1.0

### Core thinking loop (M1)
- **Network conversations**, not linear chat — fork "deep dive" branches off any AI reply, each becomes its own sub-topic
- **First-principles decomposition** — Survey card breaks fuzzy problems into the factors you actually need to discuss
- **Inline explanations** — select any word in a thinking doc, get a 50–150 char Haiku gloss; persistent annotation anchors it for later
- **Four-color comments** — sticky note / explanation / atomic action / reference, all anchored to the text that triggered them
- **Atomicity checker** — Haiku validates whether a conclusion is actionable; "summarize back to parent" flow with Sonnet integrates child-topic insights upstream
- **Decision report export** — BFS the subtree → Sonnet summary → copyable Markdown

### Expert Panel Protocol
- 3+ AI experts (with mandatory devil's advocate) run a 4-round structured debate
- Reaches a **Local Maximum** conclusion when convergence is detected (cost/marginal-return rules from PRD §3.14)
- Two integration paths:
  - **归纳进文档** — Sonnet weaves the result into a new section of your thinking doc
  - **直接替换文档** — pure-functional render Local Max → Markdown, overwrites the doc

### Case-Based Reasoning (CBR)
- Past decisions become a searchable case library indexed by Gemini Embedding 2 (pgvector + heuristic re-rank + Sonnet fusion)
- New questions can fork-and-adapt from old cases instead of being thought from scratch
- "Expert panel only debates the diff" — when adapting a case, only the differences need debate

### Auto-Recursion Engine
- Project Manager (Sonnet) evaluates whether each topic is "atomic enough" → keeps spawning sub-discussions until the conclusion is actionable
- Three modes: Pilot (multi-path eval), Auto-Step (one step at a time), Auto-Run (full recursion with confirmation)
- Real-time budget meter ($5 default cap, configurable)
- "Real-world blocks" force a researcher (Sonnet + web search) before stopping

### Replay & open questions
- Every reasoning trace is reproducible (the "不丢失" pillar) — replay any past session as a card in the doc
- Global 卡点 tracker (top header badge) — never lose an unresolved sub-question across multiple topics

### NEW in 0.1.0 — Lens integration & UI polish
- **💡 灵感池** — captures from nodx Lens (Chrome + macOS) land here via `nodx://capture` deep link. Each entry can be:
  - 🎯 Promoted to a full nodx topic (kicks off Survey)
  - ✨ Asked to "let AI explain" (Haiku) if it's a bare capture
  - Tagged, edited, searched, filtered by source
- **ComfyUI-style network graph** — replaced Cytoscape with React Flow:
  - Rich React nodes (title + AI summary + status dot + chips for messages / sub-topics / auto-recursion flag)
  - Bezier connections, dark-mode dot grid, MiniMap, zoom Controls
  - Dagre auto-layout (left-to-right) + drag-anywhere with persistence
- **Topic tabs bar** below header — like ComfyUI's workflow tabs. Open multiple topics, switch with one click, `+` to create new

### Data ownership
- All data stays in local SQLite (`~/Library/Application Support/app.nodx.desktop/nodx.db`)
- AI calls go directly from your machine to your provider via a local Cloudflare Worker gateway (your token, your spend)
- Export any topic subtree as a `.nodx` data pack — transplant the whole thing to another machine

---

## Install

1. Download `nodx-0.1.0-arm64.dmg` (Apple Silicon, macOS 12+)
2. Drag `nodx.app` to `/Applications`
3. First launch: right-click → Open (signed but not yet Notarized — Gatekeeper will prompt once)
4. Configure your AI gateway:
   ```
   cp apps/desktop/.env.example apps/desktop/.env.local
   # Fill in VITE_AI_GATEWAY_URL (your local Worker) + VITE_AI_CLIENT_TOKEN
   ```
   Or use the **CLI provider** (zero API key — drives your Claude Code subscription):
   ```
   pnpm start:cli
   ```
   See `docs/cli-provider.md`.

---

## Known limitations

- **Apple Silicon only** in this build (Intel Mac DMG comes next sprint)
- **Windows / Linux** not built yet
- **Cloud sync** (Yjs + Supabase) not in this release — single-device first
- The signed DMG is not Apple-notarized; on first launch macOS shows "could not verify". Right-click → Open works around it
- AI calls require either (a) your own AI gateway worker running locally, or (b) Claude Code CLI mode

---

## Roadmap

- 0.1.x — Intel Mac build, Lens 0.4 (parity with desktop deep-link), Notarization
- 0.2 — Cloud sync (Supabase) + Windows build
- 0.3 — Mobile read-only companion (Expo)

---

**Repo**: https://github.com/aistoume/nodx (private, by design — only the website and downloads are public at https://aicon.solutions)

**Lens** (companion Chrome extension): coming to Chrome Web Store / already at https://aicon.solutions/nodx/lens/

**Contact**: contact@aicon.solutions · 𝕏 @LaoMo9394

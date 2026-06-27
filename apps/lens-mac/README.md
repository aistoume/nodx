# nodx Lens for macOS

System-wide select-and-explain. Hit ⌥+E anywhere on your Mac to get an inline AI explanation of whatever you just copied.

## How it works (V0)

```
1. In any Mac app (VS Code / Notes / PDF / Mail / browser…),
   select some text and copy it (⌘+C).
2. Press ⌥+E.
3. A floating panel appears at screen center, streams the AI explanation
   from your chosen provider (Anthropic / OpenAI / Google).
4. Esc to dismiss. The window hides; the hotkey re-triggers.
```

> V0 reads the **clipboard** rather than tapping the macOS Accessibility API directly. That keeps the install zero-friction (no system permission prompts). V1 will add Accessibility-based selection reading so you can skip the ⌘+C step.

## Build & install (no Apple Developer account needed)

### Prerequisites

- macOS 12.0+
- Node 20+, pnpm 9+ (already set up in this monorepo)
- Rust toolchain: `rustup default stable`
- Xcode Command Line Tools: `xcode-select --install`

### First-time icon generation

The Tauri CLI bakes the icon set into the bundle. Run once:

```bash
cd apps/lens-mac
pnpm tauri icon src-tauri/icons/icon-1024.png
```

This regenerates `src-tauri/icons/*.png` and `src-tauri/icons/icon.icns` from the 1024×1024 source.

### Dev mode (live reload)

```bash
cd apps/lens-mac
pnpm install
pnpm tauri dev
```

A window pops up. Select Provider → paste your API key → Save. Then ⌘+C anywhere and ⌥+E.

### Production DMG (for personal install + first-time test)

```bash
cd apps/lens-mac
pnpm tauri build --bundles dmg
```

Output: `src-tauri/target/release/bundle/dmg/nodx Lens_0.0.1_aarch64.dmg`

**Install the unsigned DMG**:

1. Double-click the DMG, drag "nodx Lens.app" to Applications.
2. First launch: Gatekeeper will refuse ("can't be opened because it is from an unidentified developer").
3. **Right-click** the app in Applications → **Open** → click **Open** in the dialog. After this once, Gatekeeper remembers your approval forever.
4. Settings → enter API key → Save.
5. ⌘+C in any app, then ⌥+E.

> When you're happy with the build, get an Apple Developer Program account ($99/year) and add `signingIdentity` + notarization to `tauri.conf.json` so future builds skip the right-click-open step.

## Architecture

```
                                              .──────────────.
                                             (  Anthropic /   )
                                              (  OpenAI /     )
                                              (  Google       )
                                               '──────────────'
                                                       ▲
                                                       │ (BYO API key, direct)
                                                       │
┌─────────────────────────────────────┐          ┌─────┴──────────────────┐
│ macOS system                        │          │ Preact UI (this app)   │
│   ⌥+E pressed   ←   global hotkey ──┼─────────►│   - Floating panel      │
│   pasteboard    ─→  read clipboard ─┼─────────►│   - Settings (store)    │
└─────────────────────────────────────┘  events  │   - Streaming display   │
              ↑                                  └─────────────────────────┘
              │
       Tauri Rust shell
       (src-tauri/src/main.rs)
```

## V0 → V1 roadmap

- [x] Global hotkey ⌥+E
- [x] Clipboard read fallback
- [x] Streaming three providers
- [x] System tray (Show/Hide, Settings, Quit)
- [x] DMG bundle (unsigned, local install)
- [ ] **Real NSPanel** (currently uses a transparent always-on-top window) — V1
- [ ] **Accessibility API** for selection reading (skip ⌘+C step) — V1
- [ ] **CGEvent cursor position** for spawning panel exactly where you're looking — V1
- [ ] Code signing + notarization → distributable DMG — when feedback says "yes ship it"
- [ ] Mac App Store version — only after notarized DMG validates the idea

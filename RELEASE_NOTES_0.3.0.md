# nodx desktop v0.3.0 — One App, Everywhere

**The standalone Lens-for-Mac is gone.** Everything it did now lives in nodx desktop. Install one app, get the whole nodx ecosystem.

---

## Headline change — system-wide ⌥+E select-and-explain

Anywhere on macOS — VS Code, Notes, Mail, PDFs, browsers, anywhere — select text → press **⌥+E** → nodx pops up an AI explanation in 100ms.

Optional one-click button: **🎯 收进灵感池**. The snippet + explanation become a card you can later upgrade into a full nodx thinking topic.

Architecturally: this is the lens-mac Rust code (CGEvent + Accessibility + clipboard dance) ported into the desktop app's process, using the same in-proc Rust AI gateway 0.2 introduced. **No second binary**, no separate menu-bar icon (the desktop one now does both roles).

## Menu-bar presence

Close the main window and nodx stays running in the menu bar:

- 📥 nodx logo in your system tray
- Click → show / hide main window
- Right-click → Settings / Quit
- ⌥+E still works regardless

So you can use the system-wide capture without keeping the giant main window in your way.

## Settings → ⌥+E 全局划词解释

A new section in ⚙ Settings:

- Shows whether the global hotkey is active (and why it isn't, if so)
- Shows Accessibility permission status
- One-click button: opens macOS System Settings → Privacy & Security → Accessibility
- Explainer (collapsible): how Apple's permission model actually works

## ⚠️ lens-mac is deprecated

If you already installed **nodx Lens.app** (the old standalone Mac app), please **delete it from `/Applications`**. Otherwise the two apps will fight over the ⌥+E global shortcut. nodx desktop 0.3 will log a warning if it couldn't register because something else owns the key.

The lens-mac repo folder + GitHub release page stay up for historical reference; no more updates.

## Smaller things

- **Tray icon** uses your nodx logo as a template image (auto-tints with macOS dark/light mode)
- **Popover window** is a separate Tauri window (not a modal) so it survives close-and-reopen cleanly
- **ESC closes the popover** instead of having to click ✕
- **Empty selection** (firing ⌥+E without selecting anything) is silently ignored instead of showing an empty popover

## Internal

- New Rust module: `src-tauri/src/system_capture/mod.rs` — accessible API surface
- Two new Cargo deps: `tauri-plugin-global-shortcut`, `tauri-plugin-clipboard-manager`, plus `core-graphics` on macOS targets
- Two new Tauri commands: `capture_has_permission`, `capture_open_permission_settings`, `capture_is_hotkey_active`
- Vite multi-entry: `popover.html` builds alongside `index.html`
- Tauri window config: `popover` window with `alwaysOnTop`, `skipTaskbar`, `visible:false`

---

## Install

1. Download `nodx-0.3.0-arm64.dmg` (Apple Silicon, macOS 12+)
2. Drag `nodx.app` to `/Applications`
3. Right-click → Open (signed, not Apple-notarized yet — Gatekeeper prompts once)
4. **Grant Accessibility permission** when nodx asks (System Settings → Privacy & Security → Accessibility → check `nodx`). This is what allows ⌥+E to work in other apps.
5. ⚙ Settings → set up your AI key or pick Claude Code subscription mode

Then: highlight any text anywhere on your Mac → ⌥+E → 🎉

## Upgrading from 0.2.0

- No data migration — your灵感池 / topics / network graph are unchanged
- Settings page now has a new "⌥+E" section — that's all that's new in UI
- First-time hotkey use will prompt for Accessibility (one-time)

## Known limits

- Apple Silicon only (Intel build still coming)
- Windows / Linux: no system-wide capture path yet (other platforms use different OS APIs)
- DMG signed but not Apple-notarized (Gatekeeper prompt on first open)
- Hotkey is fixed at ⌥+E for 0.3 — user-configurable hotkey planned for 0.3.x

## Coming next

- **0.3.1**: Intel build, Notarization, Lens Chrome 0.4 launch
- **0.4**: Cloud sync (Yjs + Supabase), Windows build, mobile companion
- **0.5**: Team plan opens (cloud-shared case library + GraphRAG)

---

**Repo**: https://github.com/aistoume/nodx (private)
**Website**: https://aicon.solutions
**Contact**: contact@aicon.solutions · 𝕏 [@LaoMo9394](https://x.com/LaoMo9394)

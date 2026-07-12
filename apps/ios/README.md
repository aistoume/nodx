# nodx Lens for iOS

SwiftUI port of the Android app: **launch → screenshot → action wheel**. No
nodx-desktop integration (by design, same as Android).

## Flow (the iOS take on the Android bubble)

iOS has no system overlay / MediaProjection, so the capture model is:

1. Take a screenshot anywhere (Side + Volume Up).
2. Open nodx — the latest screenshot auto-loads one tap away (Photos
   `photoScreenshot` subtype, newest first), or pick any image via the picker.
3. Drag to box a region (amber marquee, same 24px minimum as Android).
4. The radial action wheel opens — identical spokes to Android / Lens 0.9:
   - 🔍 up → 📖 Explain / 🔎 Search (Google Images)
   - 💡 right → Save to Photos
   - 🛒 down → 🏷 Google Shopping / 📦 Amazon
   - 🎨 left → Generate (Gemini image, 2×2 style grid)

Everything else ports verbatim from Android: prompts, model routing
(fast=Haiku tier / quality=Sonnet tier per provider), endpoints, URL presets,
the 200-entry JSONL action log + thumbnails, and BYOK key storage.

## Providers (BYOK, all client-side)

| Provider | Vision (fast / quality) | Notes |
|---|---|---|
| Anthropic (default) | claude-haiku-4-5 / claude-sonnet-5 | |
| OpenAI | gpt-5.6-luna / gpt-5.6-sol | |
| OpenRouter | openrouter/free | |
| Gemini | gemini-3.5-flash | free tier |

Image generation is always Gemini (`gemini-3.1-flash-image`), regardless of
the vision provider — 🎨 needs a Gemini key in Settings.

## Build

```sh
cd apps/ios
xcodebuild -project nodx.xcodeproj -scheme nodx \
  -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.6' build
```

Or open `nodx.xcodeproj` in Xcode (16+; sources are a filesystem-synchronized
group — new .swift files under `nodx/` are picked up automatically). iOS 17+,
no dependencies, no signing needed for the simulator.

## Source map

| File | Role (Android counterpart) |
|---|---|
| `NodxApp.swift` | app + 3-tab shell (MainActivity) |
| `CaptureView.swift` | Run tab: screenshots strip + picker (bubble/capture) |
| `MarqueeView.swift` | full-screen select stage (SelectionOverlayView) |
| `RadialMenuView.swift` | two-level pie menu (RadialMenu) |
| `WheelConfig.swift` | spokes/actions/prompts (WheelConfig) |
| `Actions.swift` | action runners + vision routing (Actions) |
| `AIClients.swift` | Anthropic/OpenAI/Gemini (ai/*Client.kt) |
| `ActionLog.swift` | JSONL history + thumbs (ActionLog) |
| `ResultCard.swift` | answer sheet (ResultCard) |
| `SettingsView.swift` / `HistoryView.swift` / `Prefs.swift` | settings/history/prefs |

Not yet ported (v2): wheel editor (custom spokes), Share Extension entry,
app icon.

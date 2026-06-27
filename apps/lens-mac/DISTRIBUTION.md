# Installing nodx Lens (macOS · beta)

> nodx Lens beta is not yet signed by Apple. macOS will warn you on first open — the right-click trick below bypasses it safely. We'll be properly signed + notarized once the beta stabilizes.

## Install (90 seconds)

1. **Download** the latest `nodx-lens-<version>-<arch>.dmg` from [your distribution URL].
   - On Apple Silicon Macs (M1/M2/M3/M4): pick the `arm64` build.
   - On Intel Macs: pick the `x86_64` build.

2. **Open the DMG**. A window opens — drag **nodx Lens** to the **Applications** folder.

3. **First launch** (Gatekeeper bypass):
   - Open Finder → Applications → find **nodx Lens**.
   - **Right-click** (or two-finger click) → **Open**.
   - In the dialog, click **Open** again.
   - macOS remembers your approval — every future launch is normal.

   > 🔓 Tech detail: macOS quarantines apps downloaded from the internet. The right-click step tells Gatekeeper "I trust this." Same trick works for any unsigned developer app.

4. **Grant Accessibility permission** (one-time):
   - Press **⌥ + E** for the first time.
   - A "Permission Needed" window appears, and System Settings auto-opens to Privacy → Accessibility.
   - Find **nodx Lens** in the list → toggle the switch **on**.
   - From the menu bar (top-right of screen) → click the nodx Lens icon → **Quit**.
   - Launch nodx Lens again from Applications.

5. **Configure** your AI provider:
   - Press ⌥ + E once. Settings opens.
   - Pick **Provider** (Anthropic, OpenAI, or Google).
   - Paste your **API key** from that provider's console.
   - **Save**.

6. **Use it**:
   - Select text in any app (Notes / VS Code / Safari / PDF / Mail / anything).
   - Press **⌥ + E**.
   - A small window appears with an AI-streamed explanation.
   - Press **Esc** to dismiss.

## What it does (and doesn't)

✅ Reads the text you just selected (via simulated ⌘+C — runs only when you trigger it).
✅ Sends that text + your prompt to your chosen AI provider, using your own API key.
✅ Streams the response into a small floating window.
✅ Restores your original clipboard so we don't pollute what you had copied.

❌ No background telemetry. No analytics. No phone-home.
❌ No reading your screen. No monitoring keystrokes outside ⌥+E.
❌ No nodx server in the loop — your API key goes from your Mac directly to Anthropic / OpenAI / Google.

## Costs

You pay your AI provider directly per-request, at their normal rates. Typical short explanation on Claude Haiku 4.5: about **$0.0005** (half a tenth of a cent). A heavy user might spend $1–3 a month.

## Uninstall

1. Open Finder → Applications → drag **nodx Lens** to Trash.
2. (Optional) Clean up settings:
   ```bash
   rm -rf ~/Library/Application\ Support/com.nodx.lens
   ```
3. (Optional) Remove the Accessibility permission:
   System Settings → Privacy & Security → Accessibility → select nodx Lens → click **−**.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "nodx Lens cannot be opened because it is from an unidentified developer" | Right-click the app → Open (one-time bypass). |
| ⌥+E does nothing | Check System Settings → Privacy → Accessibility — is nodx Lens toggled **on**? Restart the app after toggling. |
| ⌥+E shows the wrong text | Either selection failed (try ⌘+C manually, then ⌥+E) or another app captured the keystroke. Try a different hotkey via Settings (V1 feature). |
| Window appears in the wrong spot | Currently centered on screen. V1 will spawn at cursor. |
| "Error: 401" or "Error: 403" | API key is wrong / out of quota / wrong model name. Verify on the provider console. |
| Floating window briefly appears then disappears | Outdated build — upgrade to the latest .dmg. |

## Contact

Bugs, feature ideas, or anything: [https://x.com/LaoMo9394](https://x.com/LaoMo9394)

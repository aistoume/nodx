# nodx Lens — Privacy Policy

_Last updated: 2026-06-02_

nodx Lens is a Chrome extension that provides on-page AI explanations when you select text on a webpage. This document describes what data the extension touches, where it goes, and what it does NOT do.

## TL;DR

- **We do not run a server.** All API calls go from your browser **directly** to whichever AI provider you configured (Anthropic, OpenAI, or Google).
- **We do not collect, transmit, or store your data.** Your API key, the text you select, the AI explanations, and your history all live only in your browser's local storage (`chrome.storage.local`).
- **We have no analytics, no telemetry, no third-party trackers.**

## What data the extension handles

| Data | Where it lives | Who can see it |
|---|---|---|
| Your API key | `chrome.storage.local` on your computer | Only your local Chrome profile |
| Text you selected | Sent directly to the AI provider you configured | The AI provider you chose; not us |
| AI explanation responses | `chrome.storage.local` (recent 20 entries) | Only your local Chrome profile |
| Source URL / page title of each explanation | `chrome.storage.local` (history entry) | Only your local Chrome profile |

## What we do NOT do

- We do not host or maintain any server. There is no nodx Lens backend.
- We do not collect personal information.
- We do not transmit your selected text, API key, or AI responses to any nodx-controlled endpoint.
- We do not use analytics (no Google Analytics, no Mixpanel, no Sentry, etc.).
- We do not show ads.
- We do not sell, rent, or share data with third parties.

## Third-party providers

When you trigger an explanation, the extension sends the selected text and your prompt directly to the AI provider you chose in Settings. That provider's own privacy policy applies to that request:

- **Anthropic (Claude):** <https://www.anthropic.com/legal/privacy>
- **OpenAI:** <https://openai.com/policies/privacy-policy/>
- **Google (Gemini API):** <https://ai.google.dev/gemini-api/terms>

You should review the policy of whichever provider you use.

## Permissions, justified

| Permission | Why we need it |
|---|---|
| `activeTab` | So the content script can show the explanation panel inside the current tab. |
| `storage` | To store your settings and recent history locally. |
| `host_permissions` to `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com` | So the background service worker can call your chosen AI provider directly with your API key. |

`<all_urls>` matches in `content_scripts` are needed because the extension is supposed to work on any webpage you're reading. The content script only activates when you select text; it does not read or modify the page otherwise.

## Your control over your data

- **Reset everything:** open Settings and clear the API key field, or in Chrome go to `chrome://extensions/` → nodx Lens → "Remove" to uninstall.
- **Clear history:** open the extension popup (toolbar icon) and click "清空历史" / "Clear history".
- **Switch provider:** Settings → AI Provider — your old key is replaced; nothing is sent to your previous provider afterward.

## Contact

For privacy questions, security concerns, or anything you think this policy got wrong, reach out on X (Twitter): <https://x.com/LaoMo9394>.

---

_If we ever change this policy, the date at the top will be updated and a notice will be visible in the Settings page._

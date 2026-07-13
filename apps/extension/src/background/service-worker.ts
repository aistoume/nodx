/**
 * nodx Lens — background service worker
 *
 * Uses a long-lived chrome.runtime.Port for streaming.  A content script
 * connects with name 'EXPLAIN', sends a single START message with the
 * selected text + mode, and receives a sequence of CHUNK messages followed
 * by either DONE or ERROR.
 *
 * Port protocol:
 *   client → service worker:  { type: 'START', text, mode, url, title }
 *   service worker → client:  { type: 'CHUNK', text }     (zero or more)
 *                              { type: 'DONE', full }       (final)
 *                              { type: 'ERROR', error }     (terminal)
 *
 * The service worker disconnects after DONE/ERROR.  The client can also
 * disconnect early to abort (AbortSignal flows down to fetch).
 */

import { getSettings, providerNeedsApiKey } from '../shared/settings.js';
import { buildExplainPrompt, buildDeepenPrompt } from '../shared/prompts.js';
import { callAI, generateGeminiImage } from '../shared/providers.js';
import { recordExplanation } from '../shared/history.js';
import { resolveLocale, t, setLocale } from '../shared/i18n.js';

interface StartMessage {
  type: 'START';
  text: string;
  mode: 'short' | 'deep';
  url: string;
  title: string;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'EXPLAIN') return;

  const ctrl = new AbortController();

  port.onDisconnect.addListener(() => ctrl.abort());

  port.onMessage.addListener((msg: StartMessage) => {
    if (msg.type !== 'START') return;
    void handle(msg, port, ctrl.signal);
  });
});

async function handle(
  msg: StartMessage,
  port: chrome.runtime.Port,
  signal: AbortSignal,
): Promise<void> {
  try {
    const settings = await getSettings();
    setLocale(settings.language);
    if (!settings.apiKey && providerNeedsApiKey(settings.provider)) {
      throw new Error(t('missingApiKey'));
    }

    const locale = resolveLocale(settings.language);
    const prompt =
      msg.mode === 'short'
        ? buildExplainPrompt(msg.text, locale)
        : buildDeepenPrompt(msg.text, locale);

    const model =
      msg.mode === 'short' ? settings.model.explain : settings.model.deepen;

    const onChunk = (text: string) => {
      try {
        port.postMessage({ type: 'CHUNK', text });
      } catch {
        // port disconnected
      }
    };

    const full = await callAI(settings.provider, settings.apiKey, model, prompt, onChunk, signal);

    await recordExplanation({
      selectedText: msg.text,
      explanation: full,
      sourceUrl: msg.url,
      sourceTitle: msg.title,
      mode: msg.mode,
    });

    try {
      port.postMessage({ type: 'DONE', full });
    } catch {
      /* disconnected */
    }
    try {
      port.disconnect();
    } catch {
      /* already gone */
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    try {
      port.postMessage({ type: 'ERROR', error });
    } catch {
      /* disconnected */
    }
    try {
      port.disconnect();
    } catch {
      /* already gone */
    }
  }
}

// Open options on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.runtime.openOptionsPage();
  }
  // Toolbar-icon click opens the side panel (v0.7.0). Set once at
  // install/upgrade time; Chrome persists the behaviour.
  // Safari has no sidePanel API — optional-chain so the SW doesn't throw on install.
  void chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    ?.catch(() => {
      /* older Chrome / Safari — user opens the panel manually */
    });

  // Re-inject content script into every already-open tab (v0.7.2).
  //
  // Content scripts declared in manifest only inject when a page loads
  // AFTER the extension is installed. Existing tabs (the ones the user
  // has open when they install / update / reload the extension) don't
  // get the new content script until they navigate or reload — that's
  // why the sidepanel button reported "Receiving end does not exist"
  // right after unloading + reloading the extension.
  //
  // Fix: on install and on update, walk every tab and executeScript the
  // manifest's content-script files into it. Chrome silently ignores
  // tabs where injection isn't allowed (chrome://, the Web Store, PDF
  // viewers, etc.) so we swallow individual failures.
  void reinjectContentScripts();
});

async function reinjectContentScripts(): Promise<void> {
  try {
    const manifest = chrome.runtime.getManifest();
    const files: string[] = [];
    for (const cs of manifest.content_scripts ?? []) {
      for (const f of cs.js ?? []) files.push(f);
    }
    if (files.length === 0) return;

    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      // Skip protocols that don't allow content-script injection.
      if (
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('about:') ||
        tab.url.startsWith('devtools://') ||
        tab.url.startsWith('view-source:') ||
        tab.url.startsWith('https://chrome.google.com/webstore') ||
        tab.url.startsWith('https://chromewebstore.google.com')
      ) {
        continue;
      }
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files,
        });
      } catch {
        /* per-tab failure is fine — some pages just won't allow it. */
      }
    }
  } catch (e) {
    console.warn('[nodx Lens] content-script reinject skipped:', e);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// OPEN_SIDE_PANEL — content script / marquee → side panel handoff
//
// Content scripts can't call chrome.sidePanel.open() directly (needs a
// user-gesture window). We call it here on their behalf. The panel
// listens for a follow-up `FOCUS_HIGHLIGHT` message so it can scroll to
// the right card as soon as it mounts.
// ────────────────────────────────────────────────────────────────────────────

interface OpenSidePanelMessage {
  type: 'OPEN_SIDE_PANEL';
  highlightId?: string;
}

chrome.runtime.onMessage.addListener((msg: OpenSidePanelMessage, sender, sendResponse) => {
  if (msg?.type !== 'OPEN_SIDE_PANEL') return false;
  void openSidePanel(sender, msg.highlightId).then(() => sendResponse({ ok: true }));
  return true;
});

// Keyboard shortcut → screenshot. Bound to Alt+Shift+S in manifest.
// Firing from chrome.commands counts as an "extension invocation" so
// activeTab is granted for the current tab, which is exactly what
// captureVisibleTab needs. Also opens the side panel afterward so the
// user sees the new highlight card immediately.
chrome.commands?.onCommand?.addListener(async (command) => {
  if (command !== 'capture_region') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.sidePanel?.open({ tabId: tab.id }); // Safari-safe
  } catch {
    /* already open — fine */
  }
  await beginCapture(() => {}, tab);
});

async function openSidePanel(
  sender: chrome.runtime.MessageSender,
  highlightId?: string,
): Promise<void> {
  const tabId = sender.tab?.id;
  if (tabId == null) return;
  try {
    await chrome.sidePanel?.open({ tabId }); // Safari-safe
    if (highlightId) {
      // The side panel may take a beat to mount; retry a couple times.
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 120));
        try {
          await chrome.runtime.sendMessage({
            type: 'FOCUS_HIGHLIGHT',
            highlightId,
          });
          break;
        } catch {
          /* side panel not mounted yet, retry */
        }
      }
    }
  } catch (e) {
    console.warn('[nodx Lens] open side panel failed', e);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Marquee screenshot handoff (v0.6.0)
//
// The popup sends { type: 'START_CAPTURE' } to us. We grab the visible tab
// (activeTab permission covers it) and forward the data URL to the tab's
// content script, which handles the marquee overlay + crop + POST.
// ────────────────────────────────────────────────────────────────────────────

interface StartCaptureMessage {
  type: 'START_CAPTURE';
}

chrome.runtime.onMessage.addListener((msg: StartCaptureMessage, _sender, sendResponse) => {
  if (msg?.type !== 'START_CAPTURE') return false;
  void beginCapture(sendResponse);
  return true; // keep the channel open for the async sendResponse
});

async function beginCapture(
  sendResponse: (r: unknown) => void,
  preresolvedTab?: chrome.tabs.Tab,
): Promise<void> {
  try {
    const tab =
      preresolvedTab ??
      (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab?.id) {
      sendResponse({ ok: false, error: 'no active tab' });
      return;
    }
    // captureVisibleTab: needs <all_urls> host permission OR a fresh
    // activeTab grant. We have <all_urls> in host_permissions so this
    // works even when invoked from the side panel button (which does
    // NOT re-grant activeTab).
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    });
    if (!dataUrl) {
      sendResponse({ ok: false, error: 'empty screenshot' });
      return;
    }
    // devicePixelRatio isn't available in service workers — the content
    // script reads its own window.devicePixelRatio (see marquee.ts).
    //
    // If sendMessage fails with "Receiving end does not exist", the tab
    // is one that was open BEFORE the extension was reloaded and so
    // doesn't have a fresh content script. Inject on-demand and retry.
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'BEGIN_MARQUEE',
        dataUrl,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/receiving end does not exist/i.test(msg)) {
        try {
          const files: string[] = [];
          for (const cs of chrome.runtime.getManifest().content_scripts ?? []) {
            for (const f of cs.js ?? []) files.push(f);
          }
          if (files.length === 0) throw err;
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files,
          });
          // The injected file is a LOADER that dynamic-imports the real
          // chunks — on heavy pages that takes far longer than any fixed
          // delay. Poll until an onMessage listener exists (sendMessage
          // stops throwing), then hand over the screenshot.
          let ready = false;
          for (let i = 0; i < 20 && !ready; i++) {
            await new Promise((r) => setTimeout(r, 150));
            try {
              await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
              ready = true;
            } catch {
              /* listener not up yet — keep polling */
            }
          }
          if (!ready) throw new Error('content script never came up');
          await chrome.tabs.sendMessage(tab.id, {
            type: 'BEGIN_MARQUEE',
            dataUrl,
          });
        } catch (retryErr) {
          // Browser-internal / store pages can't be scripted at all —
          // "refresh and try again" would be misleading there.
          const rmsg =
            retryErr instanceof Error ? retryErr.message : String(retryErr);
          sendResponse({
            ok: false,
            error: /cannot access|cannot be scripted|chrome:\/\/|gallery|error page/i.test(rmsg)
              ? "This page can't be captured (browser-internal or store page). Try a regular website."
              : 'This tab was open before nodx Lens was installed/updated. Please refresh the page (Cmd/Ctrl+R) and try again.',
          });
          return;
        }
      } else {
        throw err;
      }
    }
    sendResponse({ ok: true });
  } catch (e) {
    sendResponse({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Radial menu dispatchers (v0.8.0)
//
// The content-script radial-actions ask us to open new tabs (content
// scripts can't call chrome.tabs.create) and to run vision inference
// (needs the user's Anthropic key in chrome.storage).
// ────────────────────────────────────────────────────────────────────────────

interface OpenTabMessage {
  type: 'OPEN_TAB';
  url: string;
}
interface GeneratePromptMessage {
  type: 'GENERATE_PROMPT_FROM_IMAGE';
  dataUrl: string;
}
interface GenerateImageMessage {
  type: 'GENERATE_IMAGE_FROM_PROMPT';
  prompt: string;
}
interface ShoppingQueryMessage {
  type: 'SHOPPING_QUERY_FROM_IMAGE';
  dataUrl: string;
}

chrome.runtime.onMessage.addListener(
  (
    msg: OpenTabMessage | GeneratePromptMessage | GenerateImageMessage | ShoppingQueryMessage,
    _sender,
    sendResponse,
  ) => {
    if (msg?.type === 'OPEN_TAB') {
      void chrome.tabs.create({ url: msg.url }).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg?.type === 'GENERATE_PROMPT_FROM_IMAGE') {
      void generatePromptFromImage(msg.dataUrl).then((r) => sendResponse(r));
      return true;
    }
    if (msg?.type === 'GENERATE_IMAGE_FROM_PROMPT') {
      void generateImageFromPrompt(msg.prompt).then((r) => sendResponse(r));
      return true;
    }
    if (msg?.type === 'SHOPPING_QUERY_FROM_IMAGE') {
      void shoppingQueryFromImage(msg.dataUrl).then((r) => sendResponse(r));
      return true;
    }
    return false;
  },
);

async function generatePromptFromImage(
  dataUrl: string,
): Promise<{ ok: boolean; prompt?: string; error?: string }> {
  try {
    const settings = await getSettings();
    if (!settings.apiKey && providerNeedsApiKey(settings.provider)) {
      return {
        ok: false,
        error: 'AI key not set. Open settings and paste your Anthropic key.',
      };
    }

    const b64 = dataUrl.replace(/^data:[^,]+,/, '');
    const mime = dataUrl.match(/^data:([^;]+);/)?.[1] ?? 'image/png';

    const prompt =
      "Look at this image carefully. Write a detailed, vivid image-generation prompt (English, one paragraph, 60–120 words) that captures the subject, composition, style, colours, lighting, mood, and any distinctive details. The prompt should be usable in Midjourney / DALL-E / Gemini image generation. Do NOT prefix with 'a prompt for' — just write the prompt itself.";

    // Vision call via whichever provider the user picked.
    let full = '';
    await callAI(
      settings.provider,
      settings.apiKey,
      settings.model.deepen, // deep model, not the short one — vision quality matters.
      prompt,
      (chunk) => (full += chunk),
      undefined,
      { base64: b64, mime },
    );
    const cleaned = full.trim().replace(/^"|"$/g, '').trim();
    if (!cleaned) return { ok: false, error: 'Model returned empty text.' };
    return { ok: true, prompt: cleaned };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function generateImageFromPrompt(
  prompt: string,
): Promise<{ ok: boolean; dataUrl?: string; error?: string }> {
  try {
    const settings = await getSettings();
    const img = settings.imageGen;
    if (!img?.apiKey) {
      return {
        ok: false,
        error:
          '图片生成 key 未设置。打开 ⚙ 设置，在「图片生成」区粘贴你的 Google AI key（aistudio.google.com 免费获取）。',
      };
    }
    const { dataUrl } = await generateGeminiImage(
      img.apiKey,
      img.model || 'gemini-3.1-flash-image',
      prompt,
    );
    return { ok: true, dataUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function shoppingQueryFromImage(
  dataUrl: string,
): Promise<{ ok: boolean; query?: string; error?: string }> {
  try {
    const settings = await getSettings();
    if (!settings.apiKey && providerNeedsApiKey(settings.provider)) {
      return { ok: false, error: 'AI key 未设置，打开 ⚙ 设置粘贴 Anthropic key。' };
    }

    const b64 = dataUrl.replace(/^data:[^,]+,/, '');
    const mime = dataUrl.match(/^data:([^;]+);/)?.[1] ?? 'image/png';
    const prompt =
      'Identify the single product shown in this image. Reply with ONLY a concise shopping search query — brand + product name + key attribute (e.g. "Seven Minerals aloe vera gel 12oz"). 3-8 words, no punctuation, no quotes, no explanation. If it is not obviously a buyable product, still return the best short search term for the main object.';
    let full = '';
    await callAI(
      settings.provider,
      settings.apiKey,
      settings.model.explain,
      prompt,
      (chunk) => (full += chunk),
      undefined,
      { base64: b64, mime },
    );
    const q = full
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!q) return { ok: false, error: '没认出商品。' };
    return { ok: true, query: q };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
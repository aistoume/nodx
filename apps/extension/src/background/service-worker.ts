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

import { getSettings } from '../shared/settings.js';
import { buildExplainPrompt, buildDeepenPrompt } from '../shared/prompts.js';
import { callAnthropic, callOpenAI, callGoogle } from '../shared/providers.js';
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
    if (!settings.apiKey) {
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

    let full = '';
    switch (settings.provider) {
      case 'anthropic':
        full = await callAnthropic(settings.apiKey, model, prompt, onChunk, signal);
        break;
      case 'openai':
        full = await callOpenAI(settings.apiKey, model, prompt, onChunk, signal);
        break;
      case 'google':
        full = await callGoogle(settings.apiKey, model, prompt, onChunk, signal);
        break;
    }

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
});

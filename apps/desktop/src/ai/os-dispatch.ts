/**
 * OS instruct dispatch (docs/desktop-os-actions.md M-A).
 *
 * Extends the three-platform instruct protocol (extension / Android / iOS —
 * whose vocabulary is open_url only) with two LOCAL actions:
 *
 *   {"action":"open_url",      "url":"…",            "note":"…"}
 *   {"action":"open_app",      "app":"<bundleId|name>","note":"…"}
 *   {"action":"run_shortcut",  "name":"<exact name>", "input":"…", "note":"…"}
 *
 * Grounding comes from the OS itself: the running-app list and the user's
 * Shortcuts inventory (fetched via Tauri commands). Shortcuts are the core
 * execution primitive — the AI can only name automations the user personally
 * created, and `parseDirective` re-validates the name against the inventory,
 * so hallucinated or injected shortcut names die at the parse stage.
 *
 * Execution NEVER happens here. The caller shows a confirmation card and
 * only then invokes the matching `os_*` Tauri command.
 */

import { invoke } from '@tauri-apps/api/core';
import { MODELS } from '@nodx/ai';
import { ai } from './gateway.js';
import { friendlierAiError } from './explain.js';

export interface RunningApp {
  name: string;
  bundleId: string | null;
  pid: number | null;
  frontmost: boolean;
}

export interface OsGrounding {
  apps: RunningApp[];
  shortcuts: string[];
}

export type OsDirective =
  | { action: 'open_url'; url: string; note: string }
  | { action: 'open_app'; app: string; note: string }
  | { action: 'run_shortcut'; name: string; input?: string; note: string };

export interface InstructResult {
  directive: OsDirective | null;
  /** Plain answer when the model chose to just do the task in text. */
  answer: string | null;
  inputTokens: number;
  outputTokens: number;
}

/** Same 21-site table the extension/Android instruct protocol grounds on. */
const SEARCH_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['Google Search', 'https://www.google.com/search?q='],
  ['Google Images', 'https://www.google.com/search?udm=2&q='],
  ['Google Shopping', 'https://www.google.com/search?udm=28&q='],
  ['Amazon', 'https://www.amazon.com/s?k='],
  ['eBay', 'https://www.ebay.com/sch/i.html?_nkw='],
  ['Taobao 淘宝', 'https://s.taobao.com/search?q='],
  ['JD 京东', 'https://search.jd.com/Search?keyword='],
  ['Xiaohongshu 小红书', 'https://www.xiaohongshu.com/search_result?keyword='],
  ['Temu', 'https://www.temu.com/search_result.html?search_key='],
  ['AliExpress', 'https://www.aliexpress.com/wholesale?SearchText='],
  ['Bing', 'https://www.bing.com/search?q='],
  ['YouTube', 'https://www.youtube.com/results?search_query='],
  ['Bilibili', 'https://search.bilibili.com/all?keyword='],
  ['X (Twitter)', 'https://x.com/search?q='],
  ['Reddit', 'https://www.reddit.com/search/?q='],
  ['Zhihu 知乎', 'https://www.zhihu.com/search?type=content&q='],
  ['Wikipedia', 'https://en.wikipedia.org/w/index.php?search='],
  ['arXiv', 'https://arxiv.org/search/?searchtype=all&query='],
  ['Google Scholar', 'https://scholar.google.com/scholar?q='],
  ['GitHub', 'https://github.com/search?q='],
  ['Perplexity', 'https://www.perplexity.ai/search?q='],
];

export async function fetchOsGrounding(): Promise<OsGrounding> {
  const [apps, shortcuts] = await Promise.all([
    invoke<RunningApp[]>('os_running_apps').catch(() => [] as RunningApp[]),
    invoke<string[]>('os_list_shortcuts').catch(() => [] as string[]),
  ]);
  return { apps, shortcuts };
}

/** The dispatch protocol block prepended to every desktop instruct call. */
export function buildOsProtocol(g: OsGrounding): string {
  const siteList = SEARCH_PREFIXES.map(([label, url]) => `  ${label}: ${url}`).join('\n');
  const appList = g.apps
    .map((a) => `  ${a.name}${a.bundleId ? ` (${a.bundleId})` : ''}${a.frontmost ? ' [frontmost]' : ''}`)
    .join('\n');
  const shortcutList = g.shortcuts.map((s) => `  ${s}`).join('\n');

  return `You can either ANSWER the instruction directly, OR execute exactly one action by replying with ONLY a one-line JSON and absolutely nothing else. CRITICAL: emitting the JSON is the ONLY way the action actually happens — never claim you did something unless your reply IS the JSON.

Available actions:

1. Open a web page (search / look up / open something on a website):
{"action":"open_url","url":"<search-results URL with the query filled in>","note":"<one short sentence, in the instruction's language>"}
Known site search prefixes — when the target site matches, you MUST use the exact prefix and append the URL-encoded query:
${siteList}
For a site NOT in this list, use its real search URL only if you are certain; otherwise fall back to https://www.google.com/search?q=site%3A<domain>+<query>.

2. Open or switch to a local application (the user says open/switch to/launch some app):
{"action":"open_app","app":"<bundleId if known, else app name>","note":"<one short sentence>"}
Currently running apps (prefer these bundleIds; apps not in this list can still be launched by name):
${appList || '  (none detected)'}

3. Run one of the user's OWN macOS Shortcuts (only when the instruction clearly maps to one of these EXACT names — never invent a name):
{"action":"run_shortcut","name":"<exact name from the list>","input":"<optional text to pass in>","note":"<one short sentence>"}
The user's Shortcuts:
${shortcutList || '  (none — never emit run_shortcut)'}

For every other kind of instruction (translate, explain, rewrite, extract, summarise, answer a question…), just do the task and output the result directly — no JSON.`;
}

/**
 * Three-state directive extraction, ported from the Android/extension
 * parser: whole-reply JSON → fenced JSON → JSON embedded in prose.
 * Validation is strict: unknown actions die, open_url must be http(s),
 * run_shortcut must name a shortcut that really exists.
 */
export function parseDirective(raw: string, g: OsGrounding): OsDirective | null {
  const candidates: string[] = [];
  const trimmed = raw.trim();
  candidates.push(trimmed);
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced?.[1]) candidates.push(fenced[1]);
  for (const m of raw.matchAll(/\{[^{}]*"action"\s*:\s*"(?:open_url|open_app|run_shortcut)"[^{}]*\}/g)) {
    candidates.push(m[0]);
  }

  for (const c of candidates) {
    let obj: unknown;
    try {
      obj = JSON.parse(c);
    } catch {
      continue;
    }
    if (typeof obj !== 'object' || obj === null) continue;
    const d = obj as Record<string, unknown>;
    const note = typeof d.note === 'string' ? d.note : '';

    if (d.action === 'open_url' && typeof d.url === 'string') {
      if (d.url.startsWith('https://') || d.url.startsWith('http://')) {
        return { action: 'open_url', url: d.url, note };
      }
    }
    if (d.action === 'open_app' && typeof d.app === 'string' && d.app.trim()) {
      return { action: 'open_app', app: d.app.trim(), note };
    }
    if (d.action === 'run_shortcut' && typeof d.name === 'string') {
      const name = d.name.trim();
      // Hard grounding: the shortcut must actually exist.
      if (g.shortcuts.includes(name)) {
        return {
          action: 'run_shortcut',
          name,
          input: typeof d.input === 'string' && d.input ? d.input : undefined,
          note,
        };
      }
    }
  }
  return null;
}

/**
 * Run a typed instruction over the selected text. Fast tier (Haiku) — the
 * dispatch decision is routing, not deep reasoning.
 */
export async function runOsInstruction(
  instruction: string,
  text: string,
  grounding: OsGrounding,
): Promise<InstructResult> {
  const prompt = `${buildOsProtocol(grounding)}\n\n---\nInstruction: ${instruction}\n\nText:\n${text}`;
  try {
    const r = await ai.completeText({
      prompt,
      model: MODELS.haiku,
      maxTokens: 600,
    });
    const directive = parseDirective(r.text, grounding);
    return {
      directive,
      answer: directive ? null : r.text.trim(),
      inputTokens: r.usage.inputTokens,
      outputTokens: r.usage.outputTokens,
    };
  } catch (err) {
    throw friendlierAiError(err);
  }
}

/** Execute a confirmed directive via the sanctioned Tauri executors. */
export async function executeDirective(d: OsDirective): Promise<string> {
  switch (d.action) {
    case 'open_url':
      await invoke('os_open_url', { url: d.url });
      return d.note || d.url;
    case 'open_app':
      await invoke('os_open_app', { target: d.app });
      return d.note || d.app;
    case 'run_shortcut': {
      const out = await invoke<string>('os_run_shortcut', {
        name: d.name,
        input: d.input ?? null,
      });
      return out || d.note || d.name;
    }
  }
}

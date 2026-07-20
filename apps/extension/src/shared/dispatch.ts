/**
 * Intent-dispatch protocol shared by BOTH instruct paths:
 *   - text  (service-worker custom mode: instruction + selected text)
 *   - image (marquee ✏️ instruct: instruction + screenshot region, vision)
 *
 * The model either answers directly, or emits ONE executable directive:
 *   {"action":"open_url","url":"<search results URL>","note":"<one line>"}
 * Grounded in the verified preset prefixes + the user's own wheel search
 * prefixes — models hallucinate site URL patterns otherwise (Temu taught
 * us that the 404 way).
 */

import { SEARCH_PRESETS } from './search-presets.js';
import { getWheelConfig } from './wheel.js';

/** "  Label: https://prefix" lines — presets + user wheel search actions. */
export async function sitePrefixList(): Promise<string> {
  const prefixes = new Map<string, string>();
  for (const p of SEARCH_PRESETS) prefixes.set(p.label, p.url);
  try {
    const { spokes } = await getWheelConfig();
    for (const s of spokes) {
      for (const it of [s, ...s.children]) {
        if (it.action?.kind === 'search' && it.action.urlPrefix.trim() && it.label) {
          prefixes.set(it.label, it.action.urlPrefix);
        }
      }
    }
  } catch {
    /* presets alone are fine */
  }
  return [...prefixes.entries()].map(([label, url]) => `  ${label}: ${url}`).join('\n');
}

const RULES = (list: string) => `CRITICAL: emitting this JSON is the ONLY way the page actually opens. Do not describe the action in prose, do not add any text before or after the JSON, and never claim a page was opened unless your reply IS this JSON.

Known site search prefixes — when the target site matches one of these, you MUST use the exact prefix and append the URL-encoded query (never invent a different pattern for these sites):
${list}
For a site NOT in this list, use its real search URL only if you are certain of the pattern; otherwise fall back to https://www.google.com/search?q=site%3A<domain>+<query>.
Make the query practical for that site's audience — translate or simplify it when appropriate (e.g. Chinese keywords for Taobao/JD, concise product words for shopping sites).`;

/** Text flavour: instruction applies to a selected text snippet. */
export async function buildTextDispatchProtocol(): Promise<string> {
  const list = await sitePrefixList();
  return `You can either ANSWER the instruction directly, OR execute an action:

When the instruction asks to SEARCH / look up / find / open something on a website or the web (e.g. "search this on arXiv", "在谷歌学术找找相关论文", "打开 temu 找这东西"), reply with ONLY this one-line JSON and absolutely nothing else:
{"action":"open_url","url":"<search-results URL with the query filled in>","note":"<one short sentence describing what you opened, in the instruction's language>"}
${RULES(list)}

For every other kind of instruction (translate, explain, rewrite, extract, summarise, answer a question…), just do the task and output the result directly — no JSON, no mention of this protocol.`;
}

/** Vision flavour: instruction applies to a screenshot region the user framed. */
export async function buildVisionDispatchProtocol(): Promise<string> {
  const list = await sitePrefixList();
  return `You are looking at a screenshot region the user framed. You can either ANSWER their instruction about it directly, OR execute an action:

When the instruction asks to SEARCH / find / buy / open something related to what is shown (e.g. "find it on Amazon", "淘宝搜这个", "look this up on eBay"), first IDENTIFY the main subject in the image, turn it into a concise search query (brand + product + key attribute; 3-8 words), then reply with ONLY this one-line JSON and absolutely nothing else:
{"action":"open_url","url":"<search-results URL with that query filled in>","note":"<one short sentence naming what you identified and where you opened it, in the instruction's language>"}
${RULES(list)}

For every other kind of instruction (describe, explain, read the text, translate what's shown…), just do the task and output the result directly — no JSON, no mention of this protocol.`;
}

export interface Directive {
  url: string;
  host: string;
  note?: string;
  /** Prose the model wrapped around an embedded directive, if any. */
  prose?: string;
}

function tryParse(body: string): { url: URL; note?: string } | null {
  let obj: { action?: string; url?: string; note?: string };
  try {
    obj = JSON.parse(body) as { action?: string; url?: string; note?: string };
  } catch {
    return null;
  }
  if (obj.action !== 'open_url' || typeof obj.url !== 'string') return null;
  let parsed: URL;
  try {
    parsed = new URL(obj.url);
  } catch {
    return null;
  }
  // http(s) only — never open javascript:/data:/chrome: URLs a model made up.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  return {
    url: parsed,
    note: typeof obj.note === 'string' && obj.note.trim() ? obj.note.trim() : undefined,
  };
}

/**
 * Parse a directive out of a model reply. Handles the whole reply being
 * the JSON (optionally code-fenced) AND the JSON embedded in prose (models
 * slip despite the protocol — a narrated-but-unexecuted action reads as a
 * lie, so the embedded form still runs).
 */
export function parseDirective(raw: string): Directive | null {
  let body = raw.trim();
  const fenced = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) body = fenced[1].trim();
  const whole = tryParse(body);
  if (whole) {
    return { url: whole.url.href, host: whole.url.host, note: whole.note };
  }
  for (const m of raw.matchAll(/\{[^{}]*"action"\s*:\s*"open_url"[^{}]*\}/g)) {
    const parsed = tryParse(m[0]);
    if (!parsed) continue;
    const prose = raw
      .replace(m[0], '')
      .replace(/```(?:json)?\s*```/g, '')
      .trim();
    return {
      url: parsed.url.href,
      host: parsed.url.host,
      note: parsed.note,
      ...(prose ? { prose } : {}),
    };
  }
  return null;
}

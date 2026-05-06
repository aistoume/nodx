import { marked } from 'marked';

// Synchronous mode: AI output is small enough that streaming/async parsing
// adds no value. GFM disabled by default — we don't need tables yet, and
// keeping the renderer minimal avoids surprises in TipTap's HTML import.
marked.setOptions({
  gfm: true,
  breaks: false,
});

/**
 * Convert AI-emitted markdown into HTML the TipTap editor can ingest.
 * Wraps marked.parse() so callers don't need to know it returns string|Promise.
 */
export function markdownToHtml(md: string): string {
  const out = marked.parse(md, { async: false }) as string;
  return out;
}

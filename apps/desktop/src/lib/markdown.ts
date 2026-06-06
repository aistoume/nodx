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

/**
 * Inline-only variant — renders emphasis / code / links but NOT block
 * elements (no wrapping <p>, <ul>, headings). Use inside list items or
 * spans where a block <p> would add unwanted margins.
 */
export function markdownToInlineHtml(md: string): string {
  return marked.parseInline(md, { async: false }) as string;
}

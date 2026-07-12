/**
 * Tiny Markdown → HTML renderer for LLM answers.
 *
 * Covers the subset models actually emit — **bold**, *italic*, `code`,
 * fenced code blocks, links, #-headings, bullet/numbered lists — and
 * nothing else. Input is HTML-escaped BEFORE any markup is applied, so
 * the output only ever contains tags this function itself produced
 * (safe for innerHTML).
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
}

export function mdToHtml(src: string): string {
  const lines = esc(src).split('\n');
  const out: string[] = [];
  let inCode = false;
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (list) {
      out.push(list === 'ul' ? '</ul>' : '</ol>');
      list = null;
    }
  };

  for (const raw of lines) {
    if (raw.trim().startsWith('```')) {
      closeList();
      out.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(`${raw}\n`);
      continue;
    }
    const h = raw.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      closeList();
      out.push(`<strong class="md-h">${inline(h[1]!)}</strong><br>`);
      continue;
    }
    const ul = raw.match(/^\s*[-*•]\s+(.*)$/);
    if (ul) {
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(ul[1]!)}</li>`);
      continue;
    }
    const ol = raw.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(ol[1]!)}</li>`);
      continue;
    }
    closeList();
    if (raw.trim() === '') {
      out.push('<br>');
      continue;
    }
    out.push(`${inline(raw)}<br>`);
  }
  closeList();
  if (inCode) out.push('</code></pre>');
  return out.join('');
}

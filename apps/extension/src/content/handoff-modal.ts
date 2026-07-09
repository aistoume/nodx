/**
 * "Handoff" modal — a small floating card that shows the payload the
 * user is about to hand off (a generated prompt, a screenshot, etc.),
 * confirms the destination, and only executes the clipboard + tab-open
 * after the user explicitly clicks a button.
 *
 * Why not auto-open a new tab + auto-write clipboard?
 *   1. `navigator.clipboard.write(image)` silently fails if the source
 *      document lost focus — which happens the instant we open the
 *      target tab. Ordering was fragile.
 *   2. Neither Google Shopping nor Gemini has a URL parameter for
 *      "search this image / prompt-fill". The user has to Cmd+V no
 *      matter what. Showing them the payload up-front makes that
 *      step obvious instead of a silent "wait, was anything copied?".
 *   3. Debuggable — the user can literally see the prompt before
 *      committing, and can copy manually as a backup.
 */

export interface HandoffButton {
  label: string;
  emoji?: string;
  /** Primary buttons get the orange fill; secondary get the outline. */
  primary?: boolean;
  /** Called on click. Whatever the promise resolves to, the modal closes. */
  onClick: () => Promise<void> | void;
}

interface HandoffOptions {
  title: string;
  /** Optional subtitle / instructions. */
  subtitle?: string;
  /** Image data-URL to preview alongside the text. */
  imageDataUrl?: string;
  /** Free-form text (prompt, description, etc.). Shown in a mono block. */
  body?: string;
  buttons: HandoffButton[];
}

const MODAL_ID = '__nodx_handoff_modal__';

export function showHandoffModal(opts: HandoffOptions): void {
  document.getElementById(MODAL_ID)?.remove();

  const scrim = document.createElement('div');
  scrim.id = MODAL_ID;
  Object.assign(scrim.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    background: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily:
      'system-ui, -apple-system, "PingFang SC", "Segoe UI", sans-serif',
  } as CSSStyleDeclaration);

  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#fff',
    color: '#1a1a1a',
    borderRadius: '12px',
    boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
    width: 'min(520px, 92vw)',
    maxHeight: '80vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  } as CSSStyleDeclaration);

  // Header
  const header = document.createElement('div');
  Object.assign(header.style, {
    padding: '14px 18px 8px',
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    borderBottom: '1px solid #eee',
  } as CSSStyleDeclaration);
  const title = document.createElement('div');
  title.textContent = opts.title;
  title.style.fontSize = '15px';
  title.style.fontWeight = '600';
  header.appendChild(title);
  const closeX = document.createElement('button');
  closeX.textContent = '✕';
  Object.assign(closeX.style, {
    marginLeft: 'auto',
    background: 'transparent',
    border: '0',
    fontSize: '16px',
    color: '#999',
    cursor: 'pointer',
    padding: '2px 8px',
  } as CSSStyleDeclaration);
  header.appendChild(closeX);
  card.appendChild(header);

  const body = document.createElement('div');
  Object.assign(body.style, {
    padding: '12px 18px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    fontSize: '13px',
    lineHeight: '1.5',
  } as CSSStyleDeclaration);
  card.appendChild(body);

  if (opts.subtitle) {
    const sub = document.createElement('div');
    sub.textContent = opts.subtitle;
    sub.style.color = '#666';
    sub.style.fontSize = '12px';
    body.appendChild(sub);
  }

  if (opts.imageDataUrl) {
    const img = document.createElement('img');
    img.src = opts.imageDataUrl;
    Object.assign(img.style, {
      maxWidth: '100%',
      maxHeight: '160px',
      alignSelf: 'center',
      borderRadius: '6px',
      border: '1px solid #eee',
      objectFit: 'contain',
    } as CSSStyleDeclaration);
    body.appendChild(img);
  }

  if (opts.body) {
    const pre = document.createElement('div');
    pre.textContent = opts.body;
    Object.assign(pre.style, {
      background: '#f5f5f4',
      color: '#1a1a1a',
      padding: '10px 12px',
      borderRadius: '6px',
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, "Cascadia Mono", monospace',
      fontSize: '12px',
      lineHeight: '1.55',
      maxHeight: '200px',
      overflowY: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    } as CSSStyleDeclaration);
    body.appendChild(pre);
  }

  // Footer with buttons.
  const footer = document.createElement('div');
  Object.assign(footer.style, {
    padding: '12px 18px',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    borderTop: '1px solid #eee',
    flexWrap: 'wrap',
  } as CSSStyleDeclaration);
  card.appendChild(footer);

  const close = () => scrim.remove();

  for (const b of opts.buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = (b.emoji ? b.emoji + ' ' : '') + b.label;
    Object.assign(btn.style, {
      padding: '8px 14px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer',
      fontFamily: 'inherit',
      transition: 'opacity 0.12s',
      border: b.primary ? '0' : '1px solid #d1d5db',
      background: b.primary
        ? 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)'
        : '#fff',
      color: b.primary ? '#fff' : '#1a1a1a',
    } as CSSStyleDeclaration);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await b.onClick();
      } finally {
        close();
      }
    });
    footer.appendChild(btn);
  }

  closeX.addEventListener('click', close);
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) close();
  });
  // Esc closes.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      window.removeEventListener('keydown', onKey, true);
    }
  };
  window.addEventListener('keydown', onKey, true);

  scrim.appendChild(card);
  document.documentElement.appendChild(scrim);
}

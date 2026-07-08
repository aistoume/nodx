/**
 * Save-explanation hook — packages a snippet + explanation and hands it to
 * nodx desktop via the `nodx://capture` URL scheme, with a graceful
 * fallback if the desktop app isn't installed.
 *
 * ── How the "is desktop installed?" detection works ─────────────────────
 * There's no direct browser API to ask "is this URL scheme registered?".
 * The trick we use:
 *
 *   1. We record `document.hasFocus()` before firing the deep link.
 *   2. We create an <a href="nodx://…"> and click it. If the OS knows about
 *      the scheme, the browser hands off to nodx desktop, the OS moves
 *      focus to that app, and Chrome will show a "Open nodx?" prompt or
 *      just switch. Either way, `document.hasFocus()` returns false for a
 *      moment.
 *   3. If after 800 ms our tab STILL has focus AND we STILL see this page
 *      as the "visible" one, we assume the deep link was ignored — i.e.
 *      the user doesn't have nodx installed.
 *
 * The detection is imperfect (users can dismiss the "Open?" prompt in the
 * ~800 ms window and we'd falsely conclude they don't have it) but the
 * downside of a false-negative is small: we just show a "Get nodx" toast
 * even though they already have it. No data loss, no repeated deep link.
 */

const DOWNLOAD_PAGE = 'https://aicon.solutions/nodx/';

export interface SaveTarget {
  id: string;
  text: string;
  explanation: string;
  sourceUrl: string;
  sourceTitle: string;
  capturedAt: number;
}

export type SaveOutcome =
  | { kind: 'handoff' }              // deep link fired, focus left the tab
  | { kind: 'app-missing' }          // deep link fired but nothing responded
  | { kind: 'error'; message: string };

export function buildDeepLink(target: SaveTarget): string {
  const u = new URL('nodx://capture');
  u.searchParams.set('id', target.id);
  u.searchParams.set('text', target.text);
  u.searchParams.set('explanation', target.explanation);
  u.searchParams.set('url', target.sourceUrl);
  u.searchParams.set('title', target.sourceTitle);
  u.searchParams.set('capturedAt', String(target.capturedAt));
  return u.toString();
}

/**
 * Attempt to hand the target off to the local companion app.
 * Resolves once we've either detected a hand-off (focus left) or decided
 * the app is likely missing (timeout).
 */
export function attemptSave(target: SaveTarget): Promise<SaveOutcome> {
  return new Promise((resolve) => {
    // Fire the deep link via an in-DOM anchor (more reliable than
    // location.assign in Chrome for custom schemes).
    let anchor: HTMLAnchorElement | null = null;
    try {
      anchor = document.createElement('a');
      anchor.href = buildDeepLink(target);
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
    } catch (e) {
      if (anchor) anchor.remove();
      resolve({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    // If the OS handed off, the browser tab loses focus / becomes hidden.
    let handedOff = false;
    const onBlur = () => {
      handedOff = true;
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') handedOff = true;
    };
    window.addEventListener('blur', onBlur, { once: true });
    document.addEventListener('visibilitychange', onHidden);

    setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onHidden);
      if (anchor) anchor.remove();
      resolve({ kind: handedOff ? 'handoff' : 'app-missing' });
    }, 800);
  });
}

/**
 * Open the download page in a new tab. Used from the "Get nodx" fallback
 * link when we detect the companion app isn't installed.
 */
export function openDownloadPage(): void {
  try {
    window.open(DOWNLOAD_PAGE, '_blank', 'noopener');
  } catch {
    /* window.open may be blocked; users can always visit the URL manually */
  }
}

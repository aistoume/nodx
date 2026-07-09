/**
 * Radial-menu shared helpers.
 *
 * v0.8.2 refactor: the auto-open-tab + auto-copy flow was too fragile
 * (clipboard silently failing when the source doc lost focus). The
 * radial menu now hands off through `handoff-modal.ts` which shows the
 * payload and only fires clipboard + tab-open on an explicit click. This
 * module keeps the small primitives both flows still need.
 */

/** Convert a `data:image/png;base64,...` URL to a native Blob. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}

/**
 * Copy a PNG image to the OS clipboard. Requires the `clipboardWrite`
 * permission. Uses the modern ClipboardItem API — supported in Chrome
 * 76+; MV3 minimum is way above that.
 *
 * Chrome only reliably honours this when called from inside a user-
 * gesture handler (a real click event), so callers must invoke it
 * synchronously in a button's onClick — not after a long await.
 */
export async function copyImageToClipboard(blob: Blob): Promise<void> {
  const item = new ClipboardItem({ [blob.type]: blob });
  await navigator.clipboard.write([item]);
}

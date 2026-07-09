/**
 * Screenshot handoff helpers — Chrome side of Lens's image capture flow.
 *
 * Flow:
 *   1. User picks "📸 Screenshot" from the popup (or hits the Alt+Shift+S
 *      keyboard command, if bound).
 *   2. Service worker calls chrome.tabs.captureVisibleTab() → data URL.
 *   3. Data URL is sent to the tab's content script, which paints a full-
 *      viewport overlay of it and lets the user draw a marquee.
 *   4. On mouse-up, content script crops the region via <canvas> and calls
 *      postCaptureToNodx() with the PNG blob + page metadata.
 *   5. That helper POSTs base64 JSON to nodx desktop's in-proc gateway at
 *      http://127.0.0.1:8787/v1/capture-image.
 *
 * Everything is client-only — the image never leaves the user's machine.
 */

const NODX_ENDPOINT = 'http://127.0.0.1:8787/v1/capture-image';

export interface CaptureMeta {
  sourceUrl: string;
  sourceTitle: string;
  /** Optional caption (blank for pure image captures). */
  text?: string;
  /** Original crop-region width, in device pixels. */
  imageWidth: number;
  /** Original crop-region height, in device pixels. */
  imageHeight: number;
}

export interface CaptureResult {
  ok: boolean;
  /** id assigned by nodx desktop (or undefined on failure). */
  id?: string;
  /** Absolute filesystem path where nodx stored the image. */
  imagePath?: string;
  /** Populated when ok === false. */
  error?: string;
  /**
   * True when the failure looks like "nodx desktop isn't running / installed".
   * The caller can decide to nudge the user toward the install page.
   */
  appMissing?: boolean;
}

/**
 * Turn a `data:image/png;base64,...` URL into the pure base64 payload we
 * POST to nodx. We strip the prefix ourselves so the desktop side can
 * accept both forms — but sending the pure form keeps the JSON smaller.
 */
function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

/**
 * POST the cropped PNG to nodx desktop. Resolves with the desktop-side id
 * on success; distinguishes "app missing / not running" from real errors
 * so the caller can pop the download-nodx toast for the former.
 */
export async function postCaptureToNodx(
  pngDataUrl: string,
  meta: CaptureMeta,
): Promise<CaptureResult> {
  const imageBase64 = stripDataUrlPrefix(pngDataUrl);

  // Fetch with a short timeout: nodx runs locally, if it's up it responds
  // in <100 ms; anything over 4 s means it's not running.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(NODX_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        imageBase64,
        imageMime: 'image/png',
        imageWidth: meta.imageWidth,
        imageHeight: meta.imageHeight,
        text: meta.text ?? '',
        sourceUrl: meta.sourceUrl,
        sourceTitle: meta.sourceTitle,
        capturedAt: Date.now(),
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `nodx returned HTTP ${res.status}`,
      };
    }
    const j = (await res.json()) as { id?: string; imagePath?: string };
    return { ok: true, id: j.id, imagePath: j.imagePath };
  } catch (e) {
    // fetch aborts / network refusals both land here. Both are consistent
    // with "nodx desktop isn't running" for our purposes.
    return {
      ok: false,
      appMissing: true,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Crop a data-URL screenshot to the given viewport rect. Returns a fresh
 * data URL. Uses an OffscreenCanvas when available (faster off the main
 * thread) and falls back to a DOM canvas otherwise.
 *
 * `rect` is in CSS pixels (matching mouse coordinates); the source
 * screenshot from chrome.tabs.captureVisibleTab is in device pixels, so
 * we scale by `devicePixelRatio` (also passed in — we can't read the
 * *tab's* DPR from the service worker, so the content script tells us).
 */
export async function cropDataUrl(
  dataUrl: string,
  rect: { x: number; y: number; w: number; h: number },
  dpr: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl);
  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sw = Math.max(1, Math.round(rect.w * dpr));
  const sh = Math.max(1, Math.round(rect.h * dpr));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D context unavailable');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: sw,
    height: sh,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to decode screenshot'));
    img.src = src;
  });
}

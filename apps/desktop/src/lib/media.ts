/**
 * Media URL helpers — captured / generated images live as files under the
 * app-data `media/` dir and are served by the in-proc gateway at
 * `GET /media/{filename}`. Documents embed them as plain <img src> pointing
 * at that URL (stable across launches — the port is fixed at 8787).
 */

const MEDIA_BASE = 'http://127.0.0.1:8787/media';

/** Display / embed URL for a media file (filename only, no path). */
export function mediaUrl(fileName: string): string {
  return `${MEDIA_BASE}/${encodeURIComponent(fileName)}`;
}

/** Extract the media filename from an absolute imagePath stored in the DB. */
export function mediaFileFromPath(imagePath: string): string | null {
  const base = imagePath.split('/').pop();
  return base && base.length > 0 ? base : null;
}

/**
 * HTML block for embedding a media image into a thinking document (TipTap
 * ingests this via appendToDocument). Caption is optional and rendered as a
 * muted paragraph under the image.
 */
export function mediaImageHtml(fileName: string, caption?: string): string {
  const img = `<img src="${mediaUrl(fileName)}" alt="${escapeHtml(caption ?? '')}">`;
  return caption
    ? `${img}<p><em>${escapeHtml(caption)}</em></p>`
    : img;
}

/**
 * Shrink an AI-bound image: vision models cap out around ~1.6k px and
 * Anthropic hard-rejects >10MB payloads — full-res Retina captures from
 * Lens can blow past that. Downscale to ≤1568px + JPEG (white matte, no
 * alpha) cuts the payload ~100× with no quality the model can use lost.
 * Stored media files are untouched — this only shapes the API payload.
 * On any decode failure the original passes through unchanged.
 */
export async function visionPayload(
  base64: string,
  mime: string,
): Promise<{ base64: string; mime: string }> {
  const img = new Image();
  const loaded = new Promise<boolean>((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
  });
  img.src = `data:${mime};base64,${base64}`;
  if (!(await loaded)) return { base64, mime };
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = Math.min(1, 1568 / longest);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { base64, mime };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return { base64: dataUrl.replace(/^data:[^,]+,/, ''), mime: 'image/jpeg' };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

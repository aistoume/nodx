/**
 * Marquee-selection overlay for nodx Lens screenshots.
 *
 * When the service worker sends us a { type: 'BEGIN_MARQUEE', dataUrl,
 * dpr } message, we paint a fixed full-viewport canvas showing the
 * screenshot, dim everything, and let the user drag a rectangle. On
 * mouse-up we crop that rect out of the raw screenshot and hand it off
 * to postCaptureToNodx().
 *
 * UX notes:
 *   - Esc / right-click cancels without sending.
 *   - We freeze scroll while the overlay is up so the coordinates don't
 *     drift.
 *   - The overlay eats every pointer event (capture phase) so page
 *     handlers can't interfere.
 */

import { cropDataUrl, postCaptureToNodx } from '../shared/capture.js';
import {
  addHighlight,
  appendQA,
  type Highlight,
  updateHighlight,
  updateQA,
} from '../shared/highlights.js';
import { drawHighlight, syncHighlightsFromStorage } from './highlights-layer.js';
import { showRadialMenu } from './radial-menu.js';
import { showHandoffModal } from './handoff-modal.js';
import {
  copyImageToClipboard,
  dataUrlToBlob,
} from '../shared/radial-actions.js';
import { getSettings } from '../shared/settings.js';
import { callAnthropic } from '../shared/providers.js';

const OVERLAY_ID = '__nodx_marquee_overlay__';
const TOAST_ID = '__nodx_marquee_toast__';

interface StartMessage {
  type: 'BEGIN_MARQUEE';
  dataUrl: string;
}

interface MarqueeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Install the marquee runtime once. Idempotent. */
export function installMarqueeListener(): void {
  chrome.runtime.onMessage.addListener((msg: StartMessage, _sender, sendResponse) => {
    if (msg?.type !== 'BEGIN_MARQUEE') return false;
    if (document.getElementById(OVERLAY_ID)) {
      // Already active — treat repeat message as a no-op ack.
      sendResponse({ ok: true, alreadyOpen: true });
      return false;
    }
    // devicePixelRatio: the visible-tab screenshot from chrome.tabs.
    // captureVisibleTab is in device pixels; our mouse coordinates are
    // in CSS pixels. Read the ratio at capture time (may change on
    // window drag between monitors, but we only need it once).
    const dpr = window.devicePixelRatio || 1;
    startMarquee(msg.dataUrl, dpr).catch((err) => {
      console.error('[nodx Lens] marquee failed', err);
      showToast(`Screenshot failed: ${err instanceof Error ? err.message : err}`);
    });
    sendResponse({ ok: true });
    return false;
  });
}

async function startMarquee(dataUrl: string, dpr: number): Promise<void> {
  const overlay = buildOverlay(dataUrl);
  document.documentElement.appendChild(overlay);
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';

  await new Promise<void>((resolve) => {
    let dragging = false;
    let start = { x: 0, y: 0 };
    let rect: MarqueeRect | null = null;
    const marker = overlay.querySelector<HTMLDivElement>('.nodx-marker')!;

    const cleanup = () => {
      document.documentElement.style.overflow = prevOverflow;
      overlay.remove();
      resolve();
    };

    const cancel = () => {
      cleanup();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      start = { x: e.clientX, y: e.clientY };
      rect = { x: start.x, y: start.y, w: 0, h: 0 };
      marker.style.display = 'block';
      updateMarker(marker, rect);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging || !rect) return;
      e.preventDefault();
      const x = Math.min(start.x, e.clientX);
      const y = Math.min(start.y, e.clientY);
      const w = Math.abs(e.clientX - start.x);
      const h = Math.abs(e.clientY - start.y);
      rect = { x, y, w, h };
      updateMarker(marker, rect);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!dragging || !rect) return;
      dragging = false;
      e.preventDefault();
      e.stopPropagation();
      const done = rect;
      cleanup();
      if (done.w < 8 || done.h < 8) {
        showToast('Selection too small — try again.');
        return;
      }
      void handleCrop(dataUrl, dpr, done);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };

    const onContext = (e: Event) => {
      e.preventDefault();
      cancel();
    };

    overlay.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('keydown', onKeyDown, true);
    overlay.addEventListener('contextmenu', onContext, true);
  });
}

async function handleCrop(
  dataUrl: string,
  dpr: number,
  rect: MarqueeRect,
): Promise<void> {
  try {
    const cropped = await cropDataUrl(dataUrl, rect, dpr);

    // Anchor the radial menu at the centre of the just-selected rect —
    // that's where the user's eyes are and where the mouse just was.
    const menuX = rect.x + rect.w / 2;
    const menuY = rect.y + rect.h / 2;

    const choice = await showRadialMenu(menuX, menuY);
    if (choice === 'cancel') return;

    switch (choice) {
      case 'save':
        await runSave(cropped, rect);
        break;
      case 'explain':
        // 直接把图丢给 Sonnet 问「这是什么」，答案流回侧栏卡片。
        // 保留完整的 highlight 保存链路（黄框、桌面同步）以便日后复看。
        await runExplain(cropped, rect);
        break;
      case 'search':
        // 放大镜二级·搜索：有网页原图 → Lens 视觉搜；否则 AI 认图 → 图片搜(udm=2)。
        runSearch(cropped.dataUrl, rect);
        break;
      case 'shopping-google':
        // 购物二级·Google Shopping：AI 认图 → Shopping(udm=28)。
        runShopping(cropped.dataUrl, 'google');
        break;
      case 'shopping-amazon':
        // 购物二级·Amazon：AI 认图 → amazon.com/s?k=。
        runShopping(cropped.dataUrl, 'amazon');
        break;
      case 'generate': {
        // Sonnet writes a subject description from the screenshot; we then
        // ask the image model for ONE image laid out as a 2×2 grid — four
        // quadrants, SAME subject, four different styles (one is a real,
        // buyable product shot). The model does the whole layout in a
        // single call — we do NOT render four images and stitch them.
        const busy = showToast(
          'Sonnet 正在写生成 prompt… (15-40s)',
          { spinner: true, persistent: true },
        );
        let base = '';
        try {
          base = await generatePromptViaServiceWorker(cropped.dataUrl);
          const gridPrompt = `Create ONE single image composed as a clean 2×2 grid of four equal quadrants. Each quadrant shows the SAME subject rendered in a different visual style. Keep the subject identical across all four quadrants.

Subject: ${base}

- Top-left quadrant: a realistic e-commerce PRODUCT PHOTOGRAPH of the subject as a physical, purchasable object on a plain seamless white studio background, soft even lighting, sharp focus, realistic materials.
- Top-right quadrant: a hand-drawn ink-and-watercolour illustration.
- Bottom-left quadrant: a polished 3D render with soft global illumination and subtle reflections.
- Bottom-right quadrant: minimalist black line art on a plain white background, a few clean strokes, no shading.

Lay the four quadrants out as an even, clearly separated 2×2 grid. Keep it a small, compact graphic.`;
          busy.update('🎨 Gemini 出图中…（一张图·2×2 四格）');
          const raw = await generateImageViaServiceWorker(gridPrompt);
          // The user wants a small, low-res graphic — downscale before we
          // show / save / store it (also keeps it small for chrome.storage).
          const imageDataUrl = await downscaleDataUrl(raw, 640);
          busy.close();
          showImageResultModal(imageDataUrl, gridPrompt);
        } catch (e) {
          busy.close();
          const msg = e instanceof Error ? e.message : String(e);
          console.error('[nodx Lens] generate failed:', e);
          showToast(`生成失败: ${msg}`);
          // If we at least got the base prompt, offer the manual hand-off
          // (this also keeps showGenerateHandoff referenced).
          if (base) showGenerateHandoff(cropped.dataUrl, base);
        }
        break;
      }
    }
  } catch (e) {
    showToast(`Failed: ${e instanceof Error ? e.message : e}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Shopping / Generate handoff modals (v0.8.2)
// ────────────────────────────────────────────────────────────────────────────

/**
 * The shopping handoff: modal shows a preview of the crop and offers to
 * copy the image + open Google Shopping / Google Lens in one click.
 * Copy + tab-open happen inside the same click handler so `clipboard.write`
 * still has user-activation (Chrome will silently drop it otherwise).
 */
/**
 * 放大镜·搜索：以图搜。框选区域下面若是网页真实 <img>，用它的 URL 直接开
 * Google Lens（视觉搜索）；否则让 Sonnet 认出主体、再用文字去 Google 图片
 * 搜（udm=2）兜底。
 */
function runSearch(dataUrl: string, rect: MarqueeRect): void {
  const imgSrc = findImageSrcAt(rect.x + rect.w / 2, rect.y + rect.h / 2);
  if (imgSrc) {
    window.open(
      `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imgSrc)}`,
      '_blank',
      'noopener,noreferrer',
    );
    showToast('已用原图打开 Google Lens（视觉搜索）');
    return;
  }
  aiSearchOpen(dataUrl, 'https://www.google.com/search?udm=2&q=', '已在 Google 图片搜');
}

/**
 * 购物：Sonnet 认出商品 → 用关键词打开购物站（Google Shopping 或 Amazon）。
 */
function runShopping(dataUrl: string, site: 'google' | 'amazon'): void {
  if (site === 'google') {
    aiSearchOpen(
      dataUrl,
      'https://www.google.com/search?udm=28&q=',
      '已在 Google Shopping 搜',
    );
  } else {
    aiSearchOpen(dataUrl, 'https://www.amazon.com/s?k=', '已在 Amazon 搜');
  }
}

/**
 * Shared: open a blank tab synchronously (inside the click gesture), have
 * Sonnet name the image, then navigate the tab to `${urlPrefix}<query>`.
 * A post-await window.open would be blocked as a popup.
 */
function aiSearchOpen(dataUrl: string, urlPrefix: string, okPrefix: string): void {
  const w = window.open('about:blank', '_blank');
  const busy = showToast('识别中… (3-8s)', { spinner: true, persistent: true });
  void (async () => {
    try {
      const q = await generateShoppingQueryViaServiceWorker(dataUrl);
      busy.close();
      const url = urlPrefix + encodeURIComponent(q);
      if (w) w.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
      showToast(`${okPrefix}「${q}」`);
    } catch (e) {
      busy.close();
      if (w) w.close();
      showToast(`识别失败: ${e instanceof Error ? e.message : e}`);
    }
  })();
}

/**
 * If the point (viewport CSS px) lands on — or inside — a real <img> with
 * a public http(s) URL, return that URL. Lets the shopping hand-off give
 * Google Lens a directly-searchable image instead of forcing a paste.
 */
function findImageSrcAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const img =
    el instanceof HTMLImageElement
      ? el
      : (el.closest('img') as HTMLImageElement | null) ??
        el.querySelector('img');
  const src = img?.currentSrc || img?.src || '';
  return /^https?:\/\//.test(src) ? src : null;
}

/**
 * The generate handoff: shows the Sonnet-generated prompt in a scrollable
 * block, offers a "Copy prompt + open Gemini" button plus a raw copy
 * button and a Midjourney link. The user sees exactly what will be sent,
 * so there's no more "did the copy work?" mystery.
 */
function showGenerateHandoff(dataUrl: string, prompt: string): void {
  /**
   * Modern AI chat sites accept `?q=<encoded>` in the landing URL and
   * pre-fill the composer with that text. The user just has to hit
   * Enter after the page loads — no manual paste required.
   *
   * URL length limit: Chrome accepts URLs up to ~2 MB, and a typical
   * Sonnet prompt is <2 KB after encoding — well within any bound.
   */
  const buildUrl = (base: string, param: string): string => {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}${param}=${encodeURIComponent(prompt)}`;
  };

  const copyAndOpen = async (targetUrl: string | null, autofilled: boolean) => {
    // Keep the copy as belt-and-suspenders backup: even when the URL
    // auto-fills, the user might still want to paste it into a native
    // app / editor later.
    try {
      await navigator.clipboard.writeText(prompt);
    } catch (e) {
      // Not fatal when the URL param carries the payload — log and move on.
      console.warn('[nodx Lens] generate clipboard write failed:', e);
    }
    if (targetUrl) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      showToast(
        autofilled
          ? 'Prompt 已填入 · 到新页面按 Enter 提交'
          : 'Prompt 已复制 · 在新页面 Cmd/Ctrl+V 粘贴',
      );
    } else {
      showToast('Prompt 已复制到剪贴板');
    }
  };

  showHandoffModal({
    title: '🎨 Sonnet 写好了生成 prompt',
    subtitle:
      '挑一个目标：Gemini / ChatGPT / Claude 都会把 prompt 自动填进输入框，你打开后按 Enter 就发。「只复制」把 prompt 放剪贴板，拿去 Midjourney、DALL-E 之类。',
    imageDataUrl: dataUrl,
    body: prompt,
    buttons: [
      {
        emoji: '📋',
        label: '只复制 prompt',
        onClick: () => copyAndOpen(null, false),
      },
      {
        emoji: '🌈',
        label: 'Gemini',
        onClick: () =>
          copyAndOpen(buildUrl('https://gemini.google.com/app', 'q'), true),
      },
      {
        emoji: '🎨',
        label: 'ChatGPT',
        primary: true,
        onClick: () =>
          copyAndOpen(buildUrl('https://chatgpt.com/', 'q'), true),
      },
      { label: '取消', onClick: () => {} },
    ],
  });
}

/**
 * Result modal for the "🎨 generate" action. Shows the Gemini-rendered
 * image large with PERSISTENT actions (download / copy / send to nodx
 * desktop) — unlike showHandoffModal, clicking an action does NOT close
 * the card, so the user can download AND send in one sitting.
 */
function showImageResultModal(imageDataUrl: string, prompt: string): void {
  const MODAL_ID = '__nodx_image_result_modal__';
  document.getElementById(MODAL_ID)?.remove();

  const scrim = document.createElement('div');
  scrim.id = MODAL_ID;
  Object.assign(scrim.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, -apple-system, "PingFang SC", "Segoe UI", sans-serif',
  } as CSSStyleDeclaration);

  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#fff',
    color: '#1a1a1a',
    borderRadius: '12px',
    boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
    width: 'min(560px, 94vw)',
    maxHeight: '88vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  } as CSSStyleDeclaration);

  const header = document.createElement('div');
  Object.assign(header.style, {
    padding: '14px 18px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderBottom: '1px solid #eee',
  } as CSSStyleDeclaration);
  const title = document.createElement('div');
  title.textContent = '🎨 生成完成';
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
  } as CSSStyleDeclaration);
  card.appendChild(body);

  const img = document.createElement('img');
  img.src = imageDataUrl;
  Object.assign(img.style, {
    maxWidth: '100%',
    maxHeight: '52vh',
    alignSelf: 'center',
    borderRadius: '8px',
    border: '1px solid #eee',
    objectFit: 'contain',
  } as CSSStyleDeclaration);
  body.appendChild(img);

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '查看生成 prompt';
  Object.assign(summary.style, {
    cursor: 'pointer',
    fontSize: '12px',
    color: '#666',
  } as CSSStyleDeclaration);
  details.appendChild(summary);
  const pre = document.createElement('div');
  pre.textContent = prompt;
  Object.assign(pre.style, {
    marginTop: '6px',
    background: '#f5f5f4',
    padding: '10px 12px',
    borderRadius: '6px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '12px',
    lineHeight: '1.55',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '160px',
    overflowY: 'auto',
  } as CSSStyleDeclaration);
  details.appendChild(pre);
  body.appendChild(details);

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

  const close = () => {
    scrim.remove();
    window.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  window.addEventListener('keydown', onKey, true);

  const mkBtn = (
    label: string,
    primary: boolean,
    onClick: () => void | Promise<void>,
  ): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: '8px 14px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer',
      fontFamily: 'inherit',
      border: primary ? '0' : '1px solid #d1d5db',
      background: primary
        ? 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)'
        : '#fff',
      color: primary ? '#fff' : '#1a1a1a',
    } as CSSStyleDeclaration);
    btn.addEventListener('click', async () => {
      const prev = btn.textContent;
      btn.disabled = true;
      try {
        await onClick();
      } catch (e) {
        showToast(`失败: ${e instanceof Error ? e.message : e}`);
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });
    return btn;
  };

  footer.appendChild(
    mkBtn('⬇ 下载', true, () => {
      const a = document.createElement('a');
      a.href = imageDataUrl;
      a.download = `nodx-gen-${Date.now()}.png`;
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
    }),
  );
  footer.appendChild(
    mkBtn('📋 复制图', false, async () => {
      const blob = await dataUrlToBlob(imageDataUrl);
      await copyImageToClipboard(blob);
      showToast('图片已复制到剪贴板');
    }),
  );
  footer.appendChild(
    mkBtn('📤 发到 nodx', false, async () => {
      const result = await postCaptureToNodx(imageDataUrl, {
        sourceUrl: location.href,
        sourceTitle: document.title,
        imageWidth: img.naturalWidth || 0,
        imageHeight: img.naturalHeight || 0,
      });
      if (result.ok) showToast('✓ 已发送到 nodx desktop');
      else if (result.appMissing) showToast('未检测到 nodx 桌面版');
      else showToast(`发送失败: ${result.error ?? '?'}`);
    }),
  );
  footer.appendChild(
    mkBtn('💾 存到侧栏', false, async () => {
      const highlight: Highlight = {
        id: crypto.randomUUID(),
        url: location.href,
        pageTitle: document.title,
        createdAt: Date.now(),
        // Generated images have no page region — zeros + the `generated`
        // flag tell the highlight layer to skip drawing a box.
        region: { x: 0, y: 0, width: 0, height: 0, documentHeight: 0 },
        thumbnailDataUrl: imageDataUrl,
        imageWidth: img.naturalWidth || 0,
        imageHeight: img.naturalHeight || 0,
        qa: [],
        syncedToNodx: false,
        generated: true,
      };
      await addHighlight(highlight);
      chrome.runtime.sendMessage({
        type: 'OPEN_SIDE_PANEL',
        highlightId: highlight.id,
      });
      showToast('✓ 已存到 nodx Lens 侧栏');
    }),
  );
  footer.appendChild(mkBtn('关闭', false, close));

  closeX.addEventListener('click', close);
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) close();
  });

  scrim.appendChild(card);
  document.documentElement.appendChild(scrim);
}

/**
 * Ask the service worker to run Sonnet vision → detailed image-gen
 * prompt. The SW owns the API key + provider fanout, so we just pass
 * the data URL and get back a string.
 */
async function generatePromptViaServiceWorker(dataUrl: string): Promise<string> {
  const res = (await chrome.runtime.sendMessage({
    type: 'GENERATE_PROMPT_FROM_IMAGE',
    dataUrl,
  })) as { ok: boolean; prompt?: string; error?: string };
  if (!res?.ok || !res.prompt) {
    throw new Error(res?.error ?? 'Sonnet 没返回 prompt');
  }
  return res.prompt;
}

/**
 * Ask the service worker to render the prompt into an image via the Gemini
 * image model. The SW owns the Google image key (settings.imageGen), so we
 * just pass the prompt string and get back a data URL.
 */
async function generateImageViaServiceWorker(prompt: string): Promise<string> {
  const res = (await chrome.runtime.sendMessage({
    type: 'GENERATE_IMAGE_FROM_PROMPT',
    prompt,
  })) as { ok: boolean; dataUrl?: string; error?: string };
  if (!res?.ok || !res.dataUrl) {
    throw new Error(res?.error ?? 'Gemini 没返回图片');
  }
  return res.dataUrl;
}

/**
 * Ask the service worker to have Sonnet name the product in the image and
 * return a short shopping search query (for Google Shopping udm=28).
 */
async function generateShoppingQueryViaServiceWorker(dataUrl: string): Promise<string> {
  const res = (await chrome.runtime.sendMessage({
    type: 'SHOPPING_QUERY_FROM_IMAGE',
    dataUrl,
  })) as { ok: boolean; query?: string; error?: string };
  if (!res?.ok || !res.query) {
    throw new Error(res?.error ?? '没认出商品');
  }
  return res.query;
}

/**
 * Downscale a data URL so its longest edge is at most `maxEdge` px. The
 * generate flow uses this to keep the 2×2 grid a small, low-res graphic —
 * the user doesn't need a huge hi-res image, and a smaller PNG also fits
 * comfortably inside chrome.storage when saved to the side panel.
 */
async function downscaleDataUrl(dataUrl: string, maxEdge: number): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const longest = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = longest > maxEdge ? maxEdge / longest : 1;
      if (scale >= 1) {
        resolve(dataUrl);
        return;
      }
      const w = Math.round(image.naturalWidth * scale);
      const h = Math.round(image.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(image, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

/**
 * The "explain" branch: identical setup to `runSave` (create a Highlight,
 * open side panel, sync to desktop) but ALSO auto-asks Sonnet vision
 * "这是什么？" and streams the answer into the highlight's QA log
 * so the side panel shows the answer streaming in as it renders.
 *
 * We drive the Anthropic call from the content script (not the service
 * worker) because we're already writing to chrome.storage per chunk to
 * make the streaming visible — a service-worker round-trip per chunk
 * would just add latency for no benefit.
 */
async function runExplain(
  cropped: { dataUrl: string; width: number; height: number },
  rect: MarqueeRect,
): Promise<void> {
  // 1) Create the highlight + paint the yellow box (same as save).
  const highlight: Highlight = {
    id: crypto.randomUUID(),
    url: location.href,
    pageTitle: document.title,
    createdAt: Date.now(),
    region: {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.w,
      height: rect.h,
      documentHeight: document.documentElement.scrollHeight,
    },
    thumbnailDataUrl: cropped.dataUrl,
    imageWidth: cropped.width,
    imageHeight: cropped.height,
    qa: [],
    syncedToNodx: false,
  };
  await addHighlight(highlight);
  drawHighlight(highlight);

  // 2) Open side panel so user watches the streaming answer land.
  chrome.runtime.sendMessage({
    type: 'OPEN_SIDE_PANEL',
    highlightId: highlight.id,
  });

  // 3) Seed the auto-question in streaming state, then kick off Sonnet.
  const question = '这是什么？简洁回答（2–4 句），关键数字/文字精确引用。';
  const seed = await appendQA(highlight.url, highlight.id, question);
  if (!seed) return;

  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      throw new Error('AI key 未设置 —— 打开 ⚙ 设置粘贴你的 Anthropic API key。');
    }
    if (settings.provider !== 'anthropic') {
      throw new Error(
        '图片解释目前只支持 Anthropic (Sonnet vision)。⚙ 设置里切一下 provider。',
      );
    }
    const b64 = cropped.dataUrl.replace(/^data:[^,]+,/, '');
    const mime =
      cropped.dataUrl.match(/^data:([^;]+);/)?.[1] ?? 'image/png';

    let full = '';
    await callAnthropic(
      settings.apiKey,
      settings.model.explain,
      question,
      (chunk) => {
        full += chunk;
        // Throttle: chrome.storage.local writes are batched by Chrome
        // itself, so writing per-chunk is fine in practice. If it ever
        // becomes a bottleneck we can debounce here.
        void updateQA(highlight.url, highlight.id, seed.qaId, {
          answer: full,
          streaming: true,
        });
      },
      undefined,
      { base64: b64, mime },
    );
    await updateQA(highlight.url, highlight.id, seed.qaId, {
      answer: full,
      streaming: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[nodx Lens] explain failed:', err);
    await updateQA(highlight.url, highlight.id, seed.qaId, {
      answer: '',
      streaming: false,
      error: msg,
    });
  }

  // 4) Fire-and-forget desktop sync. Guard the storage read in case the
  //    extension was reloaded during the Sonnet call above.
  if (!isChromeContextAlive()) return;
  try {
    const { syncToNodx = true } = await chrome.storage.local.get('syncToNodx');
    if (syncToNodx) void forwardToDesktop(highlight);
  } catch (e) {
    if (!isContextInvalidatedError(e)) throw e;
  }

  void syncHighlightsFromStorage();
}

/**
 * The "save" branch: create a Highlight, paint the yellow box on the
 * page, open the side panel, and (if the user hasn't disabled it)
 * forward the screenshot to nodx desktop. Extracted so the radial
 * menu dispatcher stays flat.
 */
async function runSave(
  cropped: { dataUrl: string; width: number; height: number },
  rect: MarqueeRect,
): Promise<void> {
  const highlight: Highlight = {
    id: crypto.randomUUID(),
    url: location.href,
    pageTitle: document.title,
    createdAt: Date.now(),
    region: {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.w,
      height: rect.h,
      documentHeight: document.documentElement.scrollHeight,
    },
    thumbnailDataUrl: cropped.dataUrl,
    imageWidth: cropped.width,
    imageHeight: cropped.height,
    qa: [],
    syncedToNodx: false,
  };
  await addHighlight(highlight);
  drawHighlight(highlight);

  chrome.runtime.sendMessage({
    type: 'OPEN_SIDE_PANEL',
    highlightId: highlight.id,
  });

  const { syncToNodx = true } = await chrome.storage.local.get('syncToNodx');
  if (syncToNodx) void forwardToDesktop(highlight);

  void syncHighlightsFromStorage();
}

/**
 * Forward the highlight's cropped image to nodx desktop (POST /v1/capture-
 * image on 127.0.0.1:8787). Runs in the background — the side panel
 * shows the card either way. On success we flip syncedToNodx = true so
 * the side panel can show a green badge.
 */
async function forwardToDesktop(highlight: Highlight): Promise<void> {
  // Guard: if the extension was reloaded while `handleCrop` was awaiting
  // the (potentially seconds-long) crop + Sonnet round-trip, chrome.*
  // API references are invalidated. Detect and bail before making noise.
  if (!isChromeContextAlive()) return;

  const result = await postCaptureToNodx(highlight.thumbnailDataUrl, {
    sourceUrl: highlight.url,
    sourceTitle: highlight.pageTitle,
    imageWidth: highlight.imageWidth,
    imageHeight: highlight.imageHeight,
  });
  if (result.ok) {
    // updateHighlight touches chrome.storage.local — same invalidation
    // risk. Swallow so the user's save flow doesn't look failed even
    // when the underlying push already succeeded.
    if (!isChromeContextAlive()) return;
    try {
      await updateHighlight({
        id: highlight.id,
        url: highlight.url,
        syncedToNodx: true,
        ...(result.id ? { syncedAttentionId: result.id } : {}),
      });
    } catch (e) {
      if (!isContextInvalidatedError(e)) throw e;
    }
  } else if (!result.appMissing) {
    // Surface real errors (auth / gateway crash) via the transient toast.
    showToast(`nodx desktop sync failed: ${result.error ?? '?'}`);
  }
  // appMissing = user's desktop is off; silent — no need to bug them.
}

/**
 * Cheap runtime check: `chrome.runtime.id` becomes undefined the moment
 * the extension is unloaded / reloaded, and every chrome.* API call from
 * this now-orphaned content script will throw. Callers use this to skip
 * the offending call entirely instead of racing the error.
 */
function isChromeContextAlive(): boolean {
  try {
    return !!chrome?.runtime?.id;
  } catch {
    return false;
  }
}

function isContextInvalidatedError(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e ?? '');
  return msg.includes('Extension context invalidated');
}

// ────────────────────────────────────────────────────────────────────────────
// DOM helpers
// ────────────────────────────────────────────────────────────────────────────

function buildOverlay(dataUrl: string): HTMLDivElement {
  const el = document.createElement('div');
  el.id = OVERLAY_ID;
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    cursor: 'crosshair',
    // Backdrop = the raw screenshot with a dim scrim on top; the marker
    // will "cut out" the selected region visually.
    background: `#000 url(${dataUrl}) center/100% 100% no-repeat`,
    userSelect: 'none',
  } as CSSStyleDeclaration);

  const dim = document.createElement('div');
  Object.assign(dim.style, {
    position: 'absolute',
    inset: '0',
    background: 'rgba(0,0,0,0.35)',
    pointerEvents: 'none',
  } as CSSStyleDeclaration);
  el.appendChild(dim);

  const marker = document.createElement('div');
  marker.className = 'nodx-marker';
  Object.assign(marker.style, {
    position: 'absolute',
    display: 'none',
    border: '2px solid #f59e0b',
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
    background: 'transparent',
    pointerEvents: 'none',
    left: '0px',
    top: '0px',
    width: '0px',
    height: '0px',
  } as CSSStyleDeclaration);
  el.appendChild(marker);

  const hint = document.createElement('div');
  hint.textContent = 'Drag to select · Esc to cancel';
  Object.assign(hint.style, {
    position: 'absolute',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(24,24,27,0.85)',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '8px 14px',
    borderRadius: '6px',
    pointerEvents: 'none',
    letterSpacing: '0.02em',
  } as CSSStyleDeclaration);
  el.appendChild(hint);

  return el;
}

function updateMarker(marker: HTMLDivElement, rect: MarqueeRect): void {
  marker.style.left = `${rect.x}px`;
  marker.style.top = `${rect.y}px`;
  marker.style.width = `${rect.w}px`;
  marker.style.height = `${rect.h}px`;
}

// ────────────────────────────────────────────────────────────────────────────
// Toast
// ────────────────────────────────────────────────────────────────────────────

interface ToastOptions {
  transient?: boolean;
  /**
   * When true the toast stays until the caller manually calls the
   * returned handle's `.close()`. Used for long-running operations
   * (Sonnet vision takes 15-40s and we don't want the toast to
   * evaporate mid-inference).
   */
  persistent?: boolean;
  withDownloadLink?: boolean;
  /** Prepend a small spinner. Only meaningful with `persistent`. */
  spinner?: boolean;
}

/** Returned by showToast so the caller can update / close it. */
interface ToastHandle {
  el: HTMLDivElement;
  update(next: string): void;
  close(): void;
}

function showToast(message: string, opts: ToastOptions = {}): ToastHandle {
  document.getElementById(TOAST_ID)?.remove();
  const t = document.createElement('div');
  t.id = TOAST_ID;
  Object.assign(t.style, {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    zIndex: '2147483647',
    background: 'rgba(24,24,27,0.94)',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
    maxWidth: '360px',
    lineHeight: '1.4',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as CSSStyleDeclaration);

  let spinnerEl: HTMLSpanElement | null = null;
  if (opts.spinner) {
    spinnerEl = document.createElement('span');
    Object.assign(spinnerEl.style, {
      display: 'inline-block',
      width: '12px',
      height: '12px',
      border: '2px solid rgba(255,255,255,0.3)',
      borderTopColor: '#f59e0b',
      borderRadius: '50%',
      animation: 'nodx-spin 0.9s linear infinite',
      flexShrink: '0',
    } as CSSStyleDeclaration);
    // Ensure the keyframe exists exactly once.
    if (!document.getElementById('__nodx_spinner_kf__')) {
      const style = document.createElement('style');
      style.id = '__nodx_spinner_kf__';
      style.textContent =
        '@keyframes nodx-spin { to { transform: rotate(360deg); } }';
      document.documentElement.appendChild(style);
    }
    t.appendChild(spinnerEl);
  }

  const textEl = document.createElement('span');
  textEl.textContent = message;
  textEl.style.flex = '1';
  t.appendChild(textEl);

  if (opts.withDownloadLink) {
    const br = document.createElement('br');
    t.appendChild(br);
    const link = document.createElement('a');
    link.href = 'https://aicon.solutions/nodx/';
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Download nodx →';
    Object.assign(link.style, {
      color: '#f59e0b',
      textDecoration: 'underline',
      marginTop: '4px',
      display: 'inline-block',
    } as CSSStyleDeclaration);
    t.appendChild(link);
  }

  document.documentElement.appendChild(t);
  let timer: number | null = null;
  if (!opts.persistent) {
    const timeout = opts.transient ? 1500 : 5000;
    timer = window.setTimeout(() => {
      if (document.getElementById(TOAST_ID) === t) t.remove();
    }, timeout);
  }

  const close = () => {
    if (timer != null) window.clearTimeout(timer);
    if (document.getElementById(TOAST_ID) === t) t.remove();
  };
  const update = (next: string) => {
    textEl.textContent = next;
  };
  return { el: t, close, update };
}

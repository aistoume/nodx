/**
 * Radial (pie) menu — appears after a marquee crop. Two of the four
 * spokes now expand into a SECOND level:
 *
 *     up    = 🔍  (放大镜, icon only) → 解释 / 搜索
 *     right = 💡  保存
 *     down  = 🛒  购物              → Google Shopping / Amazon
 *     left  = 🎨  生成
 *
 * Leaf spokes resolve immediately. The two branch spokes swap the menu to
 * their two children (drawn further out, with a dashed connector back to
 * the parent) and resolve on the child pick. The central button is ✕
 * (cancel) at level 1 and ↩ (back) at level 2. Esc / scrim click backs
 * out of a submenu, or cancels at the top level.
 *
 * Raw DOM overlay (no framework) so it can live in every page's
 * content-script world without shipping React/Preact.
 */

import type { WheelAction, WheelItem } from '../shared/wheel.js';

export type RadialChoice =
  | 'explain'
  | 'search'
  | 'save'
  | 'shopping-google'
  | 'shopping-amazon'
  | 'generate'
  // Text-selection actions mirror the image menu one-for-one.
  | 'txt-explain'
  | 'txt-search'
  | 'txt-save'
  | 'txt-shopping-google'
  | 'txt-shopping-amazon'
  | 'txt-generate'
  // Legacy text leaves — still routable (panel footer), no longer spokes.
  | 'txt-deepen'
  | 'txt-copy'
  | 'cancel';

type LeafChoice = Exclude<RadialChoice, 'cancel'>;

interface SubOption {
  key: LeafChoice;
  emoji: string;
  label: string;
}

interface RadialOption {
  emoji: string;
  /** Empty string → icon-only button. */
  label: string;
  /** Hover tooltip; falls back to label. */
  title?: string;
  /** Angle in degrees, 0 = up, clockwise. */
  angleDeg: number;
  bg: string;
  /** Leaf spoke → resolve with this on click. */
  choice?: LeafChoice;
  /** Branch spoke → expand into these on click. */
  children?: SubOption[];
}

interface Pt {
  x: number;
  y: number;
}

/** Screenshot / marquee actions — icon-only level 1 (names are tooltips). */
export const IMAGE_OPTIONS: RadialOption[] = [
  // 上 = 放大镜 → 解释 / 搜索
  {
    emoji: '🔍',
    label: '',
    title: '搜索 / 解释',
    angleDeg: 0,
    bg: 'rgba(59, 130, 246, 0.95)',
    children: [
      { key: 'explain', emoji: '📖', label: '解释' },
      { key: 'search', emoji: '🔎', label: '搜索' },
    ],
  },
  { emoji: '💡', label: '', title: '保存', angleDeg: 90, bg: 'rgba(217, 119, 6, 0.95)', choice: 'save' },
  {
    emoji: '🛒',
    label: '',
    title: '购物',
    angleDeg: 180,
    bg: 'rgba(16, 185, 129, 0.95)',
    children: [
      { key: 'shopping-google', emoji: '🏷', label: 'Shopping' },
      { key: 'shopping-amazon', emoji: '📦', label: 'Amazon' },
    ],
  },
  { emoji: '🎨', label: '', title: '生成', angleDeg: 270, bg: 'rgba(168, 85, 247, 0.95)', choice: 'generate' },
];

/**
 * Text-selection actions — structurally identical to IMAGE_OPTIONS (same
 * spokes, same two-level expansion), so the two menus feel like one tool.
 * The selected text is the query/prompt, so no "identify the image" step
 * is needed. 深入 / 复制 still live in the explanation panel's footer.
 *
 *     up    = 🔍  → 解释 / 搜索
 *     right = 💡  保存        (hand the selection to nodx desktop's pool)
 *     down  = 🛒  → Shopping / Amazon   (text query)
 *     left  = 🎨  生成        (image from the selected text)
 */
export const TEXT_OPTIONS: RadialOption[] = [
  {
    emoji: '🔍',
    label: '',
    title: '搜索 / 解释',
    angleDeg: 0,
    bg: 'rgba(59, 130, 246, 0.95)',
    children: [
      { key: 'txt-explain', emoji: '📖', label: '解释' },
      { key: 'txt-search', emoji: '🔎', label: '搜索' },
    ],
  },
  { emoji: '💡', label: '', title: '保存', angleDeg: 90, bg: 'rgba(217, 119, 6, 0.95)', choice: 'txt-save' },
  {
    emoji: '🛒',
    label: '',
    title: '购物',
    angleDeg: 180,
    bg: 'rgba(16, 185, 129, 0.95)',
    children: [
      { key: 'txt-shopping-google', emoji: '🏷', label: 'Shopping' },
      { key: 'txt-shopping-amazon', emoji: '📦', label: 'Amazon' },
    ],
  },
  { emoji: '🎨', label: '', title: '生成', angleDeg: 270, bg: 'rgba(168, 85, 247, 0.95)', choice: 'txt-generate' },
];

/** Fixed spoke colours by position (up/right/down/left). */
const WHEEL_BG = [
  'rgba(59, 130, 246, 0.95)',
  'rgba(217, 119, 6, 0.95)',
  'rgba(16, 185, 129, 0.95)',
  'rgba(168, 85, 247, 0.95)',
];

/**
 * Show the user-customized wheel (wheel-config v1 spokes) and resolve
 * with the picked WheelAction. Internally reuses showRadialMenu: each
 * leaf gets a synthetic key ('w0', 'w1-0', …) mapped back to its action.
 */
export function showWheelMenu(
  viewX: number,
  viewY: number,
  spokes: WheelItem[],
): Promise<WheelAction | 'cancel'> {
  const actions = new Map<string, WheelAction>();
  // Synthetic keys aren't part of the closed RadialChoice union — the cast
  // is contained here and resolved back through the map below.
  const asKey = (id: string) => id as unknown as LeafChoice;

  const options: RadialOption[] = spokes.map((s, i) => {
    const base = {
      emoji: s.emoji,
      label: s.label,
      title: s.label || undefined,
      angleDeg: i * 90,
      bg: WHEEL_BG[i]!,
    };
    if (s.children.length > 0) {
      return {
        ...base,
        children: s.children.map((c, j) => {
          const id = `w${i}-${j}`;
          if (c.action) actions.set(id, c.action);
          return { key: asKey(id), emoji: c.emoji, label: c.label };
        }),
      };
    }
    const id = `w${i}`;
    if (s.action) actions.set(id, s.action);
    return { ...base, choice: asKey(id) };
  });

  return showRadialMenu(viewX, viewY, options).then((picked) =>
    picked === 'cancel' ? 'cancel' : (actions.get(picked as string) ?? 'cancel'),
  );
}

const MENU_ID = '__nodx_radial_menu__';
const OUTER_RADIUS = 92; // level-1 button distance from centre
const SUB_RADIUS = 172; // level-2 children sit further out
const BUTTON_SIZE = 78;
const SUB_SPREAD = 32; // ± degrees the children fan from the parent angle

/**
 * Show the radial menu centred at (viewX, viewY) in viewport coords.
 * Resolves with the user's final pick, or 'cancel'.
 */
export function showRadialMenu(
  viewX: number,
  viewY: number,
  options: RadialOption[] = IMAGE_OPTIONS,
): Promise<RadialChoice> {
  return new Promise((resolve) => {
    document.getElementById(MENU_ID)?.remove();

    const pad = SUB_RADIUS + BUTTON_SIZE / 2 + 12;
    const cx = clamp(viewX, pad, window.innerWidth - pad);
    const cy = clamp(viewY, pad, window.innerHeight - pad);

    const root = document.createElement('div');
    root.id = MENU_ID;
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483646',
      background: 'transparent',
      cursor: 'default',
    } as CSSStyleDeclaration);
    document.documentElement.appendChild(root);

    let done = false;
    const finish = (choice: RadialChoice) => {
      if (done) return;
      done = true;
      root.remove();
      window.removeEventListener('keydown', onKey, true);
      resolve(choice);
    };

    // null → primary 4 spokes; a branch option → its children view.
    let level: RadialOption | null = null;

    const render = () => {
      root.textContent = '';
      root.appendChild(makeRing(cx, cy));

      if (level === null) {
        for (const opt of options) {
          const pos = angleToXY(opt.angleDeg, OUTER_RADIUS, cx, cy);
          const btn = makeButton(opt.emoji, opt.label, pos, opt.bg, opt.title);
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (opt.children) {
              level = opt;
              render();
            } else if (opt.choice) {
              finish(opt.choice);
            }
          });
          root.appendChild(btn);
        }
      } else {
        const parentPos = angleToXY(level.angleDeg, OUTER_RADIUS, cx, cy);
        const kids = level.children ?? [];
        kids.forEach((kid, i) => {
          const offset = kids.length === 1 ? 0 : (i - (kids.length - 1) / 2) * 2 * SUB_SPREAD;
          const pos = angleToXY(level!.angleDeg + offset, SUB_RADIUS, cx, cy);
          root.appendChild(makeLine(parentPos, pos));
          const btn = makeButton(kid.emoji, kid.label, pos, level!.bg);
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            finish(kid.key);
          });
          root.appendChild(btn);
        });
        // Parent stays as a dim, non-interactive anchor.
        const anchor = makeButton(level.emoji, level.label, parentPos, level.bg, level.title);
        anchor.style.opacity = '0.5';
        anchor.style.cursor = 'default';
        root.appendChild(anchor);
      }

      const centre = makeCentre(cx, cy, level === null ? '✕' : '↩');
      centre.title = level === null ? 'Cancel (Esc)' : 'Back (Esc)';
      centre.addEventListener('click', (e) => {
        e.stopPropagation();
        if (level === null) {
          finish('cancel');
        } else {
          level = null;
          render();
        }
      });
      root.appendChild(centre);
    };

    // Scrim click = cancel.
    root.addEventListener('click', (e) => {
      if (e.target === root) finish('cancel');
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (level !== null) {
          level = null;
          render();
        } else {
          finish('cancel');
        }
        return;
      }
      // Arrow / numpad shortcuts only at the top level.
      if (level !== null) return;
      const pick = (opt: RadialOption) => {
        e.preventDefault();
        if (opt.children) {
          level = opt;
          render();
        } else if (opt.choice) {
          finish(opt.choice);
        }
      };
      switch (e.key) {
        case 'ArrowUp':
        case '8':
          pick(options[0]!);
          break;
        case 'ArrowRight':
        case '6':
          pick(options[1]!);
          break;
        case 'ArrowDown':
        case '2':
          pick(options[2]!);
          break;
        case 'ArrowLeft':
        case '4':
          pick(options[3]!);
          break;
      }
    };
    window.addEventListener('keydown', onKey, true);

    render();
  });
}

function angleToXY(angleDeg: number, radius: number, cx: number, cy: number): Pt {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + Math.sin(rad) * radius, y: cy - Math.cos(rad) * radius };
}

function makeButton(
  emoji: string,
  label: string,
  pos: Pt,
  bg: string,
  title?: string,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = title ?? label;
  Object.assign(btn.style, {
    position: 'absolute',
    left: `${pos.x - BUTTON_SIZE / 2}px`,
    top: `${pos.y - BUTTON_SIZE / 2}px`,
    width: `${BUTTON_SIZE}px`,
    height: `${BUTTON_SIZE}px`,
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.5)',
    background: bg,
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    boxShadow: '0 10px 24px rgba(0,0,0,0.25)',
    cursor: 'pointer',
    fontFamily: 'system-ui, -apple-system, "PingFang SC", sans-serif',
    fontWeight: '600',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    padding: '0',
    userSelect: 'none',
  } as CSSStyleDeclaration);
  btn.innerHTML = label
    ? `<span style="font-size:22px;line-height:1;">${emoji}</span><span style="font-size:11px;">${label}</span>`
    : `<span style="font-size:26px;line-height:1;">${emoji}</span>`;

  btn.addEventListener('mouseenter', () => {
    if (btn.style.cursor === 'default') return; // dim anchor: no hover pop
    btn.style.transform = 'scale(1.08)';
    btn.style.boxShadow = '0 14px 32px rgba(0,0,0,0.35)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = '';
    btn.style.boxShadow = '0 10px 24px rgba(0,0,0,0.25)';
  });
  return btn;
}

function makeCentre(cx: number, cy: number, glyph: string): HTMLDivElement {
  const centre = document.createElement('div');
  Object.assign(centre.style, {
    position: 'absolute',
    left: `${cx - 22}px`,
    top: `${cy - 22}px`,
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    background: 'rgba(24, 24, 27, 0.90)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
    border: '2px solid rgba(255,255,255,0.15)',
    userSelect: 'none',
  } as CSSStyleDeclaration);
  centre.textContent = glyph;
  return centre;
}

function makeLine(a: Pt, b: Pt): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  Object.assign(svg.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    overflow: 'visible',
  } as CSSStyleDeclaration);
  svg.innerHTML = `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(24,24,27,0.4)" stroke-width="2" stroke-dasharray="4 4" />`;
  return svg;
}

function makeRing(cx: number, cy: number): SVGSVGElement {
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('width', `${OUTER_RADIUS * 2 + 4}`);
  ring.setAttribute('height', `${OUTER_RADIUS * 2 + 4}`);
  Object.assign(ring.style, {
    position: 'absolute',
    left: `${cx - OUTER_RADIUS - 2}px`,
    top: `${cy - OUTER_RADIUS - 2}px`,
    pointerEvents: 'none',
  } as CSSStyleDeclaration);
  ring.innerHTML = `<circle cx="${OUTER_RADIUS + 2}" cy="${OUTER_RADIUS + 2}" r="${OUTER_RADIUS}" fill="none" stroke="rgba(24,24,27,0.35)" stroke-width="1" stroke-dasharray="4 5" />`;
  return ring;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

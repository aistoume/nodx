/** @jsxImportSource preact */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  getSettings,
  setSettings,
  type CustomTarget,
  type Provider,
  type Settings,
} from '../shared/settings.js';
import { setLocale, t, type Language } from '../shared/i18n.js';
import { IMAGE_GEN_MODELS, MODELS } from '../shared/model-catalog.js';
import { SEARCH_PRESETS } from '../shared/search-presets.js';
import {
  DEFAULT_EXPLAIN_PROMPT,
  DEFAULT_GRID_STYLE_PROMPT,
  DEFAULT_IMAGE_SEARCH_PREFIX,
  DEFAULT_SINGLE_STYLE_PROMPT,
  defaultWheel,
  getWheelConfig,
  resetWheelConfig,
  setWheelConfig,
  SPOKE_COLORS_HEX,
  wheelBg,
  type WheelAction,
  type WheelConfigV1,
  type WheelItem,
} from '../shared/wheel.js';


/** Live sanity check: does the pasted key look like this provider's? */
function keyFormatWarning(p: Provider, key: string): string | null {
  const k = key.trim();
  if (!k) return null;
  switch (p) {
    case 'openrouter':
      return k.startsWith('sk-or-')
        ? null
        : '⚠ This is not an OpenRouter key (expected sk-or-v1-…) — create one at openrouter.ai/keys';
    case 'anthropic':
      return k.startsWith('sk-ant-') ? null : '⚠ Expected an Anthropic key (sk-ant-…)';
    case 'google':
      // Google is migrating Standard keys (AIza…) to Auth keys (AQ.…);
      // both are live during the transition.
      return k.startsWith('AQ.') || k.startsWith('AIza')
        ? null
        : '⚠ Expected a Google AI key (AQ.… or AIza…)';
    case 'openai':
      return k.startsWith('sk-') && !k.startsWith('sk-ant-') && !k.startsWith('sk-or-')
        ? null
        : '⚠ Expected an OpenAI key (sk-…)';
    default:
      return null; // nodx: any/no token is fine
  }
}

function App() {
  const [settings, setSettingsState] = useState<Settings | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Persist failures were previously SILENT: the UI updates optimistically,
  // so a stale options page (left open across an extension reload — its
  // chrome.* context is invalidated) LOOKED like it saved while nothing
  // reached storage. Surface that loudly instead.
  const [saveError, setSaveError] = useState<string | null>(null);
  // forceTick is bumped whenever the locale changes so the whole tree re-renders
  const [, force] = useState(0);

  useEffect(() => {
    void getSettings().then((s) => {
      setLocale(s.language);
      setSettingsState(s);
    });
  }, []);

  if (!settings) return <div className="loading">{t('loading')}</div>;

  // Local capture — TS's control-flow analysis widens the outer `settings`
  // back to `Settings | null` inside the nested closure, so we make the
  // narrowed value explicit.
  const s = settings;
  async function save(patch: Partial<Settings>) {
    // Mirror setSettings' per-provider key derivation locally —
    // synchronously, so rapid keystrokes never race an async reconcile.
    const provider = patch.provider ?? s.provider;
    const keys = { ...s.apiKeys };
    if (patch.apiKey !== undefined) keys[provider] = patch.apiKey;
    const apiKey = patch.apiKey !== undefined ? patch.apiKey : (keys[provider] ?? '');
    setSettingsState({ ...s, ...patch, apiKeys: keys, apiKey });
    try {
      await setSettings(patch);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveError(
        /context invalidated/i.test(msg) ? t('optionsStaleError') : `⚠ ${msg}`,
      );
      return;
    }
    setSaveError(null);
    setSavedAt(Date.now());
    if (patch.language !== undefined) {
      setLocale(patch.language);
      force((n) => n + 1);
    }
  }

  const helps = MODELS[settings.provider];

  return (
    <div className="container">
      <h1>{t('optionsTitle')}</h1>
      <p className="subtitle">{t('optionsSubtitle')}</p>

      <section>
        <label>{t('language')}</label>
        <div className="radios">
          {(['auto', 'en', 'zh'] as Language[]).map((lang) => (
            <label key={lang}>
              <input
                type="radio"
                name="language"
                value={lang}
                checked={settings.language === lang}
                onChange={() => void save({ language: lang })}
              />{' '}
              {lang === 'auto' ? t('languageAuto') : lang === 'zh' ? t('languageZh') : t('languageEn')}
            </label>
          ))}
        </div>
      </section>

      <section>
        <label>{t('aiProvider')}</label>
        <div className="radios">
          {(['anthropic', 'openai', 'google', 'openrouter', 'nodx'] as Provider[]).map((p) => (
            <label key={p}>
              <input
                type="radio"
                name="provider"
                value={p}
                checked={settings.provider === p}
                onChange={() =>
                  void save({
                    provider: p,
                    model: {
                      explain: MODELS[p].explain[0],
                      deepen: MODELS[p].deepen[0],
                    },
                  })
                }
              />{' '}
              {p === 'anthropic'
                ? t('providerAnthropic')
                : p === 'openai'
                  ? t('providerOpenAI')
                  : p === 'google'
                    ? t('providerGoogle')
                    : p === 'openrouter'
                      ? t('providerOpenRouter')
                      : t('providerNodx')}
            </label>
          ))}
        </div>
      </section>

      <section>
        <label>{t('apiKey')}</label>
        <input
          type="password"
          value={settings.apiKey}
          placeholder={
            settings.provider === 'openrouter'
              ? 'sk-or-v1-…'
              : settings.provider === 'google'
                ? 'AQ.… / AIza…'
                : settings.provider === 'openai'
                  ? 'sk-…'
                  : settings.provider === 'nodx'
                    ? '(optional gateway token)'
                    : 'sk-ant-…'
          }
          onInput={(e) => void save({ apiKey: (e.target as HTMLInputElement).value })}
        />
        {keyFormatWarning(settings.provider, settings.apiKey) && (
          <p className="hint wheel-error">
            {keyFormatWarning(settings.provider, settings.apiKey)}
          </p>
        )}
        <p className="hint">{helps.help}</p>
      </section>

      {settings.provider === 'nodx' && <NativeBridge />}

      <section>
        <label>{t('explainModelLabel')}</label>
        <select
          value={settings.model.explain}
          onChange={(e) =>
            void save({
              model: { ...settings.model, explain: (e.target as HTMLSelectElement).value },
            })
          }
        >
          {helps.explain.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </section>

      <section>
        <label>{t('deepenModelLabel')}</label>
        <select
          value={settings.model.deepen}
          onChange={(e) =>
            void save({
              model: { ...settings.model, deepen: (e.target as HTMLSelectElement).value },
            })
          }
        >
          {helps.deepen.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </section>

      <section>
        <label>{t('imageGenSection')}</label>
        <p className="hint">{t('imageGenHelp')}</p>
        <input
          type="password"
          value={settings.imageGen.apiKey}
          placeholder="AQ.… / AIza…"
          onInput={(e) =>
            void save({
              imageGen: {
                ...settings.imageGen,
                apiKey: (e.target as HTMLInputElement).value,
              },
            })
          }
        />
        <select
          value={settings.imageGen.model}
          onChange={(e) =>
            void save({
              imageGen: {
                ...settings.imageGen,
                model: (e.target as HTMLSelectElement).value,
              },
            })
          }
        >
          {IMAGE_GEN_MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </section>

      <section>
        <label>{t('triggerSettings')}</label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.ui.triggerOnSelection}
            onChange={(e) =>
              void save({
                ui: {
                  ...settings.ui,
                  triggerOnSelection: (e.target as HTMLInputElement).checked,
                },
              })
            }
          />{' '}
          {t('triggerOnSelectionLabel')}
        </label>
        <div className="hbox">
          <span>{t('selectionLengthPrefix')}</span>
          <input
            type="number" min="1" max="50"
            value={settings.ui.minLength}
            onInput={(e) =>
              void save({
                ui: { ...settings.ui, minLength: Number((e.target as HTMLInputElement).value) },
              })
            }
          />
          <span> {t('selectionTo')} </span>
          <input
            type="number" min="100" max="2000"
            value={settings.ui.maxLength}
            onInput={(e) =>
              void save({
                ui: { ...settings.ui, maxLength: Number((e.target as HTMLInputElement).value) },
              })
            }
          />
          <span> {t('selectionSuffix')}</span>
        </div>
      </section>

      <section>
        <label>{t('targetsSection')}</label>
        <p className="hint">{t('targetsHelp')}</p>
        {settings.customTargets.map((ct) => (
          <div key={ct.id} className="target-row">
            <input
              type="text"
              className="target-name"
              value={ct.name}
              placeholder={t('targetName')}
              onInput={(e) =>
                void save({
                  customTargets: settings.customTargets.map((x) =>
                    x.id === ct.id ? { ...x, name: (e.target as HTMLInputElement).value } : x,
                  ),
                })
              }
            />
            <input
              type="text"
              className="target-url"
              value={ct.url}
              placeholder="http://127.0.0.1:5000/hook"
              onInput={(e) =>
                void save({
                  customTargets: settings.customTargets.map((x) =>
                    x.id === ct.id ? { ...x, url: (e.target as HTMLInputElement).value } : x,
                  ),
                })
              }
            />
            <select
              value={ct.mode}
              onChange={(e) =>
                void save({
                  customTargets: settings.customTargets.map((x) =>
                    x.id === ct.id
                      ? { ...x, mode: (e.target as HTMLSelectElement).value as CustomTarget['mode'] }
                      : x,
                  ),
                })
              }
            >
              <option value="forward">{t('targetModeForward')}</option>
              <option value="ai-forward">{t('targetModeAiForward')}</option>
              <option value="openai-compat">{t('targetModeOpenAI')}</option>
            </select>
            {ct.mode === 'openai-compat' && (
              <input
                type="text"
                className="target-model"
                value={ct.model ?? ''}
                placeholder={t('targetModelPh')}
                onInput={(e) =>
                  void save({
                    customTargets: settings.customTargets.map((x) =>
                      x.id === ct.id
                        ? { ...x, model: (e.target as HTMLInputElement).value }
                        : x,
                    ),
                  })
                }
              />
            )}
            <button
              className="target-del"
              title="✕"
              onClick={() =>
                void save({
                  customTargets: settings.customTargets.filter((x) => x.id !== ct.id),
                })
              }
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="target-add"
          onClick={() =>
            void save({
              customTargets: [
                ...settings.customTargets,
                { id: crypto.randomUUID(), name: '', url: '', mode: 'forward' },
              ],
            })
          }
        >
          ＋ {t('targetAdd')}
        </button>
        <p className="hint">{t('targetsContract')}</p>
        <p className="hint">{t('targetsCliHint')}</p>
      </section>

      <WheelEditor onSaved={() => setSavedAt(Date.now())} />

      {saveError && <div className="save-error">{saveError}</div>}
      {savedAt && !saveError && (
        <div className="saved">{t('savedAt')} · {new Date(savedAt).toLocaleTimeString()}</div>
      )}
    </div>
  );
}

/**
 * "Direct local Claude" block, shown for the nodx provider — grants the
 * optional nativeMessaging permission and pings the registered host
 * (solutions.aicon.nodx_lens). With both in place, the provider falls back
 * to spawning `claude -p` via Chrome when the :8787 gateway is down.
 */
function NativeBridge() {
  const [state, setState] = useState<'checking' | 'no-perm' | 'ok' | 'no-host'>('checking');
  const [copied, setCopied] = useState(false);
  // The one-liner carries THIS extension's runtime id — store and unpacked
  // installs have different ids, and the host manifest only trusts listed
  // origins (running the script registered for another id = "host not found").
  const installCmd = `curl -fsSL https://aicon.solutions/nodx/lens-host/install.sh | bash -s -- ${chrome.runtime.id}`;

  const check = async () => {
    setState('checking');
    let has = false;
    try {
      has = await chrome.permissions.contains({ permissions: ['nativeMessaging'] });
    } catch {
      /* treated as not granted */
    }
    if (!has) {
      setState('no-perm');
      return;
    }
    try {
      await new Promise<void>((resolve, reject) => {
        const port = chrome.runtime.connectNative('solutions.aicon.nodx_lens');
        let settled = false;
        port.onMessage.addListener(() => {
          settled = true;
          try {
            port.disconnect();
          } catch {
            /* gone */
          }
          resolve();
        });
        port.onDisconnect.addListener(() => {
          if (!settled) reject(new Error(chrome.runtime.lastError?.message ?? 'disconnected'));
        });
        port.postMessage({ id: 'ping', type: 'ping' });
      });
      setState('ok');
    } catch {
      setState('no-host');
    }
  };

  useEffect(() => {
    void check();
  }, []);

  const connect = async () => {
    try {
      const granted = await chrome.permissions.request({ permissions: ['nativeMessaging'] });
      if (granted) await check();
    } catch {
      /* user dismissed the prompt */
    }
  };

  return (
    <section>
      <label>{t('nativeSection')}</label>
      <p className="hint">{t('nativeHelp')}</p>
      {state !== 'ok' && (
        <div className="native-cmd-row">
          <code className="native-cmd">{installCmd}</code>
          <button
            className="target-add"
            onClick={() => {
              void navigator.clipboard.writeText(installCmd).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2400);
              });
            }}
          >
            {copied ? t('nativeCmdCopied') : t('nativeCopyCmd')}
          </button>
        </div>
      )}
      <p className={`hint${state === 'no-host' ? ' wheel-error' : ''}`}>
        {state === 'checking'
          ? t('nativeChecking')
          : state === 'ok'
            ? t('nativeOk')
            : state === 'no-host'
              ? t('nativeNoHost')
              : t('nativeNoPerm')}
      </p>
      {state !== 'checking' && (
        <div className="hbox">
          {state !== 'ok' && (
            <button className="target-add" onClick={() => void connect()}>
              {t('nativeConnect')}
            </button>
          )}
          <button className="target-add" onClick={() => void check()}>
            {t('nativeRecheck')}
          </button>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action-wheel editor — edits the shared wheel-config v1 (see shared/wheel.ts).
// Explicit save (not autosave) so half-typed prompts/URLs never go live.
// A live WheelPreview mirrors the real radial menu's visuals as you type.
// ─────────────────────────────────────────────────────────────────────────────

/** Fixed spoke colours by position — same values as radial-menu.ts. */
const WHEEL_BG = [
  'rgba(59, 130, 246, 0.95)',
  'rgba(217, 119, 6, 0.95)',
  'rgba(16, 185, 129, 0.95)',
  'rgba(168, 85, 247, 0.95)',
];

function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.sin(rad) * r, y: -Math.cos(rad) * r };
}

/**
 * Live rendering of the wheel, faithful to the in-page radial menu:
 * dashed ring, coloured circular buttons, submenu fan with dashed
 * connectors, ✕/↩ centre. Click a submenu spoke to expand its children.
 */
function WheelPreview({
  spokes,
  expanded,
  onExpand,
}: {
  spokes: WheelItem[];
  expanded: number | null;
  onExpand: (i: number | null) => void;
}) {
  const SIZE = 400;
  const C = SIZE / 2;
  const OUTER = 88;
  const SUB = 152;
  const BTN = 64;
  const STEP = 36; // degrees between adjacent children

  // Guard: the expanded spoke may have lost its children mid-edit.
  const expIdx =
    expanded != null && (spokes[expanded]?.children.length ?? 0) > 0 ? expanded : null;
  const exp = expIdx != null ? spokes[expIdx]! : null;

  const childPos = (j: number, count: number) => {
    const offset = (j - (count - 1) / 2) * STEP;
    return polar(expIdx! * 90 + offset, SUB);
  };

  const button = (
    item: WheelItem,
    x: number,
    y: number,
    bg: string,
    extra: { dim?: boolean; onClick?: () => void },
  ) => (
    <div
      className={'wp-btn' + (extra.dim ? ' wp-dim' : '') + (extra.onClick ? ' wp-click' : '')}
      style={{
        left: `${C + x - BTN / 2}px`,
        top: `${C + y - BTN / 2}px`,
        width: `${BTN}px`,
        height: `${BTN}px`,
        background: bg,
      }}
      onClick={extra.onClick}
    >
      {item.emoji.startsWith('data:') ? (
        <img className="wp-img" src={item.emoji} />
      ) : (
        <span className="wp-emoji">{item.emoji || '❓'}</span>
      )}
      {item.label && <span className="wp-label">{item.label}</span>}
    </div>
  );

  return (
    <div className="wheel-preview" style={{ width: `${SIZE}px`, height: `${SIZE}px` }}>
      <div
        className="wp-ring"
        style={{
          left: `${C - OUTER}px`,
          top: `${C - OUTER}px`,
          width: `${OUTER * 2}px`,
          height: `${OUTER * 2}px`,
        }}
      />
      {exp && (
        <svg className="wp-lines" width={SIZE} height={SIZE}>
          {exp.children.map((_, j) => {
            const p = polar(expIdx! * 90, OUTER);
            const c = childPos(j, exp.children.length);
            return (
              <line
                key={j}
                x1={C + p.x}
                y1={C + p.y}
                x2={C + c.x}
                y2={C + c.y}
                stroke="rgba(24,24,27,0.4)"
                stroke-width="2"
                stroke-dasharray="4 4"
              />
            );
          })}
        </svg>
      )}
      {spokes.map((s, i) => {
        const p = polar(i * 90, OUTER);
        const isExp = expIdx === i;
        const dimmed = expIdx != null;
        return button(s, p.x, p.y, wheelBg(s.color, WHEEL_BG[i]!), {
          dim: dimmed,
          onClick:
            s.children.length > 0 ? () => onExpand(isExp ? null : i) : undefined,
        });
      })}
      {exp?.children.map((c, j) => {
        const p = childPos(j, exp.children.length);
        return button(
          c, p.x, p.y,
          wheelBg(c.color ?? exp.color, WHEEL_BG[expIdx!]!),
          {},
        );
      })}
      <div className="wp-centre wp-click" onClick={() => onExpand(null)}>
        {expIdx == null ? '✕' : '↩'}
      </div>
    </div>
  );
}

const KIND_ORDER = ['prompt', 'instruct', 'search', 'save', 'generate'] as const;
type KindKey = (typeof KIND_ORDER)[number];

function kindLabel(k: KindKey): string {
  return k === 'prompt'
    ? t('wheelKindPrompt')
    : k === 'instruct'
      ? t('wheelKindInstruct')
      : k === 'search'
        ? t('wheelKindSearch')
        : k === 'save'
          ? t('wheelKindSave')
          : t('wheelKindGenerate');
}

// ─────────────────────────────────────────────────────────────────────────────
// Icon picker — preset emoji library + custom image upload. Uploaded images
// are centre-cropped to 64×64 and stored as data: URLs in the item's emoji
// field (renderers show an <img> whenever the value starts with "data:").
// ─────────────────────────────────────────────────────────────────────────────

const PRESET_ICONS = [
  '🔍', '🔎', '📖', '💡', '🛒', '🏷', '📦', '🎨',
  '🧠', '📝', '🌐', '🔤', '🖼️', '📷', '🎬', '🎵',
  '📊', '📈', '🧾', '💬', '❓', '✅', '⭐', '❤️',
  '🔥', '⚡', '🚀', '🛠️', '🔧', '🧪', '🩺', '⚖️',
  '🗺️', '🧭', '⏰', '💰', '🏠', '🍔', '👕', '🚗',
];

function IconGlyph({ icon, size }: { icon: string; size: number }) {
  return icon.startsWith('data:') ? (
    <img
      src={icon}
      style={{ width: `${size}px`, height: `${size}px`, borderRadius: '4px', objectFit: 'cover' }}
    />
  ) : (
    <span style={{ fontSize: `${size - 2}px`, lineHeight: 1 }}>{icon || '❓'}</span>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  const onFile = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        ctx.drawImage(
          img,
          (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s,
          0, 0, 64, 64,
        );
        pick(c.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(f);
  };
  return (
    <div className="icon-picker">
      <button
        type="button"
        className="icon-btn"
        title={t('wheelEmojiPh')}
        onClick={() => setOpen(!open)}
      >
        <IconGlyph icon={value} size={20} />
      </button>
      {open && (
        <div className="icon-pop">
          <div className="icon-grid">
            {PRESET_ICONS.map((e) => (
              <button type="button" key={e} onClick={() => pick(e)}>
                {e}
              </button>
            ))}
          </div>
          <div className="icon-actions">
            <label className="icon-upload">
              {t('iconUpload')}
              <input type="file" accept="image/*" onChange={onFile} />
            </label>
            <input
              className="icon-manual"
              placeholder={t('iconManualPh')}
              value={value.startsWith('data:') ? '' : value}
              onInput={(e) => onChange((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Sensible starting action per kind — used when there's nothing stashed. */
function defaultActionFor(k: KindKey): WheelAction {
  switch (k) {
    case 'prompt':
      return { kind: 'prompt', prompt: DEFAULT_EXPLAIN_PROMPT };
    case 'instruct':
      return { kind: 'instruct' };
    case 'search':
      return { kind: 'search', urlPrefix: DEFAULT_IMAGE_SEARCH_PREFIX };
    case 'save':
      return { kind: 'save' };
    case 'generate':
      return { kind: 'generate', layout: 'grid', stylePrompt: DEFAULT_GRID_STYLE_PROMPT };
  }
}

function actionOf(kind: KindKey, param: string): WheelAction {
  switch (kind) {
    case 'prompt':
      return { kind: 'prompt', prompt: param };
    case 'instruct':
      return { kind: 'instruct' };
    case 'search':
      return { kind: 'search', urlPrefix: param };
    case 'save':
      return { kind: 'save' };
    case 'generate':
      return { kind: 'generate', layout: 'grid', stylePrompt: DEFAULT_GRID_STYLE_PROMPT };
  }
}

function kindOf(a: WheelAction | null): KindKey {
  return a?.kind ?? 'prompt';
}

function paramOf(a: WheelAction | null): string {
  if (a?.kind === 'prompt') return a.prompt;
  if (a?.kind === 'search') return a.urlPrefix;
  if (a?.kind === 'generate') return a.stylePrompt;
  return '';
}

/**
 * Native colour swatch. `value` unset means "position default" — a ↺
 * reset appears once the user picks a custom colour.
 */
function ColorField({
  value,
  defaultHex,
  onChange,
}: {
  value: string | undefined;
  defaultHex: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <span className="color-field">
      <input
        type="color"
        value={value ?? defaultHex}
        title={t('wheelColor')}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
      {value && (
        <button
          type="button"
          className="color-reset"
          title={t('wheelColorReset')}
          onClick={() => onChange(undefined)}
        >
          ↺
        </button>
      )}
    </span>
  );
}

function ItemFields({
  item,
  defaultColor,
  onChange,
  onRemove,
  removeDisabled,
}: {
  item: WheelItem;
  defaultColor: string;
  onChange: (next: WheelItem) => void;
  onRemove?: () => void;
  removeDisabled?: boolean;
}) {
  const kind = kindOf(item.action);
  const needsParam = kind === 'prompt' || kind === 'search' || kind === 'generate';
  const gen = item.action?.kind === 'generate' ? item.action : null;
  // Stash the action per kind so switching away and back restores what the
  // user had typed (instead of wiping the prompt/URL).
  const [stash, setStash] = useState<Partial<Record<KindKey, WheelAction>>>({});
  // Search destinations come from a preset dropdown; the raw URL prefix is
  // the advanced path ("Custom URL…"). `customUrl` keeps custom mode open
  // even while the typed URL happens to match a preset.
  const [customUrl, setCustomUrl] = useState(false);
  const urlPrefix = item.action?.kind === 'search' ? item.action.urlPrefix : '';
  const isCustomUrl = customUrl || !SEARCH_PRESETS.some((p) => p.url === urlPrefix);
  const CUSTOM = '__custom__';
  return (
    <div className="wheel-item">
      <div className="hbox">
        <IconPicker
          value={item.emoji}
          onChange={(v) => onChange({ ...item, emoji: v })}
        />
        <ColorField
          value={item.color}
          defaultHex={defaultColor}
          onChange={(color) => {
            const next = { ...item };
            if (color) next.color = color;
            else delete next.color;
            onChange(next);
          }}
        />
        <input
          className="wheel-name"
          value={item.label}
          placeholder={t('wheelLabelPh')}
          onInput={(e) => onChange({ ...item, label: (e.target as HTMLInputElement).value })}
        />
        <select
          className="wheel-kind"
          value={kind}
          onChange={(e) => {
            const k = (e.target as HTMLSelectElement).value as KindKey;
            if (k === kind) return;
            if (item.action) setStash({ ...stash, [kind]: item.action });
            onChange({ ...item, action: stash[k] ?? defaultActionFor(k) });
          }}
        >
          {KIND_ORDER.map((k) => (
            <option key={k} value={k}>{kindLabel(k)}</option>
          ))}
        </select>
        {onRemove && (
          <button
            type="button"
            className="wheel-x"
            title={t('wheelRemove')}
            disabled={removeDisabled}
            onClick={onRemove}
          >
            ✕
          </button>
        )}
      </div>
      {gen && (
        <div className="hbox wheel-gen-layout">
          <select
            value={gen.layout}
            onChange={(e) => {
              const layout = (e.target as HTMLSelectElement).value as 'single' | 'grid';
              // Swap in the matching default unless the user already
              // customized the template.
              const untouched =
                !gen.stylePrompt.trim() ||
                gen.stylePrompt === DEFAULT_GRID_STYLE_PROMPT ||
                gen.stylePrompt === DEFAULT_SINGLE_STYLE_PROMPT;
              onChange({
                ...item,
                action: {
                  kind: 'generate',
                  layout,
                  stylePrompt: untouched
                    ? layout === 'single'
                      ? DEFAULT_SINGLE_STYLE_PROMPT
                      : DEFAULT_GRID_STYLE_PROMPT
                    : gen.stylePrompt,
                },
              });
            }}
          >
            <option value="single">{t('wheelLayoutSingle')}</option>
            <option value="grid">{t('wheelLayoutGrid')}</option>
          </select>
        </div>
      )}
      {kind === 'search' && (
        <div className="hbox">
          <select
            className="wheel-preset"
            value={isCustomUrl ? CUSTOM : urlPrefix}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              if (v === CUSTOM) {
                setCustomUrl(true);
              } else {
                setCustomUrl(false);
                onChange({ ...item, action: { kind: 'search', urlPrefix: v } });
              }
            }}
          >
            {SEARCH_PRESETS.map((p) => (
              <option key={p.url} value={p.url}>{p.label}</option>
            ))}
            <option value={CUSTOM}>{t('wheelPresetCustom')}</option>
          </select>
        </div>
      )}
      {needsParam && (kind !== 'search' || isCustomUrl) && (
        <textarea
          rows={kind === 'search' ? 1 : kind === 'generate' ? 5 : 3}
          value={paramOf(item.action)}
          placeholder={
            kind === 'prompt'
              ? t('wheelPromptPh')
              : kind === 'search'
                ? t('wheelUrlPh')
                : t('wheelStylePh')
          }
          onInput={(e) => {
            const v = (e.target as HTMLTextAreaElement).value;
            onChange({
              ...item,
              action:
                gen != null
                  ? { ...gen, stylePrompt: v }
                  : actionOf(kind, v),
            });
          }}
        />
      )}
    </div>
  );
}

function WheelEditor({ onSaved }: { onSaved: () => void }) {
  const [cfg, setCfg] = useState<WheelConfigV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState<number | null>(null);

  useEffect(() => {
    void getWheelConfig().then(setCfg);
  }, []);
  if (!cfg) return null;

  const posName = [t('wheelPosUp'), t('wheelPosRight'), t('wheelPosDown'), t('wheelPosLeft')];

  const patchSpoke = (i: number, next: WheelItem) => {
    setCfg({ ...cfg, spokes: cfg.spokes.map((s, j) => (j === i ? next : s)) });
  };

  const validate = (): boolean => {
    const badItem = (it: WheelItem): boolean =>
      !it.emoji.trim() ||
      (it.children.length === 0 &&
        ((it.action?.kind === 'prompt' && !it.action.prompt.trim()) ||
          (it.action?.kind === 'search' && !it.action.urlPrefix.trim()) ||
          (it.action?.kind === 'generate' && !it.action.stylePrompt.trim()) ||
          it.action === null));
    for (const s of cfg.spokes) {
      if (!s.emoji.trim()) return false;
      if (s.children.length > 0) {
        if (s.children.some(badItem)) return false;
      } else if (badItem(s)) {
        return false;
      }
    }
    return true;
  };

  return (
    <section className="wheel-section">
      <label>{t('wheelSection')}</label>
      <p className="hint">{t('wheelHelp')}</p>
      <div className="wheel-body">
        <div className="wheel-preview-col">
          <WheelPreview
            spokes={cfg.spokes}
            expanded={previewExpanded}
            onExpand={setPreviewExpanded}
          />
          <p className="hint">{t('wheelPreviewHint')}</p>
        </div>
        <div className="wheel-editors">
      {cfg.spokes.map((spoke, i) => {
        const isSub = spoke.children.length > 0;
        return (
          <div
            key={i}
            className="wheel-spoke"
            style={{ borderLeft: `4px solid ${spoke.color ?? SPOKE_COLORS_HEX[i]!}` }}
          >
            <strong>{posName[i]}</strong>
            <div className="radios">
              <label>
                <input
                  type="radio"
                  name={`mode-${i}`}
                  checked={!isSub}
                  onChange={() =>
                    patchSpoke(i, {
                      ...spoke,
                      children: [],
                      action: spoke.action ?? actionOf('prompt', ''),
                    })
                  }
                />{' '}
                {t('wheelModeAction')}
              </label>
              <label>
                <input
                  type="radio"
                  name={`mode-${i}`}
                  checked={isSub}
                  onChange={() =>
                    patchSpoke(i, {
                      ...spoke,
                      action: null,
                      children: spoke.children.length
                        ? spoke.children
                        : [{ emoji: '❓', label: '', action: defaultActionFor('prompt'), children: [] }],
                    })
                  }
                />{' '}
                {t('wheelModeChildren')}
              </label>
            </div>
            {isSub ? (
              <>
                <div className="hbox">
                  <IconPicker
                    value={spoke.emoji}
                    onChange={(v) => patchSpoke(i, { ...spoke, emoji: v })}
                  />
                  <ColorField
                    value={spoke.color}
                    defaultHex={SPOKE_COLORS_HEX[i]!}
                    onChange={(color) => {
                      const next = { ...spoke };
                      if (color) next.color = color;
                      else delete next.color;
                      patchSpoke(i, next);
                    }}
                  />
                  <input
                    value={spoke.label}
                    placeholder={t('wheelLabelPh')}
                    onInput={(e) =>
                      patchSpoke(i, { ...spoke, label: (e.target as HTMLInputElement).value })
                    }
                  />
                </div>
                {spoke.children.map((kid, j) => (
                  <div key={j} className="wheel-child">
                    <ItemFields
                      item={kid}
                      defaultColor={spoke.color ?? SPOKE_COLORS_HEX[i]!}
                      onChange={(next) =>
                        patchSpoke(i, {
                          ...spoke,
                          children: spoke.children.map((c, m) => (m === j ? next : c)),
                        })
                      }
                      onRemove={() =>
                        patchSpoke(i, {
                          ...spoke,
                          children: spoke.children.filter((_, m) => m !== j),
                        })
                      }
                      removeDisabled={spoke.children.length <= 1}
                    />
                  </div>
                ))}
                {spoke.children.length < 3 && (
                  <button
                    type="button"
                    onClick={() =>
                      patchSpoke(i, {
                        ...spoke,
                        children: [
                          ...spoke.children,
                          { emoji: '❓', label: '', action: defaultActionFor('prompt'), children: [] },
                        ],
                      })
                    }
                  >
                    {t('wheelAddChild')}
                  </button>
                )}
              </>
            ) : (
              <ItemFields
                item={spoke}
                defaultColor={SPOKE_COLORS_HEX[i]!}
                onChange={(next) => patchSpoke(i, next)}
              />
            )}
          </div>
        );
      })}
      {error && <p className="hint wheel-error">{error}</p>}
      <div className="hbox">
        <button
          type="button"
          className="wheel-primary"
          onClick={() => {
            if (!validate()) {
              setError(t('wheelInvalid'));
              return;
            }
            setError(null);
            setWheelConfig(cfg).then(onSaved, (e) => {
              const msg = e instanceof Error ? e.message : String(e);
              setError(/context invalidated/i.test(msg) ? t('optionsStaleError') : `⚠ ${msg}`);
            });
          }}
        >
          {t('wheelSaveBtn')}
        </button>
        <button
          type="button"
          onClick={() => {
            resetWheelConfig().then(
              () => {
                setCfg(defaultWheel());
                setError(null);
                onSaved();
              },
              (e) => {
                const msg = e instanceof Error ? e.message : String(e);
                setError(/context invalidated/i.test(msg) ? t('optionsStaleError') : `⚠ ${msg}`);
              },
            );
          }}
        >
          {t('wheelResetBtn')}
        </button>
      </div>
        </div>
      </div>
    </section>
  );
}

render(<App />, document.getElementById('root')!);

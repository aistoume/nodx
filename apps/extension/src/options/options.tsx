/** @jsxImportSource preact */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  getSettings,
  setSettings,
  type Provider,
  type Settings,
} from '../shared/settings.js';
import { setLocale, t, type Language } from '../shared/i18n.js';
import {
  defaultWheel,
  getWheelConfig,
  resetWheelConfig,
  setWheelConfig,
  type WheelAction,
  type WheelConfigV1,
  type WheelItem,
} from '../shared/wheel.js';

const MODELS: Record<Provider, { explain: string[]; deepen: string[]; help: string }> = {
  anthropic: {
    explain: ['claude-haiku-4-5'],
    deepen: ['claude-sonnet-5', 'claude-opus-4-6'],
    help: 'Get an Anthropic key at console.anthropic.com/settings/keys',
  },
  openai: {
    explain: ['gpt-4o-mini'],
    deepen: ['gpt-4o', 'gpt-5'],
    help: 'Get an OpenAI key at platform.openai.com/api-keys',
  },
  google: {
    explain: ['gemini-2.5-flash'],
    deepen: ['gemini-2.5-pro'],
    help: 'Get a Google AI key at aistudio.google.com/app/apikey',
  },
};

function App() {
  const [settings, setSettingsState] = useState<Settings | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
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
    const next: Settings = { ...s, ...patch };
    setSettingsState(next);
    await setSettings(patch);
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
          {(['auto', 'zh', 'en'] as Language[]).map((lang) => (
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
          {(['anthropic', 'openai', 'google'] as Provider[]).map((p) => (
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
              {p === 'anthropic' ? t('providerAnthropic') : p === 'openai' ? t('providerOpenAI') : t('providerGoogle')}
            </label>
          ))}
        </div>
      </section>

      <section>
        <label>{t('apiKey')}</label>
        <input
          type="password"
          value={settings.apiKey}
          placeholder="sk-..."
          onInput={(e) => void save({ apiKey: (e.target as HTMLInputElement).value })}
        />
        <p className="hint">{helps.help}</p>
      </section>

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
          placeholder="AIza…"
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
          {['gemini-2.5-flash-image'].map((m) => (
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

      <WheelEditor onSaved={() => setSavedAt(Date.now())} />

      {savedAt && <div className="saved">{t('savedAt')} · {new Date(savedAt).toLocaleTimeString()}</div>}
    </div>
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
  const SPREAD = 32;

  // Guard: the expanded spoke may have lost its children mid-edit.
  const expIdx =
    expanded != null && (spokes[expanded]?.children.length ?? 0) > 0 ? expanded : null;
  const exp = expIdx != null ? spokes[expIdx]! : null;

  const childPos = (j: number, count: number) => {
    const offset = count === 1 ? 0 : (j - (count - 1) / 2) * 2 * SPREAD;
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
      <span className="wp-emoji">{item.emoji || '❓'}</span>
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
        return button(s, p.x, p.y, WHEEL_BG[i]!, {
          dim: dimmed,
          onClick:
            s.children.length > 0 ? () => onExpand(isExp ? null : i) : undefined,
        });
      })}
      {exp?.children.map((c, j) => {
        const p = childPos(j, exp.children.length);
        return button(c, p.x, p.y, WHEEL_BG[expIdx!]!, {});
      })}
      <div className="wp-centre wp-click" onClick={() => onExpand(null)}>
        {expIdx == null ? '✕' : '↩'}
      </div>
    </div>
  );
}

const KIND_ORDER = ['prompt', 'search', 'save', 'generate'] as const;
type KindKey = (typeof KIND_ORDER)[number];

function kindLabel(k: KindKey): string {
  return k === 'prompt'
    ? t('wheelKindPrompt')
    : k === 'search'
      ? t('wheelKindSearch')
      : k === 'save'
        ? t('wheelKindSave')
        : t('wheelKindGenerate');
}

function actionOf(kind: KindKey, param: string): WheelAction {
  switch (kind) {
    case 'prompt':
      return { kind: 'prompt', prompt: param };
    case 'search':
      return { kind: 'search', urlPrefix: param };
    case 'save':
      return { kind: 'save' };
    case 'generate':
      return { kind: 'generate' };
  }
}

function kindOf(a: WheelAction | null): KindKey {
  return a?.kind ?? 'prompt';
}

function paramOf(a: WheelAction | null): string {
  if (a?.kind === 'prompt') return a.prompt;
  if (a?.kind === 'search') return a.urlPrefix;
  return '';
}

function ItemFields({
  item,
  onChange,
}: {
  item: WheelItem;
  onChange: (next: WheelItem) => void;
}) {
  const kind = kindOf(item.action);
  const needsParam = kind === 'prompt' || kind === 'search';
  return (
    <div className="wheel-item">
      <div className="hbox">
        <input
          className="wheel-emoji"
          value={item.emoji}
          placeholder={t('wheelEmojiPh')}
          onInput={(e) => onChange({ ...item, emoji: (e.target as HTMLInputElement).value })}
        />
        <input
          value={item.label}
          placeholder={t('wheelLabelPh')}
          onInput={(e) => onChange({ ...item, label: (e.target as HTMLInputElement).value })}
        />
        <select
          value={kind}
          onChange={(e) => {
            const k = (e.target as HTMLSelectElement).value as KindKey;
            onChange({ ...item, action: actionOf(k, paramOf(item.action)) });
          }}
        >
          {KIND_ORDER.map((k) => (
            <option key={k} value={k}>{kindLabel(k)}</option>
          ))}
        </select>
      </div>
      {needsParam && (
        <textarea
          rows={kind === 'prompt' ? 3 : 1}
          value={paramOf(item.action)}
          placeholder={kind === 'prompt' ? t('wheelPromptPh') : t('wheelUrlPh')}
          onInput={(e) =>
            onChange({ ...item, action: actionOf(kind, (e.target as HTMLTextAreaElement).value) })
          }
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
            style={{ borderLeft: `4px solid ${WHEEL_BG[i]!}` }}
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
                        : [{ emoji: '❓', label: '', action: actionOf('prompt', ''), children: [] }],
                    })
                  }
                />{' '}
                {t('wheelModeChildren')}
              </label>
            </div>
            {isSub ? (
              <>
                <div className="hbox">
                  <input
                    className="wheel-emoji"
                    value={spoke.emoji}
                    placeholder={t('wheelEmojiPh')}
                    onInput={(e) =>
                      patchSpoke(i, { ...spoke, emoji: (e.target as HTMLInputElement).value })
                    }
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
                      onChange={(next) =>
                        patchSpoke(i, {
                          ...spoke,
                          children: spoke.children.map((c, m) => (m === j ? next : c)),
                        })
                      }
                    />
                    <button
                      type="button"
                      disabled={spoke.children.length <= 1}
                      onClick={() =>
                        patchSpoke(i, {
                          ...spoke,
                          children: spoke.children.filter((_, m) => m !== j),
                        })
                      }
                    >
                      {t('wheelRemove')}
                    </button>
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
                          { emoji: '❓', label: '', action: actionOf('prompt', ''), children: [] },
                        ],
                      })
                    }
                  >
                    {t('wheelAddChild')}
                  </button>
                )}
              </>
            ) : (
              <ItemFields item={spoke} onChange={(next) => patchSpoke(i, next)} />
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
            void setWheelConfig(cfg).then(onSaved);
          }}
        >
          {t('wheelSaveBtn')}
        </button>
        <button
          type="button"
          onClick={() => {
            void resetWheelConfig().then(() => {
              setCfg(defaultWheel());
              setError(null);
              onSaved();
            });
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

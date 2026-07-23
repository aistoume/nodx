/**
 * nodx Lens settings window — AI provider / key + the action-wheel editor.
 *
 * Lives in its own decorated window because the pet card (380×460) is far
 * too cramped for a four-spoke editor. Saving broadcasts `pet://config`
 * so the running pet picks the new wheel up without a restart.
 */

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { applyDir, getLanguage, LANGUAGES, setLanguage, t, type Language } from './i18n';
import {
  CLI_PRESETS,
  kindLabel,
  SEARCH_PRESETS,
  SPOKE_COLORS,
  spokePosLabels,
  defaultWheel,
  loadWheel,
  saveWheel,
  type WheelConfig,
  type WheelKind,
  type WheelSpoke,
} from './wheel';
import './settings.css';

type Provider = 'anthropic' | 'openai' | 'gemini';
const PROVIDERS: { id: Provider; label: string; hint: string }[] = [
  { id: 'anthropic', label: 'Claude', hint: 'sk-ant-… · console.anthropic.com' },
  { id: 'openai', label: 'GPT', hint: 'sk-… · platform.openai.com' },
  { id: 'gemini', label: 'Gemini', hint: 'AQ.… / AIza… · aistudio.google.com' },
];
const PROVIDER_KEY = 'nodx-pet-provider';
const KINDS: WheelKind[] = ['prompt', 'search', 'ask', 'shot', 'cli'];

/** Live preview — the same geometry the pet renders. */
function WheelPreview({ spokes }: { spokes: WheelSpoke[] }) {
  const R = 68;
  const pos = [
    { x: 0, y: -R },
    { x: R, y: 0 },
    { x: 0, y: R },
    { x: -R, y: 0 },
  ];
  return (
    <div className="wp">
      {spokes.map((s, i) => (
        <div
          key={i}
          className="wp-spoke"
          style={{
            background: SPOKE_COLORS[i],
            transform: `translate(${pos[i]!.x}px, ${pos[i]!.y}px)`,
          }}
        >
          <span>{s.emoji || '❓'}</span>
          <em>{s.label}</em>
        </div>
      ))}
      <div className="wp-centre">✕</div>
    </div>
  );
}

export function SettingsApp() {
  const [lang, setLang] = useState<Language>(getLanguage);
  const POS_LABELS = spokePosLabels();
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [cfg, setCfg] = useState<WheelConfig>(loadWheel);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    applyDir();
    const p = (localStorage.getItem(PROVIDER_KEY) as Provider | null) ?? 'anthropic';
    setProvider(p);
    void invoke<boolean>('pet_key_has', { provider: p }).then(setHasKey).catch(() => {});
  }, []);

  const pickProvider = useCallback((p: Provider) => {
    setProvider(p);
    localStorage.setItem(PROVIDER_KEY, p);
    void invoke<boolean>('pet_key_has', { provider: p }).then(setHasKey).catch(() => {});
    void emit('pet://config');
  }, []);

  const saveKey = useCallback(async () => {
    const k = keyInput.trim();
    await invoke('pet_key_set', { provider, key: k });
    setHasKey(k.length > 0);
    setKeyInput('');
    setSaved(t('stKeySavedMsg'));
    setTimeout(() => setSaved(null), 2000);
  }, [keyInput, provider]);

  const patch = useCallback((i: number, next: Partial<WheelSpoke>) => {
    setCfg((c) => {
      const spokes = c.spokes.map((s, j) => (j === i ? { ...s, ...next } : s));
      return { ...c, spokes: spokes as WheelConfig['spokes'] };
    });
  }, []);

  const saveAll = useCallback(() => {
    saveWheel(cfg);
    void emit('pet://config');
    setSaved(t('stSavedMsg'));
    setTimeout(() => setSaved(null), 2200);
  }, [cfg]);

  return (
    <div className="st">
      <h1>{t('stTitle')}</h1>

      <section>
        <h2>{t('stLanguage')}</h2>
        <select
          value={lang}
          onChange={(e) => {
            const l = e.target.value as Language;
            setLanguage(l);
            setLang(l);
            applyDir();
            void emit('pet://config');
            // Strings are read at render time — reload so every label flips.
            location.reload();
          }}
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.id === 'auto' ? t('stLangAuto') : l.label}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h2>{t('stProvider')}</h2>
        <div className="row">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              className={`prov${provider === p.id ? ' on' : ''}`}
              onClick={() => pickProvider(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="hint">{PROVIDERS.find((p) => p.id === provider)?.hint}</p>
        <div className="row">
          <input
            type="password"
            placeholder={hasKey ? t('stKeySavedPh') : t('stKeyPh')}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveKey();
            }}
          />
          <button className="primary" onClick={() => void saveKey()}>
            {t('stSave')}
          </button>
        </div>
        <p className="hint">{t('stKeyHint')}</p>
      </section>

      <section>
        <h2>{t('stWheel')}</h2>
        <p className="hint">{t('stWheelHint')}</p>
        <div className="wheel-body">
          <WheelPreview spokes={cfg.spokes} />
          <div className="editors">
            {cfg.spokes.map((s, i) => (
              <div className="spoke" key={i} style={{ borderLeft: `4px solid ${SPOKE_COLORS[i]}` }}>
                <strong>{POS_LABELS[i]}</strong>
                <div className="row">
                  <input
                    className="emoji"
                    value={s.emoji}
                    placeholder={t('stIcon')}
                    onChange={(e) => patch(i, { emoji: e.target.value })}
                  />
                  <input
                    value={s.label}
                    placeholder={t('stName')}
                    onChange={(e) => patch(i, { label: e.target.value })}
                  />
                  <select
                    value={s.kind}
                    onChange={(e) => {
                      const kind = e.target.value as WheelKind;
                      const d = defaultWheel().spokes.find((x) => x.kind === kind);
                      patch(i, { kind, param: kind === s.kind ? s.param : (d?.param ?? '') });
                    }}
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {kindLabel(k)}
                      </option>
                    ))}
                  </select>
                </div>
                {s.kind === 'prompt' && (
                  <textarea
                    rows={2}
                    value={s.param}
                    placeholder={t('stPromptPh')}
                    onChange={(e) => patch(i, { param: e.target.value })}
                  />
                )}
                {s.kind === 'cli' && (
                  <>
                    <div className="row">
                      <select
                        value={CLI_PRESETS.some((c) => c.cmd === s.param) ? s.param : '__custom__'}
                        onChange={(e) => {
                          if (e.target.value !== '__custom__') patch(i, { param: e.target.value });
                        }}
                      >
                        {CLI_PRESETS.map((c) => (
                          <option key={c.cmd} value={c.cmd}>
                            {c.label}
                          </option>
                        ))}
                        <option value="__custom__">{t('stCustomCmd')}</option>
                      </select>
                    </div>
                    <input
                      value={s.param}
                      placeholder={t('stCmdPh')}
                      onChange={(e) => patch(i, { param: e.target.value })}
                    />
                    <p className="hint">
                      {t('stCmdHint')}
                    </p>
                  </>
                )}
                {s.kind === 'search' && (
                  <>
                    <select
                      value={SEARCH_PRESETS.some((p) => p.url === s.param) ? s.param : '__custom__'}
                      onChange={(e) => {
                        if (e.target.value !== '__custom__') patch(i, { param: e.target.value });
                      }}
                    >
                      {SEARCH_PRESETS.map((p) => (
                        <option key={p.url} value={p.url}>
                          {p.label}
                        </option>
                      ))}
                      <option value="__custom__">{t('stCustomUrl')}</option>
                    </select>
                    {!SEARCH_PRESETS.some((p) => p.url === s.param) && (
                      <input
                        value={s.param}
                        placeholder={t('stUrlPh')}
                        onChange={(e) => patch(i, { param: e.target.value })}
                      />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="row">
          <button className="primary" onClick={saveAll}>
            {t('stSaveWheel')}
          </button>
          <button
            onClick={() => {
              setCfg(defaultWheel());
            }}
          >
            {t('stReset')}
          </button>
          {saved && <span className="saved">{saved}</span>}
        </div>
      </section>
    </div>
  );
}

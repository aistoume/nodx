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

const MODELS: Record<Provider, { explain: string[]; deepen: string[]; help: string }> = {
  anthropic: {
    explain: ['claude-haiku-4-5'],
    deepen: ['claude-sonnet-4-6', 'claude-opus-4-6'],
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

  async function save(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
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

      {savedAt && <div className="saved">{t('savedAt')} · {new Date(savedAt).toLocaleTimeString()}</div>}
    </div>
  );
}

render(<App />, document.getElementById('root')!);

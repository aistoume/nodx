/**
 * Settings — AI key configuration (and future per-app settings).
 *
 * Keys are stored in the OS keychain via the Rust `ai_key_set` Tauri
 * command. The plaintext value never touches disk, never leaves the
 * process, and never appears in any log or .env file.
 *
 * UX rules:
 *   - We don't display the actual stored key (security + we'd have to
 *     add a `get_key` command which is a footgun). Just show "✓ Configured".
 *   - Saving an empty value deletes the key (lets the user revoke).
 *   - Anthropic key is the only one required for the core flow (explain,
 *     decompose, panel). Gemini key only matters when CBR is exercised.
 *   - OpenAI is wired but currently unused — kept for the day we add an
 *     OpenAI-backed adapter to the Rust gateway.
 */

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  detectClaudeCli,
  getAiMode,
  hasAiKey,
  setAiKey,
  setAiMode,
  type AiMode,
  type AiProvider,
} from '../ai/gateway.js';
import { useT, type LocaleSetting, type StringKey } from '../i18n/index.js';

interface ProviderConfig {
  id: AiProvider;
  label: string;
  signupUrl: string;
  signupHintKey: StringKey;
  keyPrefix: string;
  required: 'core' | 'cbr-only' | 'future';
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    signupUrl: 'https://console.anthropic.com/settings/keys',
    signupHintKey: 'settings.keys.anthropic.hint',
    keyPrefix: 'sk-ant-',
    required: 'core',
  },
  {
    id: 'gemini',
    label: 'Google Gemini (embeddings)',
    signupUrl: 'https://aistudio.google.com/apikey',
    signupHintKey: 'settings.keys.gemini.hint',
    keyPrefix: 'AIza',
    required: 'cbr-only',
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    signupUrl: 'https://platform.openai.com/api-keys',
    signupHintKey: 'settings.keys.openai.hint',
    keyPrefix: 'sk-',
    required: 'future',
  },
];

interface Props {
  /** Called when user closes Settings (back to dialog view). */
  onClose: () => void;
}

export function SettingsView({ onClose }: Props) {
  const { t, setting: localeSetting, setSetting: setLocaleSetting } = useT();
  const [mode, setMode] = useState<AiMode | null>(null);

  useEffect(() => {
    void getAiMode().then(setMode);
  }, []);

  const handleModeChange = async (next: AiMode) => {
    setMode(next); // optimistic
    try {
      await setAiMode(next);
    } catch (err) {
      console.error('setAiMode failed', err);
      // revert
      void getAiMode().then(setMode);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-3 border-b border-border flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="text-ink-muted hover:text-ink"
          title={t('settings.back')}
        >
          {t('settings.back')}
        </button>
        <div className="font-bold text-lg">{t('settings.title')}</div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl mx-auto w-full">
        {/* ── Language selector ─────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-base font-semibold mb-1">{t('settings.language.h')}</h2>
          <p className="text-sm text-ink-muted leading-relaxed mb-4">
            {t('settings.language.desc')}
          </p>
          <div className="flex gap-2">
            {(['auto', 'zh', 'en'] as LocaleSetting[]).map((s) => {
              const active = localeSetting === s;
              const label =
                s === 'auto'
                  ? t('settings.language.auto')
                  : s === 'zh'
                    ? t('settings.language.zh')
                    : t('settings.language.en');
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setLocaleSetting(s)}
                  className={
                    'px-3 py-1.5 text-sm rounded-md border transition ' +
                    (active
                      ? 'border-accent bg-accent/5 text-accent font-medium'
                      : 'border-border text-ink-muted hover:border-accent/60 hover:text-ink')
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Mode selector ─────────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-base font-semibold mb-1">{t('settings.mode.h')}</h2>
          <p className="text-sm text-ink-muted leading-relaxed mb-4">
            {t('settings.mode.desc')}
          </p>

          {mode === null ? (
            <div className="text-sm text-ink-muted py-3">{t('settings.mode.loading')}</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <ModeCard
                active={mode === 'api_key'}
                onClick={() => void handleModeChange('api_key')}
                icon="🔑"
                title={t('settings.mode.apiKey.title')}
                subtitle={t('settings.mode.apiKey.subtitle')}
                pros={[
                  t('settings.mode.apiKey.pros.latency'),
                  t('settings.mode.apiKey.pros.web'),
                  t('settings.mode.apiKey.pros.embed'),
                ]}
              />
              <ModeCard
                active={mode === 'cli'}
                onClick={() => void handleModeChange('cli')}
                icon="🎫"
                title={t('settings.mode.cli.title')}
                subtitle={t('settings.mode.cli.subtitle')}
                pros={[
                  t('settings.mode.cli.pros.noKey'),
                  t('settings.mode.cli.pros.flat'),
                  t('settings.mode.cli.pros.reuse'),
                ]}
              />
            </div>
          )}
        </section>

        {/* ── Body — depends on selected mode ───────────────────────── */}
        {mode === 'cli' ? (
          <ClaudeCliSection />
        ) : (
          <section className="mb-8">
            <h2 className="text-base font-semibold mb-1">{t('settings.keys.h')}</h2>
            <p className="text-sm text-ink-muted leading-relaxed mb-4">
              {t('settings.keys.desc')}
            </p>

            <div className="flex flex-col gap-4">
              {PROVIDERS.map((p) => (
                <ProviderRow key={p.id} provider={p} />
              ))}
            </div>
          </section>
        )}

        {/* System-wide capture (0.3) */}
        <SystemCaptureSection />

        <section className="mt-8 pt-6 border-t border-border text-xs text-ink-muted">
          <p>{t('settings.footer.keychain')}</p>
          <p className="mt-2">{t('settings.footer.cliMode')}</p>
        </section>
      </div>
    </div>
  );
}

/**
 * System-wide ⌥+E capture status panel.
 *
 * Surfaces three pieces of state:
 *  - whether the global ⌥+E hotkey was registered (could fail if another
 *    app already owns the key — most likely the old standalone lens-mac)
 *  - whether macOS has granted Accessibility permission (required for
 *    nodx to synthesise ⌘+C system-wide)
 *  - a one-click button into the right System Settings pane
 */
function SystemCaptureSection() {
  const { t } = useT();
  const [hotkeyActive, setHotkeyActive] = useState<boolean | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const refresh = async () => {
    try {
      const [hk, perm] = await Promise.all([
        invoke<boolean>('capture_is_hotkey_active'),
        invoke<boolean>('capture_has_permission'),
      ]);
      setHotkeyActive(hk);
      setHasPermission(perm);
    } catch {
      setHotkeyActive(false);
      setHasPermission(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const openSettings = async () => {
    try {
      await invoke('capture_open_permission_settings');
    } catch {
      /* best-effort */
    }
  };

  return (
    <section className="mt-8 pt-6 border-t border-border">
      <h2 className="text-base font-semibold mb-1">{t('settings.capture.h')}</h2>
      <p className="text-sm text-ink-muted leading-relaxed mb-4">
        {t('settings.capture.desc')}
      </p>

      <div className="border border-border rounded-lg bg-surface p-4 mb-4">
        {/* Hotkey row */}
        <Row
          label={t('settings.capture.hotkey')}
          value={
            hotkeyActive === null ? (
              <span className="text-ink-muted text-xs">{t('settings.keys.detecting')}</span>
            ) : hotkeyActive ? (
              <span className="text-emerald-600 font-medium text-sm">
                {t('settings.capture.hotkeyOn')}
              </span>
            ) : (
              <span className="text-amber-600 font-medium text-sm">
                {t('settings.capture.hotkeyOff')}
              </span>
            )
          }
        />
        {hotkeyActive === false && (
          <p className="text-xs text-ink-muted mt-1 leading-relaxed">
            {t('settings.capture.hotkeyOffHint')}
          </p>
        )}

        {/* Permission row */}
        <div className="border-t border-border my-3" />
        <Row
          label={t('settings.capture.perm')}
          value={
            hasPermission === null ? (
              <span className="text-ink-muted text-xs">{t('settings.keys.detecting')}</span>
            ) : hasPermission ? (
              <span className="text-emerald-600 font-medium text-sm">
                {t('settings.capture.permGranted')}
              </span>
            ) : (
              <span className="text-amber-600 font-medium text-sm">
                {t('settings.capture.permMissing')}
              </span>
            )
          }
        />
        {hasPermission === false && (
          <p className="text-xs text-ink-muted mt-1 leading-relaxed">
            {t('settings.capture.permMissingHint')}
          </p>
        )}

        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => void openSettings()}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90"
          >
            {t('settings.capture.openSystem')}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:border-accent text-ink-muted hover:text-ink"
          >
            {t('settings.capture.recheck')}
          </button>
        </div>
      </div>

      <details className="text-xs text-ink-muted">
        <summary className="cursor-pointer hover:text-ink">
          {t('settings.capture.how')}
        </summary>
        <p className="mt-2 leading-relaxed">
          {t('settings.capture.howBody')}
        </p>
      </details>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="ml-auto">{value}</span>
    </div>
  );
}

interface ModeCardProps {
  active: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  subtitle: string;
  pros: string[];
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
  pros,
}: ModeCardProps) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'text-left rounded-lg border p-4 transition ' +
        (active
          ? 'border-accent bg-accent/5 ring-2 ring-accent/30'
          : 'border-border bg-surface hover:border-accent/60')
      }
    >
      <div className="flex items-start gap-2 mb-2">
        <span className="text-2xl leading-none">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-[11px] text-ink-muted">{subtitle}</div>
        </div>
        {active && (
          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent text-white">
            {t('settings.mode.current')}
          </span>
        )}
      </div>
      <ul className="text-[11px] text-ink-muted space-y-0.5 mt-2">
        {pros.map((p) => (
          <li key={p}>· {p}</li>
        ))}
      </ul>
    </button>
  );
}

function ClaudeCliSection() {
  const { t } = useT();
  const [status, setStatus] = useState<
    | { state: 'checking' }
    | { state: 'ok'; version: string }
    | { state: 'error'; message: string }
  >({ state: 'checking' });

  const runDetect = async () => {
    setStatus({ state: 'checking' });
    try {
      const v = await detectClaudeCli();
      setStatus({ state: 'ok', version: v });
    } catch (err) {
      setStatus({
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  useEffect(() => {
    void runDetect();
  }, []);

  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold mb-1">{t('settings.cli.h')}</h2>
      <p className="text-sm text-ink-muted leading-relaxed mb-4">
        {t('settings.cli.desc')}
      </p>

      <div className="border border-border rounded-lg bg-surface p-4 mb-4">
        {status.state === 'checking' && (
          <div className="text-sm text-ink-muted flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            {t('settings.cli.probing')}
          </div>
        )}
        {status.state === 'ok' && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-emerald-600 font-semibold">{t('settings.cli.ok')}</span>
              <code className="text-xs text-ink-muted bg-canvas px-1.5 py-0.5 rounded">
                {status.version}
              </code>
            </div>
            <div className="text-xs text-ink-muted">
              {t('settings.cli.okHint')}
            </div>
            <button
              type="button"
              onClick={() => void runDetect()}
              className="text-xs text-accent hover:underline mt-2"
            >
              {t('settings.cli.retry')}
            </button>
          </div>
        )}
        {status.state === 'error' && (
          <div>
            <div className="text-sm text-red-600 font-semibold mb-2">
              {t('settings.cli.error')}
            </div>
            <div className="text-xs text-ink-muted mb-3 whitespace-pre-wrap break-words">
              {status.message}
            </div>
            <div className="text-sm font-medium mb-1">{t('settings.cli.installTitle')}</div>
            <pre className="text-xs bg-canvas rounded p-2 overflow-x-auto">
{`npm i -g @anthropic-ai/claude-code
claude`}
            </pre>
            <button
              type="button"
              onClick={() => void runDetect()}
              className="text-xs text-accent hover:underline mt-2"
            >
              {t('settings.cli.installedRetry')}
            </button>
          </div>
        )}
      </div>

      <details className="text-xs text-ink-muted">
        <summary className="cursor-pointer hover:text-ink">
          {t('settings.cli.limits')}
        </summary>
        <ul className="mt-2 space-y-1 list-disc list-inside leading-relaxed">
          <li>{t('settings.cli.limit.latency')}</li>
          <li>{t('settings.cli.limit.noEmbed')}</li>
          <li>{t('settings.cli.limit.needsInstall')}</li>
          <li>{t('settings.cli.limit.webSearch')}</li>
        </ul>
      </details>
    </section>
  );
}

function ProviderRow({ provider }: { provider: ProviderConfig }) {
  const { t } = useT();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    void hasAiKey(provider.id).then(setConfigured);
  }, [provider.id]);

  const handleSave = async () => {
    const value = keyInput.trim();
    setError(null);
    setSaving(true);
    try {
      // Light prefix sanity check — keep typos from silently failing later.
      if (value && !value.startsWith(provider.keyPrefix)) {
        const proceed = confirm(
          t('settings.keys.prefixWarn', {
            label: provider.label,
            prefix: provider.keyPrefix,
          }),
        );
        if (!proceed) {
          setSaving(false);
          return;
        }
      }
      await setAiKey(provider.id, value);
      setConfigured(value.length > 0);
      setEditing(false);
      setKeyInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const badge =
    provider.required === 'core' ? (
      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
        {t('settings.keys.core')}
      </span>
    ) : provider.required === 'cbr-only' ? (
      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
        {t('settings.keys.cbrOnly')}
      </span>
    ) : (
      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-600">
        {t('settings.keys.futureOnly')}
      </span>
    );

  return (
    <div className="border border-border rounded-lg bg-surface p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="font-semibold text-sm">{provider.label}</div>
        {badge}
        <div className="ml-auto">
          {configured === null ? (
            <span className="text-xs text-ink-muted">{t('settings.keys.detecting')}</span>
          ) : configured ? (
            <span className="text-xs text-emerald-600 font-medium">
              {t('settings.keys.configured')}
            </span>
          ) : (
            <span className="text-xs text-ink-muted">{t('settings.keys.notConfigured')}</span>
          )}
        </div>
      </div>

      <div className="text-xs text-ink-muted mb-3">
        {t('settings.keys.getKey')}{' '}
        <a
          href={provider.signupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          {t(provider.signupHintKey)} ↗
        </a>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.currentTarget.value)}
              placeholder={`${provider.keyPrefix}...`}
              autoFocus
              disabled={saving}
              className="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-canvas focus:outline-none focus:border-accent font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave();
                if (e.key === 'Escape') {
                  setEditing(false);
                  setKeyInput('');
                  setError(null);
                }
              }}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="px-2 py-1 text-xs rounded-md border border-border text-ink-muted hover:text-ink"
              title={showKey ? t('settings.keys.hide') : t('settings.keys.show')}
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving
                ? t('settings.keys.saving')
                : keyInput.trim()
                  ? t('settings.keys.saveToKeychain')
                  : t('settings.keys.clearStored')}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setKeyInput('');
                setError(null);
              }}
              className="px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:border-accent hover:text-accent"
          >
            {configured ? t('settings.keys.replace') : t('settings.keys.add')}
          </button>
          {configured && (
            <button
              type="button"
              onClick={async () => {
                if (
                  confirm(t('settings.keys.confirmDelete', { provider: provider.label }))
                ) {
                  await setAiKey(provider.id, '');
                  setConfigured(false);
                }
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-ink-muted hover:text-red-600"
            >
              {t('settings.keys.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

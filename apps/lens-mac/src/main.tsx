/** @jsxImportSource preact */
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { LazyStore } from '@tauri-apps/plugin-store';

import { callAnthropic, callOpenAI, callGoogle } from './lib/providers';
import { buildExplainPrompt, type Locale } from './lib/prompts';

type Provider = 'anthropic' | 'openai' | 'google';

interface Settings {
  provider: Provider;
  apiKey: string;
  model: string;
  locale: Locale;
}

const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-haiku-4-5',
  locale: navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en',
};

const store = new LazyStore('settings.json');

async function loadSettings(): Promise<Settings> {
  const s: Partial<Settings> = {};
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = await store.get<unknown>(k);
    if (v !== undefined && v !== null) (s as Record<string, unknown>)[k] = v;
  }
  return { ...DEFAULT_SETTINGS, ...s };
}

async function saveSettings(s: Partial<Settings>): Promise<void> {
  for (const [k, v] of Object.entries(s)) await store.set(k, v);
  await store.save();
}

function App() {
  const [mode, setMode] = useState<'closed' | 'panel' | 'settings' | 'permission'>('panel');
  const [text, setText] = useState('');
  const [body, setBody] = useState('');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'streaming' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);

    // Permission gate event from Rust
    const unPerm = listen('permission-required', async () => {
      setMode('permission');
      await getCurrentWindow().show();
      await getCurrentWindow().setFocus();
    });

    // Listen for the Rust side telling us to fire (after global shortcut)
    const un = listen<string>('explain-clipboard', async (event) => {
      // Open settings if no API key yet
      const s = await loadSettings();
      setSettings(s);
      if (!s.apiKey) {
        setMode('settings');
        await getCurrentWindow().show();
        await getCurrentWindow().setFocus();
        return;
      }
      const clip = (event.payload || (await readText()) || '').trim();
      if (!clip) return;
      setMode('panel');
      setText(clip);
      runExplain(clip, s);
    });

    // Esc to close
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      void un.then((f) => f());
      void unPerm.then((f) => f());
    };
  }, []);

  async function runExplain(clip: string, s: Settings) {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setBody('');
    setError(null);
    setPhase('loading');
    const prompt = buildExplainPrompt(clip, s.locale);

    const onChunk = (t: string) => {
      setPhase('streaming');
      setBody((prev) => prev + t);
    };
    try {
      switch (s.provider) {
        case 'anthropic':
          await callAnthropic(s.apiKey, s.model, prompt, onChunk, abortRef.current.signal); break;
        case 'openai':
          await callOpenAI(s.apiKey, s.model, prompt, onChunk, abortRef.current.signal); break;
        case 'google':
          await callGoogle(s.apiKey, s.model, prompt, onChunk, abortRef.current.signal); break;
      }
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }

  async function closePanel() {
    abortRef.current?.abort();
    setMode('closed');
    await getCurrentWindow().hide();
  }

  if (mode === 'permission') {
    return <PermissionView locale={settings.locale} onClose={closePanel} />;
  }

  if (mode === 'settings') {
    return <SettingsView settings={settings} onSave={async (s) => {
      await saveSettings(s);
      const next = await loadSettings();
      setSettings(next);
    }} onClose={closePanel} />;
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">nodx Lens · {settings.locale === 'zh' ? '解释' : 'Explanation'}</span>
        <span className="panel-close" onClick={closePanel}>✕</span>
      </div>
      <div className={`panel-body ${phase === 'loading' ? 'loading' : ''} ${phase === 'error' ? 'error' : ''}`}>
        {phase === 'idle' && (settings.locale === 'zh'
          ? '在任何 App 里选中文字 → 按 ⌥ + E 即可解释'
          : 'Select any text in any app → press ⌥ + E to explain.')}
        {phase === 'loading' && (settings.locale === 'zh' ? '连接中…' : 'Connecting…')}
        {(phase === 'streaming' || phase === 'done') && body}
        {phase === 'streaming' && <span className="cursor" />}
        {phase === 'error' && (settings.locale === 'zh' ? `出错了：${error}` : `Error: ${error}`)}
      </div>
    </div>
  );
}

function SettingsView({ settings, onSave, onClose }: {
  settings: Settings;
  onSave: (s: Partial<Settings>) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Settings>(settings);
  useEffect(() => { setDraft(settings); }, [settings]);

  const modelOptions: Record<Provider, string[]> = {
    anthropic: ['claude-haiku-4-5', 'claude-sonnet-5'],
    openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-5'],
    google: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">nodx Lens · Settings</span>
        <span className="panel-close" onClick={onClose}>✕</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Provider">
          <select value={draft.provider} onChange={(e) => setDraft({
            ...draft,
            provider: (e.target as HTMLSelectElement).value as Provider,
            model: modelOptions[(e.target as HTMLSelectElement).value as Provider][0],
          })}>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI</option>
            <option value="google">Google Gemini</option>
          </select>
        </Field>
        <Field label="API Key">
          <input type="password" value={draft.apiKey} placeholder="sk-..."
            onInput={(e) => setDraft({ ...draft, apiKey: (e.target as HTMLInputElement).value })} />
        </Field>
        <Field label="Model">
          <select value={draft.model} onChange={(e) =>
            setDraft({ ...draft, model: (e.target as HTMLSelectElement).value })}>
            {modelOptions[draft.provider].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Language">
          <select value={draft.locale} onChange={(e) =>
            setDraft({ ...draft, locale: (e.target as HTMLSelectElement).value as Locale })}>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </Field>
        <button
          style={{
            padding: '8px 16px', background: '#2C5282', color: '#fff',
            border: 0, borderRadius: 6, cursor: 'pointer', marginTop: 8,
          }}
          onClick={async () => { await onSave(draft); onClose(); }}
        >Save</button>
        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
          Tip: hotkey is ⌥ + E. Select text in any app → ⌘ + C → ⌥ + E.
        </div>
      </div>
    </div>
  );
}

function PermissionView({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const isZh = locale === 'zh';
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">nodx Lens · {isZh ? '需要权限' : 'Permission Needed'}</span>
        <span className="panel-close" onClick={onClose}>✕</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>
          {isZh ? (
            <>
              <strong>nodx Lens 需要"辅助功能"权限</strong>才能在你按 ⌥+E 时
              自动抓取选中文字（模拟 ⌘+C）。
            </>
          ) : (
            <>
              <strong>nodx Lens needs Accessibility permission</strong> to
              auto-capture your selection when you press ⌥+E (it simulates ⌘+C
              behind the scenes).
            </>
          )}
        </div>
        <ol style={{ paddingLeft: 18, fontSize: 13, color: '#555', lineHeight: 1.7 }}>
          <li>{isZh ? '系统设置已自动打开 → 隐私与安全 → 辅助功能' : 'System Settings has opened → Privacy & Security → Accessibility'}</li>
          <li>{isZh ? '在列表里勾选 nodx Lens' : 'Toggle on nodx Lens in the list'}</li>
          <li>{isZh ? '在本窗口关闭后，重新按 ⌥+E 即可' : 'Close this window, then press ⌥+E again'}</li>
        </ol>
        <div style={{ fontSize: 11, color: '#888' }}>
          {isZh
            ? '如果列表里没有 nodx Lens：点 + 号 → 选择 /Applications/nodx Lens.app（或 dev 模式下的 target/debug/nodx-lens）'
            : 'If nodx Lens is not in the list: click + → choose /Applications/nodx Lens.app (or target/debug/nodx-lens in dev mode)'}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <span style={{ display: 'flex' }}>{children}</span>
      <style>{`
        input, select {
          flex: 1; padding: 6px 10px; font-size: 13px;
          border: 1px solid #ddd; border-radius: 6px; background: #fff;
          font-family: inherit;
        }
      `}</style>
    </label>
  );
}

render(<App />, document.getElementById('root')!);

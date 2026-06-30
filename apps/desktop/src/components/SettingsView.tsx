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

interface ProviderConfig {
  id: AiProvider;
  label: string;
  signupUrl: string;
  signupHint: string;
  keyPrefix: string;
  required: 'core' | 'cbr-only' | 'future';
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    signupUrl: 'https://console.anthropic.com/settings/keys',
    signupHint: '在 console.anthropic.com → Settings → API Keys 申请',
    keyPrefix: 'sk-ant-',
    required: 'core',
  },
  {
    id: 'gemini',
    label: 'Google Gemini (embeddings)',
    signupUrl: 'https://aistudio.google.com/apikey',
    signupHint: '在 aistudio.google.com/apikey 免费申请',
    keyPrefix: 'AIza',
    required: 'cbr-only',
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT) — 暂未使用',
    signupUrl: 'https://platform.openai.com/api-keys',
    signupHint: '保留接口，目前 nodx 内不调用',
    keyPrefix: 'sk-',
    required: 'future',
  },
];

interface Props {
  /** Called when user closes Settings (back to dialog view). */
  onClose: () => void;
}

export function SettingsView({ onClose }: Props) {
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
          title="返回"
        >
          ← 返回
        </button>
        <div className="font-bold text-lg">⚙ 设置</div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl mx-auto w-full">
        {/* ── Mode selector ─────────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-base font-semibold mb-1">AI 接入方式</h2>
          <p className="text-sm text-ink-muted leading-relaxed mb-4">
            nodx 支持两种方式调 Claude — 选一种用，随时可以切换。
          </p>

          {mode === null ? (
            <div className="text-sm text-ink-muted py-3">加载中…</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <ModeCard
                active={mode === 'api_key'}
                onClick={() => void handleModeChange('api_key')}
                icon="🔑"
                title="API key 直连"
                subtitle="sk-ant-... · 按 token 用量付费"
                pros={['延迟最低 <500ms', '支持 web 搜索', '案例库（embedding）可用']}
              />
              <ModeCard
                active={mode === 'cli'}
                onClick={() => void handleModeChange('cli')}
                icon="🎫"
                title="Claude Code 订阅"
                subtitle="走本机已登录的 claude CLI · 月费封顶"
                pros={['不用填 API key', '订阅一价无量限', '用你已付的 Pro/Max']}
              />
            </div>
          )}
        </section>

        {/* ── Body — depends on selected mode ───────────────────────── */}
        {mode === 'cli' ? (
          <ClaudeCliSection />
        ) : (
          <section className="mb-8">
            <h2 className="text-base font-semibold mb-1">AI 提供商 API key</h2>
            <p className="text-sm text-ink-muted leading-relaxed mb-4">
              nodx 不存任何 key 到云端，也不收集任何用量数据。你填的 key 直接
              存到 macOS 钥匙串（加密 · 跟 Safari/Mail 同款），AI 调用从你的
              机器直接打到提供商，<strong>nodx 服务器从不在数据链路里</strong>。
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
          <p>
            <strong>钥匙串安全</strong>：API key 存在 macOS Keychain
            （搜 <code>app.nodx.desktop</code> 可见），只有这个 app 的
            进程能读，nodx 服务器拿不到。
          </p>
          <p className="mt-2">
            <strong>Claude Code 模式</strong>：nodx Rust 进程
            <code> spawn claude -p </code>子进程，输出原样回流，
            <strong>nodx 从不接触你的 OAuth token</strong>。
          </p>
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
      <h2 className="text-base font-semibold mb-1">⌥+E 全局划词解释</h2>
      <p className="text-sm text-ink-muted leading-relaxed mb-4">
        在任意 macOS app 里选中文字 → 按 <kbd className="px-1.5 py-0.5 rounded bg-canvas border border-border text-xs">⌥+E</kbd> →
        nodx 弹浮窗给你 AI 解释。一键收进 💡 灵感池。
      </p>

      <div className="border border-border rounded-lg bg-surface p-4 mb-4">
        {/* Hotkey row */}
        <Row
          label="全局快捷键"
          value={
            hotkeyActive === null ? (
              <span className="text-ink-muted text-xs">检测中…</span>
            ) : hotkeyActive ? (
              <span className="text-emerald-600 font-medium text-sm">
                ✓ 已激活 (⌥+E)
              </span>
            ) : (
              <span className="text-amber-600 font-medium text-sm">
                ⚠️ 未激活
              </span>
            )
          }
        />
        {hotkeyActive === false && (
          <p className="text-xs text-ink-muted mt-1 leading-relaxed">
            可能是另一个 app 占用了 ⌥+E（比如老版 nodx Lens for Mac —— 0.3 之后它已经合并进 nodx，
            建议从 /Applications 里删掉，然后重启 nodx）。
          </p>
        )}

        {/* Permission row */}
        <div className="border-t border-border my-3" />
        <Row
          label="Accessibility 权限"
          value={
            hasPermission === null ? (
              <span className="text-ink-muted text-xs">检测中…</span>
            ) : hasPermission ? (
              <span className="text-emerald-600 font-medium text-sm">
                ✓ 已授予
              </span>
            ) : (
              <span className="text-amber-600 font-medium text-sm">
                ⚠️ 未授予
              </span>
            )
          }
        />
        {hasPermission === false && (
          <p className="text-xs text-ink-muted mt-1 leading-relaxed">
            nodx 需要这个权限才能在其它 app 里模拟 ⌘+C 拿到你选中的文字。
            打开系统设置 → 隐私与安全性 → 辅助功能 → 勾选 nodx 即可。
          </p>
        )}

        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => void openSettings()}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90"
          >
            打开系统设置 · 辅助功能
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:border-accent text-ink-muted hover:text-ink"
          >
            🔄 重新探测
          </button>
        </div>
      </div>

      <details className="text-xs text-ink-muted">
        <summary className="cursor-pointer hover:text-ink">
          ⚠ macOS 权限工作原理
        </summary>
        <p className="mt-2 leading-relaxed">
          Apple 不允许应用直接读取其它 app 的选区文本 ——
          所以 nodx 走「Accessibility 权限 + CGEvent 模拟 ⌘+C + 读剪贴板」这套
          标准 macOS 流程。整个过程在你本机进行，原始剪贴板会在 120ms 内还原，
          nodx 不会看到也不会上传任何东西。
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
            当前
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
      <h2 className="text-base font-semibold mb-1">Claude Code CLI 状态</h2>
      <p className="text-sm text-ink-muted leading-relaxed mb-4">
        每次 AI 调用，nodx 都会跑你本机的 <code>claude -p</code>。要先装好
        Claude Code 并登录一次 —— nodx 不接触你的 OAuth token，只读子进程
        输出。
      </p>

      <div className="border border-border rounded-lg bg-surface p-4 mb-4">
        {status.state === 'checking' && (
          <div className="text-sm text-ink-muted flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            正在探测 claude CLI…
          </div>
        )}
        {status.state === 'ok' && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-emerald-600 font-semibold">✓ 已就绪</span>
              <code className="text-xs text-ink-muted bg-canvas px-1.5 py-0.5 rounded">
                {status.version}
              </code>
            </div>
            <div className="text-xs text-ink-muted">
              下一次 AI 调用就会用你的订阅 — 可以直接关 Settings 试一下了。
            </div>
            <button
              type="button"
              onClick={() => void runDetect()}
              className="text-xs text-accent hover:underline mt-2"
            >
              重新探测
            </button>
          </div>
        )}
        {status.state === 'error' && (
          <div>
            <div className="text-sm text-red-600 font-semibold mb-2">
              ⚠️ Claude Code 不可用
            </div>
            <div className="text-xs text-ink-muted mb-3 whitespace-pre-wrap break-words">
              {status.message}
            </div>
            <div className="text-sm font-medium mb-1">怎么装：</div>
            <pre className="text-xs bg-canvas rounded p-2 overflow-x-auto">
{`npm i -g @anthropic-ai/claude-code
claude            # 第一次跑会弹浏览器让你登录`}
            </pre>
            <button
              type="button"
              onClick={() => void runDetect()}
              className="text-xs text-accent hover:underline mt-2"
            >
              装完了 → 重新探测
            </button>
          </div>
        )}
      </div>

      <details className="text-xs text-ink-muted">
        <summary className="cursor-pointer hover:text-ink">
          ⚠ CLI 模式的限制
        </summary>
        <ul className="mt-2 space-y-1 list-disc list-inside leading-relaxed">
          <li>每次调用 cold-start <code>claude</code>，延迟 2-5 秒（vs API key 模式 &lt;500ms）</li>
          <li>不支持 embedding（案例库 / CBR 功能在 CLI 模式下不可用）</li>
          <li>需要本机装 Claude Code + 登录过</li>
          <li>无法保证 web search / 多模态等高级功能的稳定性 — 切回 API key 模式更可靠</li>
        </ul>
      </details>
    </section>
  );
}

function ProviderRow({ provider }: { provider: ProviderConfig }) {
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
          `这个 key 看起来不像 ${provider.label} 的 key（${provider.keyPrefix}... 开头）。继续保存？`,
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
        核心 · 必填
      </span>
    ) : provider.required === 'cbr-only' ? (
      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
        案例库 · 可选
      </span>
    ) : (
      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-600">
        未启用
      </span>
    );

  return (
    <div className="border border-border rounded-lg bg-surface p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="font-semibold text-sm">{provider.label}</div>
        {badge}
        <div className="ml-auto">
          {configured === null ? (
            <span className="text-xs text-ink-muted">检测中…</span>
          ) : configured ? (
            <span className="text-xs text-emerald-600 font-medium">
              ✓ 已配置
            </span>
          ) : (
            <span className="text-xs text-ink-muted">未配置</span>
          )}
        </div>
      </div>

      <div className="text-xs text-ink-muted mb-3">
        没 key？{' '}
        <a
          href={provider.signupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          {provider.signupHint} ↗
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
              title={showKey ? '隐藏' : '显示'}
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
              {saving ? '保存中…' : keyInput.trim() ? '保存到钥匙串' : '清除已存的 key'}
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
              取消
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
            {configured ? '替换 key' : '+ 添加 key'}
          </button>
          {configured && (
            <button
              type="button"
              onClick={async () => {
                if (confirm(`确定从钥匙串删除 ${provider.label} 的 key？`)) {
                  await setAiKey(provider.id, '');
                  setConfigured(false);
                }
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-ink-muted hover:text-red-600"
            >
              删除
            </button>
          )}
        </div>
      )}
    </div>
  );
}

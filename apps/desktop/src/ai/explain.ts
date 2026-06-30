import {
  ExplainOutputSchema,
  EXPLAIN_PROMPT_MODEL,
  buildExplainPrompt,
} from '@nodx/ai';
import { ai } from './gateway.js';

export interface ExplainResult {
  explanation: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Take a user-selected term/phrase, ask Haiku for a 50–150 char explanation,
 * and return just the validated string. The Zod schema in `@nodx/ai`
 * guards length, so a model that ignores the format gets rejected here
 * rather than landing as junk in the right-panel annotation list.
 *
 * Errors are wrapped with a human-readable hint when we can tell what
 * went wrong — most commonly the AI gateway isn't running.
 */
export async function explainSelection(
  selection: string,
  context?: string,
): Promise<ExplainResult> {
  try {
    const r = await ai.complete({
      prompt: buildExplainPrompt({ selection, context }),
      model: EXPLAIN_PROMPT_MODEL,
      maxTokens: 400,
      schema: ExplainOutputSchema,
      temperature: 0.3,
    });
    return {
      explanation: r.data.explanation,
      inputTokens: r.usage.inputTokens,
      outputTokens: r.usage.outputTokens,
    };
  } catch (err) {
    throw friendlierAiError(err);
  }
}

/**
 * Turn raw `Load failed` / `Failed to fetch` / 401 / 402 into something
 * a non-developer user can act on. Returns a brand-new Error so the
 * stack trace still preserves the call site.
 *
 * 0.2.0 changed the messages: the in-proc gateway is always running, so
 * the most common failure is "key not in keychain yet" (402 from gateway)
 * → tell user to open Settings.
 */
function friendlierAiError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);

  // In-proc gateway returns 402 when no API key is in the keychain.
  if (
    /402/.test(msg) ||
    /no anthropic api key/i.test(msg) ||
    /no gemini api key/i.test(msg) ||
    /no.*api key configured/i.test(msg)
  ) {
    return new Error(
      'AI 未配置 — 打开顶栏 ⚙ 设置 → 填入你的 Anthropic API key（sk-ant-... 开头）即可使用。',
    );
  }

  // Browser fetch fails with these when the gateway isn't reachable
  // (rare now — in-proc gateway starts with the app).
  if (
    /load failed/i.test(msg) ||
    /failed to fetch/i.test(msg) ||
    /networkerror/i.test(msg) ||
    /fetch.*aborted/i.test(msg)
  ) {
    return new Error(
      '本地 AI 网关连不上（这是 nodx 进程内的服务）。试着重启 nodx；' +
        '如果仍失败，可能 :8787 端口被别的程序占用了。',
    );
  }

  if (/401|unauthor/i.test(msg)) {
    return new Error(
      'AI 网关鉴权失败。重启 nodx 试试（每次启动会换 token）。',
    );
  }

  if (/403/.test(msg) || /invalid.*key/i.test(msg)) {
    return new Error(
      '你的 Anthropic API key 被拒绝（403）— 可能 key 失效 / 配额耗尽 / 拼错。' +
        '到 ⚙ 设置 重新粘贴一次。',
    );
  }

  // Rate limit / quota from upstream.
  if (/429|rate.?limit|quota/i.test(msg)) {
    return new Error('Anthropic 限流了，稍等几秒再试。');
  }

  // Pass through with light context.
  return new Error(`AI 解释调用失败：${msg}`);
}

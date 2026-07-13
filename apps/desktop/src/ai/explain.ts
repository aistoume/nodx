import {
  ExplainOutputSchema,
  EXPLAIN_PROMPT_MODEL,
  MODELS,
  buildExplainPrompt,
} from '@nodx/ai';
import { invoke } from '@tauri-apps/api/core';
import { visionPayload } from '../lib/media.js';
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
/**
 * Ask Claude vision to describe the captured image.
 *
 * Unlike `explainSelection`, this one goes via `completeText` (raw text)
 * rather than `complete` (JSON + Zod). Reason: Sonnet frequently quotes
 * Chinese characters inside its explanation, e.g. 「包括中文"維"、」;
 * inside a JSON string those inner double-quotes must be escaped, which
 * Sonnet doesn't reliably do → JSON.parse blows up. Text output sidesteps
 * that whole class of failure — we just trim + take what the model wrote.
 *
 * `imagePath` is a filesystem path (absolute) — usually the `imagePath`
 * field of an image-capture Attention. We hand it to a Tauri command
 * that reads the bytes + base64-encodes them, then send both to the
 * in-proc gateway which forwards to Anthropic's messages API with an
 * image content block.
 *
 * Model choice: Sonnet, because vision quality matters far more than
 * speed here (Haiku vision is significantly worse at reading text and
 * layouts inside screenshots).
 */
export async function explainImage(
  imagePath: string,
  context?: string,
): Promise<ExplainResult> {
  try {
    const [rawBase64, rawMime] = await invoke<[string, string]>(
      'read_media_file',
      { path: imagePath },
    );
    // Retina captures can exceed Anthropic's 10MB image cap — shrink the
    // API payload (stored file stays full-res).
    const { base64: imageBase64, mime: imageMime } = await visionPayload(
      rawBase64,
      rawMime,
    );
    const prompt =
      '看这张截图，用一句话（50–150 字）说清楚它是什么、展示了什么核心内容。' +
      '有图表/数字就点出关键数字；是产品 UI 就说清是什么产品的什么界面；' +
      '是文档/文字就概括主旨。目标读者是企业管理层，不要学究气。' +
      '只输出解释本身，不要"这张图片显示"这种开场白，不要代码块，不要 JSON。' +
      (context ? `\n\n上下文来源：${context}` : '');

    const r = await ai.completeText({
      prompt,
      model: MODELS.sonnet,
      maxTokens: 600,
      temperature: 0.3,
      imageBase64,
      imageMime,
    });
    return {
      explanation: cleanExplanation(r.text),
      inputTokens: r.usage.inputTokens,
      outputTokens: r.usage.outputTokens,
    };
  } catch (err) {
    throw friendlierAiError(err);
  }
}

/**
 * Strip common code-fence / JSON envelope patterns Sonnet sometimes wraps
 * around a plain answer (```json …```, `{"explanation": "…"}` etc.),
 * fall back to the raw text if none matches. Also trims whitespace.
 */
function cleanExplanation(raw: string): string {
  let s = raw.trim();
  // Strip ```lang ... ``` fences (single-fenced, multi-fenced).
  s = s.replace(/^```(?:json|markdown|md)?\s*/i, '').replace(/```\s*$/i, '');
  s = s.trim();
  // If the model still gave us a JSON envelope, pull `explanation` out
  // with a regex — no JSON.parse, so unescaped inner quotes don't kill us.
  const m = s.match(/"explanation"\s*:\s*"([\s\S]+?)"\s*[},]/);
  if (m && m[1]) return m[1].trim();
  // Or a bare `{ ... }` around the whole thing.
  s = s.replace(/^\{\s*/, '').replace(/\s*\}$/, '').trim();
  return s;
}

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
export function friendlierAiError(err: unknown): Error {
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

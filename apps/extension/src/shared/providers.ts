/**
 * Provider-specific streaming API calls.
 *
 * Each callXxx:
 *  - Streams chunks via onChunk callback as they arrive
 *  - Returns the full text when done
 *  - Throws on HTTP / parse / API errors
 *
 * Errors are wrapped with human-friendly messages.
 */

export type ChunkCallback = (text: string) => void;

// ============================================================================
// Anthropic — SSE stream of content_block_delta events
// ============================================================================

export interface AnthropicImageInput {
  /** Base64-encoded bytes, no `data:` prefix. */
  base64: string;
  /** MIME type — `image/png`, `image/jpeg`, etc. */
  mime: string;
}

export async function callAnthropic(
  apiKey: string,
  model: string,
  prompt: string,
  onChunk: ChunkCallback,
  signal?: AbortSignal,
  image?: AnthropicImageInput,
): Promise<string> {
  // When an image is present, the user message becomes a multi-part
  // content array (image then text) — same shape the desktop gateway
  // builds in ai_gateway/anthropic.rs.
  const userContent: unknown = image
    ? [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mime,
            data: image.base64,
          },
        },
        { type: 'text', text: prompt },
      ]
    : prompt;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      stream: true,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${errBody.slice(0, 200)}`);
  }

  let full = '';
  await readSse(res.body, (event, data) => {
    if (event !== 'content_block_delta') return;
    const obj = safeParse<{ delta?: { type?: string; text?: string } }>(data);
    const txt = obj?.delta?.text;
    if (txt) {
      full += txt;
      onChunk(txt);
    }
  });
  return full;
}

// ============================================================================
// OpenAI — SSE stream of chat.completion.chunk events; data: [DONE] sentinel
// ============================================================================

export async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  onChunk: ChunkCallback,
  signal?: AbortSignal,
  image?: AnthropicImageInput,
  baseUrl: string = 'https://api.openai.com/v1',
): Promise<string> {
  // With an image the user message becomes a multi-part content array
  // (image_url data URL + text). Also serves OpenAI-compatible providers
  // (OpenRouter) via `baseUrl`.
  const userContent: unknown = image
    ? [
        { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}` } },
        { type: 'text', text: prompt },
      ]
    : prompt;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      // GPT-5.x dropped `max_tokens` on chat completions in favour of
      // `max_completion_tokens` (which also covers hidden reasoning
      // tokens — give it headroom). OpenRouter still speaks `max_tokens`.
      ...(baseUrl.includes('api.openai.com')
        ? { max_completion_tokens: 4096 }
        : { max_tokens: 800 }),
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => '');
    const who = baseUrl.includes('openrouter') ? 'OpenRouter' : 'OpenAI';
    throw new Error(`${who} ${res.status}: ${errBody.slice(0, 200)}`);
  }

  let full = '';
  await readSse(res.body, (_event, data) => {
    if (data === '[DONE]') return;
    const obj = safeParse<{
      choices?: { delta?: { content?: string } }[];
    }>(data);
    const txt = obj?.choices?.[0]?.delta?.content;
    if (txt) {
      full += txt;
      onChunk(txt);
    }
  });
  return full;
}

// ============================================================================
// Google Gemini — streamGenerateContent, NDJSON-style ([{...},{...}] array)
//   We request alt=sse so server emits proper SSE; saves us a hand-rolled
//   array-stream parser.
// ============================================================================

export async function callGoogle(
  apiKey: string,
  model: string,
  prompt: string,
  onChunk: ChunkCallback,
  signal?: AbortSignal,
  image?: AnthropicImageInput,
): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  const parts: unknown[] = image
    ? [{ inlineData: { mimeType: image.mime, data: image.base64 } }, { text: prompt }]
    : [{ text: prompt }];
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      // Gemini 3.x thinks by default and thought tokens share this cap —
      // 800 starved the actual answer.
      generationConfig: { maxOutputTokens: 2048 },
    }),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Google ${res.status}: ${errBody.slice(0, 200)}`);
  }

  let full = '';
  await readSse(res.body, (_event, data) => {
    const obj = safeParse<{
      candidates?: {
        content?: { parts?: { text?: string; thought?: boolean }[] };
      }[];
    }>(data);
    // Gemini 3.x interleaves `thought: true` reasoning parts with answer
    // parts — walk ALL parts and keep only real answer text (reading just
    // parts[0] leaked reasoning and dropped answer chunks).
    for (const part of obj?.candidates?.[0]?.content?.parts ?? []) {
      if (part?.thought) continue;
      if (part?.text) {
        full += part.text;
        onChunk(part.text);
      }
    }
  });
  return full;
}

// ============================================================================
// Provider dispatch — one entry point for text or vision calls, so callers
// (explain / identify / prompt-writing) work with whichever provider the
// user picked in settings.
// ============================================================================

export type ProviderName = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'nodx';

/**
 * nodx local gateway (127.0.0.1:8787) — the desktop in-proc gateway or the
 * standalone CLI gateway (`pnpm cli-gateway`), both backed by the user's
 * own Claude auth. No API key. Non-streaming: the full text arrives in one
 * chunk. Vision goes as image_base64 (CLI gateway views it via Read).
 */
export async function callNodxCli(
  model: string,
  prompt: string,
  onChunk: ChunkCallback,
  signal?: AbortSignal,
  image?: AnthropicImageInput,
  token?: string,
): Promise<string> {
  const body: Record<string, unknown> = { model, prompt };
  if (image) {
    body.image_base64 = image.base64;
    body.image_mime = image.mime;
  }
  // The desktop in-proc gateway requires its client token (the value of
  // VITE_AI_CLIENT_TOKEN); the standalone CLI gateway ignores it unless
  // configured. The options page reuses the API-key field for this.
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch('http://127.0.0.1:8787/v1/complete', {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      '本地 nodx 网关未运行（127.0.0.1:8787）— 在 nodx 目录跑 `pnpm cli-gateway`（仅网关）或 `pnpm start:cli`（网关+桌面）。',
    );
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`nodx gateway ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const json = (await res.json()) as { text?: string };
  const text = json.text ?? '';
  if (text) onChunk(text);
  return text;
}

export async function callAI(
  provider: ProviderName,
  apiKey: string,
  model: string,
  prompt: string,
  onChunk: ChunkCallback,
  signal?: AbortSignal,
  image?: AnthropicImageInput,
): Promise<string> {
  switch (provider) {
    case 'anthropic':
      return callAnthropic(apiKey, model, prompt, onChunk, signal, image);
    case 'openai':
      return callOpenAI(apiKey, model, prompt, onChunk, signal, image);
    case 'openrouter':
      // OpenAI-compatible; free-tier models carry the `:free` suffix and
      // `openrouter/free` auto-picks a capable free model per request.
      return callOpenAI(apiKey, model, prompt, onChunk, signal, image, 'https://openrouter.ai/api/v1');
    case 'google':
      return callGoogle(apiKey, model, prompt, onChunk, signal, image);
    case 'nodx':
      return callNodxCli(model, prompt, onChunk, signal, image, apiKey);
  }
}

// ============================================================================
// Shared SSE reader.  Parses RFC-style "event:" / "data:" lines and dispatches.
// Multi-line data is joined with \n.  Blank line ends an event.
// ============================================================================

async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let eventName = 'message';
  let dataLines: string[] = [];

  function flush() {
    if (dataLines.length === 0) return;
    onEvent(eventName, dataLines.join('\n'));
    eventName = 'message';
    dataLines = [];
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      flush();
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    // Handle both \n and \r\n line endings
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);

      if (line === '') {
        flush();
      } else if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
      // ignore comments (lines starting with ":") and other fields
    }
  }
}

function safeParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

// ============================================================================
// Google Gemini — image generation (non-streaming :generateContent).
//   Used by the "🎨 generate" radial action: Sonnet writes an image prompt,
//   then a Gemini image model (gemini-3.1-flash-image = Nano Banana 2, or
//   gemini-3-pro-image) renders it and returns inline base64 bytes.
//   This is a SEPARATE key from the main text provider — Anthropic can't
//   generate images, so image-gen always needs a Google AI key.
// ============================================================================

export interface GeneratedImage {
  /** Full `data:<mime>;base64,<...>` URL, ready to drop into an <img>. */
  dataUrl: string;
  mime: string;
}

export async function generateGeminiImage(
  apiKey: string,
  model: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<GeneratedImage> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
    `:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Google image ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const json = safeParse<{
    candidates?: {
      content?: {
        parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[];
      };
    }[];
    promptFeedback?: { blockReason?: string };
  }>(await res.text());

  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find((p) => p?.inlineData?.data);
  if (imgPart?.inlineData?.data) {
    const mime = imgPart.inlineData.mimeType ?? 'image/png';
    return { dataUrl: `data:${mime};base64,${imgPart.inlineData.data}`, mime };
  }

  const txt = parts.find((p) => p?.text)?.text;
  const block = json?.promptFeedback?.blockReason;
  throw new Error(
    block
      ? `Gemini 拒绝生成（${block}）`
      : txt
        ? `Gemini 没返回图片：${txt.slice(0, 150)}`
        : 'Gemini 没返回图片数据',
  );
}

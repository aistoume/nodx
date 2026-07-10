/**
 * Thin typed wrapper over the Anthropic Messages API. Lives inside the worker
 * so the client never sees the API key, only nodx-shaped requests.
 *
 * Internally always uses SSE streaming. Long Sonnet generations (4-8k tokens
 * of Chinese reasoning take 30-90s) routinely got their connections dropped
 * with "Network connection lost" when called non-streaming. Streaming keeps
 * the upstream connection warm with chunks. The worker still returns a
 * single non-streaming JSON to its callers — clients don't need to know.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export interface AnthropicCallParams {
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens: number;
  system?: string;
  temperature?: number;
  /**
   * Continue a partial assistant turn. When set, it's appended as an
   * `assistant` message so the model resumes exactly where a previous
   * (max_tokens-truncated) generation left off instead of starting over.
   * The client's continuation loop uses this to assemble an over-long
   * utterance from multiple chunks. Must not end with trailing whitespace
   * (Anthropic rejects that) — the client trims before sending.
   */
  assistantPrefill?: string;
  /**
   * Enable Anthropic's built-in `web_search` server tool. Costs ~$10/1000
   * searches; capped at 5 uses per call. Anthropic executes the search
   * server-side, so we don't have to run the tool loop ourselves — we just
   * accumulate text_delta events as before; tool blocks are ignored.
   */
  enableWebSearch?: boolean;
}

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5,
} as const;

export interface AnthropicTextResponse {
  text: string;
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

export class AnthropicError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly upstreamBody: string,
  ) {
    super(message);
    this.name = 'AnthropicError';
  }
}

export async function callAnthropic(
  params: AnthropicCallParams,
): Promise<AnthropicTextResponse> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: params.prompt },
  ];
  // Resume a truncated turn: the model continues this assistant content.
  if (params.assistantPrefill) {
    messages.push({ role: 'assistant', content: params.assistantPrefill });
  }

  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens,
    temperature: params.temperature ?? 0.7,
    messages,
    stream: true,
  };
  if (params.system) body.system = params.system;
  if (params.enableWebSearch) body.tools = [WEB_SEARCH_TOOL];

  const post = (payload: Record<string, unknown>) =>
    fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': params.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

  let upstream = await post(body);

  if (!upstream.ok) {
    const text = await upstream.text();
    // Newer models (Opus 4.8+) reject `temperature` outright. Strip it and
    // retry once so one gateway works across model generations.
    if (upstream.status === 400 && text.includes('`temperature` is deprecated')) {
      delete body.temperature;
      upstream = await post(body);
      if (!upstream.ok) {
        const retryText = await upstream.text();
        throw new AnthropicError(
          upstream.status,
          `anthropic ${upstream.status} ${upstream.statusText}`,
          retryText,
        );
      }
    } else {
      throw new AnthropicError(
        upstream.status,
        `anthropic ${upstream.status} ${upstream.statusText}`,
        text,
      );
    }
  }

  if (!upstream.body) {
    throw new AnthropicError(502, 'anthropic returned no body', '');
  }

  // A continuation chunk may legitimately add nothing (the model decides the
  // turn is already complete) — don't treat that as an error.
  return await consumeStream(
    upstream.body,
    params.model,
    !!params.assistantPrefill,
  );
}

async function consumeStream(
  stream: ReadableStream<Uint8Array>,
  fallbackModel: string,
  allowEmptyText = false,
): Promise<AnthropicTextResponse> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let stopReason: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let model = fallbackModel;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by blank lines.
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const eventText of events) {
        const data = parseSSEData(eventText);
        if (!data) continue;

        switch (data.type) {
          case 'message_start': {
            const msg = data.message as
              | { model?: string; usage?: { input_tokens?: number } }
              | undefined;
            if (msg?.usage?.input_tokens != null) {
              inputTokens = msg.usage.input_tokens;
            }
            if (msg?.model) model = msg.model;
            break;
          }
          case 'content_block_delta': {
            const delta = data.delta as
              | { type?: string; text?: string }
              | undefined;
            if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
              text += delta.text;
            }
            break;
          }
          case 'message_delta': {
            const delta = data.delta as
              | { stop_reason?: string | null }
              | undefined;
            if (delta?.stop_reason) stopReason = delta.stop_reason;
            const usage = data.usage as
              | { output_tokens?: number }
              | undefined;
            if (usage?.output_tokens != null) {
              outputTokens = usage.output_tokens;
            }
            break;
          }
          case 'error': {
            const err = data.error as
              | { type?: string; message?: string }
              | undefined;
            throw new AnthropicError(
              503,
              `anthropic stream error: ${err?.type ?? 'unknown'}: ${err?.message ?? ''}`,
              JSON.stringify(data),
            );
          }
          // message_stop / content_block_start / content_block_stop / ping:
          // nothing to accumulate.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!text && !allowEmptyText) {
    throw new AnthropicError(
      502,
      'anthropic stream produced no text',
      '',
    );
  }

  return {
    text,
    stopReason,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    model,
  };
}

function parseSSEData(raw: string): Record<string, unknown> | null {
  let dataStr = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('data:')) dataStr += line.slice(5).trim();
  }
  if (!dataStr) return null;
  try {
    return JSON.parse(dataStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

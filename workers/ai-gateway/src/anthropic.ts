/**
 * Thin typed wrapper over the Anthropic Messages API. Lives inside the worker
 * so the client never sees the API key, only nodx-shaped requests.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export interface AnthropicCallParams {
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens: number;
  /** Optional system prompt — the per-prompt module owns the user prompt. */
  system?: string;
  /** Defaults to 0.7 to keep deterministic-leaning outputs for JSON parsing. */
  temperature?: number;
}

export interface AnthropicTextResponse {
  /** Concatenated text from every "text" content block. */
  text: string;
  /** Stop reason as reported by the API (e.g. end_turn, max_tokens). */
  stopReason: string | null;
  /** Pass-through usage so the caller can attribute cost. */
  usage: { input_tokens: number; output_tokens: number };
  /** The model id Anthropic actually billed against (may be alias-resolved). */
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
  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens,
    temperature: params.temperature ?? 0.7,
    messages: [{ role: 'user', content: params.prompt }],
  };
  if (params.system) body.system = params.system;

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': params.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    throw new AnthropicError(
      upstream.status,
      `anthropic ${upstream.status} ${upstream.statusText}`,
      text,
    );
  }

  const data = (await upstream.json()) as {
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string | null;
    usage?: { input_tokens: number; output_tokens: number };
    model?: string;
  };

  const text = (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');

  if (!text) {
    throw new AnthropicError(
      502,
      'anthropic returned no text content',
      JSON.stringify(data),
    );
  }

  return {
    text,
    stopReason: data.stop_reason ?? null,
    usage: data.usage ?? { input_tokens: 0, output_tokens: 0 },
    model: data.model ?? params.model,
  };
}

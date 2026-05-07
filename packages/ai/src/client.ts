import type { z } from 'zod';
import type { ModelId } from './models.js';
import { extractJsonObject } from './parse.js';

export interface GatewayConfig {
  /** Worker URL — http://localhost:8787 in dev, wrangler-issued URL in prod. */
  endpoint: string;
  /** Shared bearer token. Same value the worker has in CLIENT_TOKEN. */
  clientToken: string;
}

export interface CompleteOptions<T> {
  /** Built via one of the `buildXxxPrompt` helpers in `prompts/`. */
  prompt: string;
  /** Pinned by the prompt module (see XXX_PROMPT_MODEL constants). */
  model: ModelId;
  /** Output budget. Sized per prompt — survey ≈ 1k, decompose ≈ 2k, etc. */
  maxTokens: number;
  /** Zod schema the model output must satisfy after JSON extraction. */
  schema: z.ZodSchema<T>;
  /** Optional system prompt. Most prompts don't need one. */
  system?: string;
  /** [0, 1]. Lower = more deterministic — useful when the schema is strict. */
  temperature?: number;
  /**
   * Enable Anthropic's built-in web_search tool so the model can fetch
   * current information for prompts whose answers depend on freshness
   * (prices, news, current state-of-the-art). Off by default — costs
   * extra (~$0.05/call) and adds latency.
   */
  enableWebSearch?: boolean;
  /** Lets the caller cancel an in-flight request (e.g. unmounting a panel). */
  signal?: AbortSignal;
}

export interface CompleteResult<T> {
  /** The validated, schema-shaped object the caller actually wants. */
  data: T;
  /** Raw text body — handy for debugging when the schema rejects it. */
  raw: string;
  /** Token usage for cost attribution. */
  usage: { inputTokens: number; outputTokens: number };
  /** The model id Anthropic resolved (may differ from request when aliased). */
  model: string;
}

interface GatewayResponse {
  text: string;
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

export class GatewayError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

/**
 * Call the AI gateway, validate the response against the supplied Zod schema,
 * and return both the parsed object and the raw text. The raw text survives
 * past the parse so callers can show "the model returned: …" on schema fail.
 */
export async function complete<T>(
  cfg: GatewayConfig,
  opts: CompleteOptions<T>,
): Promise<CompleteResult<T>> {
  const res = await fetch(`${cfg.endpoint}/v1/complete`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.clientToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      prompt: opts.prompt,
      max_tokens: opts.maxTokens,
      ...(opts.system ? { system: opts.system } : {}),
      ...(opts.temperature !== undefined
        ? { temperature: opts.temperature }
        : {}),
      ...(opts.enableWebSearch ? { enable_web_search: true } : {}),
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new GatewayError(
      res.status,
      `gateway returned ${res.status}: ${describeErrorBody(body)}`,
      body,
    );
  }

  const payload = (await res.json()) as GatewayResponse;
  let json: unknown;
  try {
    json = extractJsonObject(payload.text);
  } catch (err) {
    // Always log the full payload to the devtools console — UI banners can
    // only show a sample, but the developer needs the whole thing to tell
    // truncation from a stray comma.
    // eslint-disable-next-line no-console
    console.error(
      '[@nodx/ai] JSON extraction failed.',
      '\nstopReason:', payload.stopReason,
      '\noutputTokens:', payload.usage.output_tokens,
      '\nfull text:\n', payload.text,
    );
    if (payload.stopReason === 'max_tokens') {
      throw new Error(
        `Model output truncated — hit max_tokens (${payload.usage.output_tokens} output tokens). Increase maxTokens for this prompt.\n\n` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
    throw err;
  }
  const data = opts.schema.parse(json);

  return {
    data,
    raw: payload.text,
    usage: {
      inputTokens: payload.usage.input_tokens,
      outputTokens: payload.usage.output_tokens,
    },
    model: payload.model,
  };
}

export interface CompleteTextOptions {
  prompt: string;
  model: ModelId;
  maxTokens: number;
  system?: string;
  temperature?: number;
  enableWebSearch?: boolean;
  signal?: AbortSignal;
}

export interface CompleteTextResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

/**
 * Variant of `complete` for freeform text replies (no Zod schema). Used by
 * conversational paths where the model's reply is shown verbatim to the user.
 * Schema-driven prompts (survey, decompose, atomic-check) keep using
 * `complete` so malformed JSON fails loudly instead of leaking into the UI.
 */
export async function completeText(
  cfg: GatewayConfig,
  opts: CompleteTextOptions,
): Promise<CompleteTextResult> {
  const res = await fetch(`${cfg.endpoint}/v1/complete`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.clientToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      prompt: opts.prompt,
      max_tokens: opts.maxTokens,
      ...(opts.system ? { system: opts.system } : {}),
      ...(opts.temperature !== undefined
        ? { temperature: opts.temperature }
        : {}),
      ...(opts.enableWebSearch ? { enable_web_search: true } : {}),
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new GatewayError(
      res.status,
      `gateway returned ${res.status}: ${describeErrorBody(body)}`,
      body,
    );
  }

  const payload = (await res.json()) as GatewayResponse;
  return {
    text: payload.text,
    usage: {
      inputTokens: payload.usage.input_tokens,
      outputTokens: payload.usage.output_tokens,
    },
    model: payload.model,
  };
}

function describeErrorBody(body: unknown): string {
  if (typeof body === 'string') return body.slice(0, 400);
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (typeof obj.error === 'string') {
      const upstream = obj.upstream
        ? ` | upstream: ${JSON.stringify(obj.upstream).slice(0, 300)}`
        : '';
      return obj.error + upstream;
    }
    return JSON.stringify(body).slice(0, 400);
  }
  return String(body);
}

/**
 * Hits the gateway's /health endpoint. Useful as a connection probe before
 * the user fires their first AI call.
 */
export async function pingGateway(cfg: GatewayConfig): Promise<boolean> {
  try {
    const res = await fetch(`${cfg.endpoint}/health`);
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

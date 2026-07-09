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
  /**
   * Optional Claude vision image content. When present, the gateway
   * builds a `[{type:'image'}, {type:'text'}]` first-message so the
   * model can see the image alongside the text prompt. `image_base64`
   * is the raw base64 without a `data:` prefix.
   */
  imageBase64?: string;
  imageMime?: string;
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

// ──────────────────────────────────────────────────────────────────────
// Sonnet rate-limit guard
//
// Anthropic's per-minute input-token cap is 30k for new orgs on Sonnet
// 4.6. Multiple parallel Sonnet calls (e.g. user opens 4 child topics
// at once → 4 focused-doc generations fire in parallel) blow that
// straight away. We do two things:
//   1. Serialise Sonnet calls — one in flight at a time, others wait
//      their turn in a Promise chain. Haiku is excluded; its limit is
//      much higher and survey/explain calls are short.
//   2. Auto-retry once on 429 after a 35s wait (Anthropic's window is
//      a sliding minute, so 35s is enough for most over-limit calls).
// ──────────────────────────────────────────────────────────────────────

let sonnetChain: Promise<unknown> = Promise.resolve();

function isSonnet(modelId: ModelId): boolean {
  return modelId.includes('sonnet');
}

function enqueue<T>(modelId: ModelId, fn: () => Promise<T>): Promise<T> {
  if (!isSonnet(modelId)) return fn();
  // Use the chain as a barrier — each call awaits the previous before
  // running. We catch failures so the chain never poisons subsequent
  // callers with a rejected promise.
  const result = sonnetChain.then(fn, fn);
  sonnetChain = result.catch(() => undefined);
  return result;
}

async function withRateLimitRetry<T>(
  modelId: ModelId,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // Only retry Sonnet 429s automatically. Haiku's per-minute limit is
    // ~10× Sonnet's, so a 429 there is usually account-level (no point
    // retrying inside a 35s window). Plus skipping Haiku keeps unit
    // tests that mock 429 from waiting 35s.
    if (
      err instanceof GatewayError &&
      err.status === 429 &&
      isSonnet(modelId)
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        '[ai-gateway] hit 429 on sonnet, waiting 35s and retrying once',
      );
      await new Promise((r) => setTimeout(r, 35_000));
      return await fn();
    }
    throw err;
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
  return enqueue(opts.model, () =>
    withRateLimitRetry(opts.model, () =>completeOnce(cfg, opts)),
  );
}

async function completeOnce<T>(
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
      ...(opts.imageBase64
        ? {
            image_base64: opts.imageBase64,
            image_mime: opts.imageMime ?? 'image/png',
          }
        : {}),
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
  /**
   * Continue a partial assistant turn — the model resumes from this text
   * instead of starting over. Used by `completeTextUntilDone` to stitch an
   * over-long reply from multiple max_tokens-bounded chunks.
   */
  assistantPrefill?: string;
  /** Same as CompleteOptions — Claude vision inputs. */
  imageBase64?: string;
  imageMime?: string;
  signal?: AbortSignal;
}

export interface CompleteTextResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  /** Why generation stopped — 'end_turn', 'max_tokens', etc. (may be null). */
  stopReason: string | null;
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
  return enqueue(opts.model, () =>
    withRateLimitRetry(opts.model, () =>completeTextOnce(cfg, opts)),
  );
}

async function completeTextOnce(
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
      ...(opts.assistantPrefill
        ? { assistant_prefill: opts.assistantPrefill }
        : {}),
      ...(opts.imageBase64
        ? {
            image_base64: opts.imageBase64,
            image_mime: opts.imageMime ?? 'image/png',
          }
        : {}),
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
    stopReason: payload.stopReason,
  };
}

export interface CompleteTextUntilDoneOptions extends CompleteTextOptions {
  /**
   * Max *additional* continuation calls after the first when the model keeps
   * hitting max_tokens. Total calls ≤ maxContinuations + 1. Default 4 → up to
   * 5 chunks (≈ 5 × maxTokens of output). A safety bound so a runaway reply
   * can't loop forever.
   */
  maxContinuations?: number;
}

/**
 * Like `completeText`, but transparently continues a reply the model
 * truncated at `max_tokens`. Each chunk resumes the assistant turn via
 * `assistant_prefill`, so the pieces concatenate into one seamless reply.
 * Stops when the model finishes naturally (`stopReason !== 'max_tokens'`) or
 * the continuation budget runs out.
 *
 * Each chunk is its own gateway call, so for Sonnet they serialise through
 * the same rate-limit chain as every other call. Use this for free-form
 * generations whose length is unpredictable (e.g. a panel debate turn that
 * rebuts several peers); short replies still cost exactly one call.
 */
export async function completeTextUntilDone(
  cfg: GatewayConfig,
  opts: CompleteTextUntilDoneOptions,
): Promise<CompleteTextResult> {
  const maxContinuations = opts.maxContinuations ?? 4;
  let acc = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let model: string = opts.model;
  let stopReason: string | null = null;

  for (let attempt = 0; attempt <= maxContinuations; attempt++) {
    // First call has no prefill. Continuations resume from what we have so
    // far — trimmed of trailing whitespace, which Anthropic rejects in an
    // assistant prefill. We keep `acc` itself untrimmed so the original
    // spacing survives in the stitched result.
    const prefill = acc ? acc.replace(/\s+$/, '') : undefined;
    const r = await completeText(cfg, { ...opts, assistantPrefill: prefill });

    acc += r.text;
    inputTokens += r.usage.inputTokens;
    outputTokens += r.usage.outputTokens;
    model = r.model;
    stopReason = r.stopReason;

    if (r.stopReason !== 'max_tokens') break;
  }

  return {
    text: acc,
    usage: { inputTokens, outputTokens },
    model,
    stopReason,
  };
}

export interface CompleteUntilDoneOptions<T> extends CompleteOptions<T> {
  /** Same meaning as in completeTextUntilDone. Default 4. */
  maxContinuations?: number;
}

/**
 * JSON variant of `completeTextUntilDone`: accumulates a possibly-truncated
 * JSON reply across continuation chunks (assistant-prefill resumes the turn),
 * then extracts + schema-validates the stitched whole. Use when a *structured*
 * reply can grow large enough to risk max_tokens — e.g. a rich panel
 * synthesis with many consensus / divergence / open-question entries.
 *
 * Continuation works for JSON because the model resumes the same assistant
 * turn, so the chunks concatenate into one well-formed object.
 */
export async function completeUntilDone<T>(
  cfg: GatewayConfig,
  opts: CompleteUntilDoneOptions<T>,
): Promise<CompleteResult<T>> {
  const r = await completeTextUntilDone(cfg, {
    prompt: opts.prompt,
    model: opts.model,
    maxTokens: opts.maxTokens,
    system: opts.system,
    temperature: opts.temperature,
    enableWebSearch: opts.enableWebSearch,
    maxContinuations: opts.maxContinuations,
    signal: opts.signal,
  });

  let json: unknown;
  try {
    json = extractJsonObject(r.text);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      '[@nodx/ai] JSON extraction failed after continuation.',
      '\nstopReason:', r.stopReason,
      '\noutputTokens:', r.usage.outputTokens,
      '\nfull text:\n', r.text,
    );
    if (r.stopReason === 'max_tokens') {
      throw new Error(
        'Model output still truncated after continuations — raise maxTokens or maxContinuations for this prompt.\n\n' +
          (err instanceof Error ? err.message : String(err)),
      );
    }
    throw err;
  }

  const data = opts.schema.parse(json);
  return { data, raw: r.text, usage: r.usage, model: r.model };
}

export interface EmbedOptions {
  /** Texts to embed; batched into one gateway call, vectors returned in order. */
  texts: string[];
  /** Embedding model id; the gateway defaults to its configured one if omitted. */
  model?: ModelId;
  signal?: AbortSignal;
}

export interface EmbedResult {
  /** One vector per input text, same order. Each is `EMBEDDING_DIM` long. */
  embeddings: number[][];
  /** The embedding model the gateway resolved to. */
  model: string;
}

/**
 * Compute embeddings via the gateway's `/v1/embed` endpoint (Gemini Embedding
 * 2 behind the worker, so the client never holds the Google key). Used by the
 * CBR indexer to embed a case's problem + solution text (PRD §3.16 step ②).
 */
export async function embed(
  cfg: GatewayConfig,
  opts: EmbedOptions,
): Promise<EmbedResult> {
  const res = await fetch(`${cfg.endpoint}/v1/embed`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.clientToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      texts: opts.texts,
      ...(opts.model ? { model: opts.model } : {}),
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

  const payload = (await res.json()) as { embeddings: number[][]; model: string };
  return { embeddings: payload.embeddings, model: payload.model };
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

import { AnthropicError, callAnthropic } from './anthropic.js';
import { GeminiError, callGeminiEmbed } from './gemini.js';

export interface Env {
  ANTHROPIC_API_KEY: string;
  CLIENT_TOKEN: string;
  /** Google AI-Studio key — only needed for /v1/embed (CBR indexing). */
  GEMINI_API_KEY?: string;
}

interface CompleteRequestBody {
  model?: unknown;
  prompt?: unknown;
  max_tokens?: unknown;
  system?: unknown;
  temperature?: unknown;
  enable_web_search?: unknown;
  assistant_prefill?: unknown;
}

const ALLOWED_MODELS = new Set([
  // Core reasoning tier (MODELS.sonnet) since 2026-07-08.
  'claude-opus-4-8',
  'claude-sonnet-5',
  'claude-haiku-4-5',
  // dated aliases — Anthropic publishes these alongside the bare names
  'claude-haiku-4-5-20251001',
]);

const DEFAULT_MAX_TOKENS = 2048;
const HARD_MAX_TOKENS = 8192;

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
} as const;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'nodx-ai-gateway' });
    }

    if (url.pathname === '/v1/complete' && req.method === 'POST') {
      return handleComplete(req, env);
    }

    if (url.pathname === '/v1/embed' && req.method === 'POST') {
      return handleEmbed(req, env);
    }

    return json({ error: 'not found', path: url.pathname }, 404);
  },
};

async function handleComplete(req: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY || !env.CLIENT_TOKEN) {
    return json(
      {
        error:
          'gateway not configured — ANTHROPIC_API_KEY and CLIENT_TOKEN must be set',
      },
      500,
    );
  }

  // bearer token auth
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.CLIENT_TOKEN}`;
  if (!constantTimeEquals(auth, expected)) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: CompleteRequestBody;
  try {
    body = (await req.json()) as CompleteRequestBody;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const validation = validateCompleteBody(body);
  if ('error' in validation) {
    return json({ error: validation.error }, 400);
  }
  const {
    model,
    prompt,
    maxTokens,
    system,
    temperature,
    enableWebSearch,
    assistantPrefill,
  } = validation;

  try {
    const result = await callAnthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      model,
      prompt,
      maxTokens,
      system,
      temperature,
      enableWebSearch,
      assistantPrefill,
    });
    return json(result);
  } catch (err) {
    if (err instanceof AnthropicError) {
      return json(
        {
          error: err.message,
          upstream: safeParse(err.upstreamBody),
        },
        // Map upstream auth/rate errors to clearer client codes; everything
        // else surfaces as 502 so we don't pretend the worker generated it.
        err.status === 401 || err.status === 403
          ? 502
          : err.status === 429
            ? 429
            : 502,
      );
    }
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

interface EmbedRequestBody {
  texts?: unknown;
  model?: unknown;
}

const ALLOWED_EMBED_MODELS = new Set(['gemini-embedding-2', 'gemini-embedding-001']);
const MAX_EMBED_BATCH = 32;

async function handleEmbed(req: Request, env: Env): Promise<Response> {
  if (!env.CLIENT_TOKEN) {
    return json({ error: 'gateway not configured — CLIENT_TOKEN must be set' }, 500);
  }
  if (!env.GEMINI_API_KEY) {
    return json(
      { error: 'embeddings not configured — GEMINI_API_KEY must be set on the worker' },
      500,
    );
  }

  const auth = req.headers.get('authorization') ?? '';
  if (!constantTimeEquals(auth, `Bearer ${env.CLIENT_TOKEN}`)) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: EmbedRequestBody;
  try {
    body = (await req.json()) as EmbedRequestBody;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  if (
    !Array.isArray(body.texts) ||
    body.texts.length === 0 ||
    !body.texts.every((t) => typeof t === 'string' && t.length > 0)
  ) {
    return json({ error: 'texts must be a non-empty array of non-empty strings' }, 400);
  }
  if (body.texts.length > MAX_EMBED_BATCH) {
    return json({ error: `too many texts (>${MAX_EMBED_BATCH})` }, 400);
  }
  if (body.model !== undefined && (typeof body.model !== 'string' || !ALLOWED_EMBED_MODELS.has(body.model))) {
    return json({ error: `model must be one of: ${[...ALLOWED_EMBED_MODELS].join(', ')}` }, 400);
  }

  try {
    const result = await callGeminiEmbed({
      apiKey: env.GEMINI_API_KEY,
      texts: body.texts as string[],
    });
    return json(result);
  } catch (err) {
    if (err instanceof GeminiError) {
      return json(
        { error: err.message, upstream: safeParse(err.upstreamBody) },
        err.status === 429 ? 429 : 502,
      );
    }
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

interface ValidatedComplete {
  model: string;
  prompt: string;
  maxTokens: number;
  system: string | undefined;
  temperature: number | undefined;
  enableWebSearch: boolean;
  assistantPrefill: string | undefined;
}

function validateCompleteBody(
  body: CompleteRequestBody,
): ValidatedComplete | { error: string } {
  if (typeof body.model !== 'string' || !ALLOWED_MODELS.has(body.model)) {
    return { error: `model must be one of: ${[...ALLOWED_MODELS].join(', ')}` };
  }
  if (typeof body.prompt !== 'string' || body.prompt.length === 0) {
    return { error: 'prompt must be a non-empty string' };
  }
  if (body.prompt.length > 200_000) {
    return { error: 'prompt too long (>200k chars)' };
  }

  const maxTokens =
    typeof body.max_tokens === 'number' && Number.isInteger(body.max_tokens)
      ? body.max_tokens
      : DEFAULT_MAX_TOKENS;
  if (maxTokens < 1 || maxTokens > HARD_MAX_TOKENS) {
    return { error: `max_tokens must be in [1, ${HARD_MAX_TOKENS}]` };
  }

  const system =
    typeof body.system === 'string' && body.system.length > 0
      ? body.system
      : undefined;

  const temperature =
    typeof body.temperature === 'number' &&
    body.temperature >= 0 &&
    body.temperature <= 1
      ? body.temperature
      : undefined;

  const enableWebSearch = body.enable_web_search === true;

  let assistantPrefill: string | undefined;
  if (body.assistant_prefill !== undefined) {
    if (typeof body.assistant_prefill !== 'string') {
      return { error: 'assistant_prefill must be a string' };
    }
    if (body.assistant_prefill.length > 200_000) {
      return { error: 'assistant_prefill too long (>200k chars)' };
    }
    // Empty prefill means "no continuation" — normalise to undefined.
    assistantPrefill =
      body.assistant_prefill.length > 0 ? body.assistant_prefill : undefined;
  }

  return {
    model: body.model,
    prompt: body.prompt,
    maxTokens,
    system,
    temperature,
    enableWebSearch,
    assistantPrefill,
  };
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index.js';

const ENV: Env = {
  ANTHROPIC_API_KEY: 'sk-ant-test',
  CLIENT_TOKEN: 'tok',
};

/** Build a minimal Anthropic-shape SSE response. */
function mockSSE(opts: {
  text: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  stopReason?: string;
}): Response {
  const model = opts.model ?? 'claude-haiku-4-5-20251001';
  const payload = [
    `event: message_start\ndata: ${JSON.stringify({
      type: 'message_start',
      message: {
        id: 'msg_1',
        model,
        usage: { input_tokens: opts.inputTokens ?? 7, output_tokens: 0 },
      },
    })}`,
    `event: content_block_delta\ndata: ${JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: opts.text },
    })}`,
    `event: message_delta\ndata: ${JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: opts.stopReason ?? 'end_turn' },
      usage: { output_tokens: opts.outputTokens ?? 4 },
    })}`,
    `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}`,
  ].join('\n\n') + '\n\n';

  return new Response(payload, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function call(req: Request, env: Env = ENV): Promise<Response> {
  return worker.fetch(req, env);
}

describe('GET /health', () => {
  it('returns ok json', async () => {
    const res = await call(new Request('http://w/health'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; service: string };
    expect(body).toEqual({ ok: true, service: 'nodx-ai-gateway' });
  });
});

describe('OPTIONS preflight', () => {
  it('returns CORS headers', async () => {
    const res = await call(
      new Request('http://w/v1/complete', { method: 'OPTIONS' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

describe('POST /v1/complete', () => {
  function postJson(
    body: unknown,
    headers: Record<string, string> = {},
    env: Env = ENV,
  ): Promise<Response> {
    return call(
      new Request('http://w/v1/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }),
      env,
    );
  }

  it('rejects missing bearer with 401', async () => {
    const res = await postJson({ model: 'claude-haiku-4-5', prompt: 'hi' });
    expect(res.status).toBe(401);
  });

  it('rejects bad bearer with 401', async () => {
    const res = await postJson(
      { model: 'claude-haiku-4-5', prompt: 'hi' },
      { authorization: 'Bearer wrong' },
    );
    expect(res.status).toBe(401);
  });

  it('rejects unknown model with 400', async () => {
    const res = await postJson(
      { model: 'gpt-9000', prompt: 'hi' },
      { authorization: 'Bearer tok' },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('model');
  });

  it('rejects empty prompt with 400', async () => {
    const res = await postJson(
      { model: 'claude-haiku-4-5', prompt: '' },
      { authorization: 'Bearer tok' },
    );
    expect(res.status).toBe(400);
  });

  it('rejects malformed json with 400', async () => {
    const res = await call(
      new Request('http://w/v1/complete', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer tok',
        },
        body: '{not json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('forwards a valid request to Anthropic and reshapes the streamed response', async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('https://api.anthropic.com/v1/messages');
      return mockSSE({
        text: '{"a":1}',
        inputTokens: 7,
        outputTokens: 4,
        model: 'claude-haiku-4-5-20251001',
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const res = await postJson(
      { model: 'claude-haiku-4-5', prompt: 'hi', max_tokens: 100 },
      { authorization: 'Bearer tok' },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      text: string;
      stopReason: string;
      usage: { input_tokens: number; output_tokens: number };
      model: string;
    };
    expect(body.text).toBe('{"a":1}');
    expect(body.stopReason).toBe('end_turn');
    expect(body.usage).toEqual({ input_tokens: 7, output_tokens: 4 });
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('reassembles text across multiple content_block_delta chunks', async () => {
    vi.stubGlobal('fetch', async () => {
      const lines = [
        `event: message_start\ndata: ${JSON.stringify({
          type: 'message_start',
          message: {
            model: 'm',
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        })}`,
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Hello ' },
        })}`,
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'world' },
        })}`,
        `event: message_delta\ndata: ${JSON.stringify({
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 2 },
        })}`,
      ].join('\n\n') + '\n\n';
      return new Response(lines, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });

    const res = await postJson(
      { model: 'claude-haiku-4-5', prompt: 'hi' },
      { authorization: 'Bearer tok' },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string };
    expect(body.text).toBe('Hello world');
  });

  it('sends x-api-key + anthropic-version + stream:true on upstream call', async () => {
    let upstreamHeaders: Headers | null = null;
    let upstreamBody: string | null = null;
    vi.stubGlobal('fetch', async (_input: unknown, init?: RequestInit) => {
      upstreamHeaders = new Headers(init?.headers);
      upstreamBody = init?.body as string;
      return mockSSE({ text: '{}' });
    });

    await postJson(
      { model: 'claude-haiku-4-5', prompt: 'hi' },
      { authorization: 'Bearer tok' },
    );

    expect(upstreamHeaders).not.toBeNull();
    expect(upstreamHeaders!.get('x-api-key')).toBe('sk-ant-test');
    expect(upstreamHeaders!.get('anthropic-version')).toBe('2023-06-01');
    expect(upstreamBody).not.toBeNull();
    const parsed = JSON.parse(upstreamBody!) as { stream?: boolean };
    expect(parsed.stream).toBe(true);
  });

  it('forwards enable_web_search → tools[web_search] in upstream body', async () => {
    let upstreamBody: string | null = null;
    vi.stubGlobal('fetch', async (_input: unknown, init?: RequestInit) => {
      upstreamBody = init?.body as string;
      return mockSSE({ text: 'ok' });
    });

    await postJson(
      {
        model: 'claude-haiku-4-5',
        prompt: 'hi',
        enable_web_search: true,
      },
      { authorization: 'Bearer tok' },
    );

    expect(upstreamBody).not.toBeNull();
    const parsed = JSON.parse(upstreamBody!) as {
      tools?: Array<{ type: string; name: string }>;
    };
    expect(parsed.tools).toEqual([
      { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
    ]);
  });

  it('does not include tools when enable_web_search is absent', async () => {
    let upstreamBody: string | null = null;
    vi.stubGlobal('fetch', async (_input: unknown, init?: RequestInit) => {
      upstreamBody = init?.body as string;
      return mockSSE({ text: 'ok' });
    });

    await postJson(
      { model: 'claude-haiku-4-5', prompt: 'hi' },
      { authorization: 'Bearer tok' },
    );

    const parsed = JSON.parse(upstreamBody!) as { tools?: unknown };
    expect(parsed.tools).toBeUndefined();
  });

  it('surfaces a mid-stream Anthropic error event as 502', async () => {
    vi.stubGlobal('fetch', async () => {
      const lines = [
        `event: message_start\ndata: ${JSON.stringify({
          type: 'message_start',
          message: { model: 'm', usage: { input_tokens: 1, output_tokens: 0 } },
        })}`,
        `event: error\ndata: ${JSON.stringify({
          type: 'error',
          error: { type: 'overloaded_error', message: 'overloaded' },
        })}`,
      ].join('\n\n') + '\n\n';
      return new Response(lines, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });

    const res = await postJson(
      { model: 'claude-haiku-4-5', prompt: 'hi' },
      { authorization: 'Bearer tok' },
    );
    expect(res.status).toBe(502);
  });

  it('maps upstream 429 to 429', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('{"type":"rate_limit"}', { status: 429 }),
    );

    const res = await postJson(
      { model: 'claude-haiku-4-5', prompt: 'hi' },
      { authorization: 'Bearer tok' },
    );
    expect(res.status).toBe(429);
  });

  it('maps upstream 401 (bad anthropic key) to 502', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('{"type":"auth"}', { status: 401 }),
    );

    const res = await postJson(
      { model: 'claude-haiku-4-5', prompt: 'hi' },
      { authorization: 'Bearer tok' },
    );
    // 502 — the worker is up, but its upstream credentials are bad. Don't
    // confuse the client into thinking *its* token is wrong.
    expect(res.status).toBe(502);
  });

  it('500s when env is not configured', async () => {
    const res = await postJson(
      { model: 'claude-haiku-4-5', prompt: 'hi' },
      { authorization: 'Bearer tok' },
      { ANTHROPIC_API_KEY: '', CLIENT_TOKEN: '' },
    );
    expect(res.status).toBe(500);
  });
});

describe('unknown route', () => {
  it('404s', async () => {
    const res = await call(new Request('http://w/v1/something'));
    expect(res.status).toBe(404);
  });
});

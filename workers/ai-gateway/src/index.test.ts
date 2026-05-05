import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index.js';

const ENV: Env = {
  ANTHROPIC_API_KEY: 'sk-ant-test',
  CLIENT_TOKEN: 'tok',
};

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

  it('forwards a valid request to Anthropic and reshapes the response', async () => {
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe('https://api.anthropic.com/v1/messages');
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '{"a":1}' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 7, output_tokens: 4 },
          model: 'claude-haiku-4-5-20251001',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
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

  it('sends x-api-key + anthropic-version on upstream call', async () => {
    let upstreamHeaders: Headers | null = null;
    vi.stubGlobal('fetch', async (_input: unknown, init?: RequestInit) => {
      upstreamHeaders = new Headers(init?.headers);
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '{}' }],
          stop_reason: null,
          usage: { input_tokens: 0, output_tokens: 0 },
          model: 'm',
        }),
      );
    });

    await postJson(
      { model: 'claude-haiku-4-5', prompt: 'hi' },
      { authorization: 'Bearer tok' },
    );

    expect(upstreamHeaders).not.toBeNull();
    expect(upstreamHeaders!.get('x-api-key')).toBe('sk-ant-test');
    expect(upstreamHeaders!.get('anthropic-version')).toBe('2023-06-01');
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

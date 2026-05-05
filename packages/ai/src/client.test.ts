import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GatewayError, complete, pingGateway } from './client.js';
import { MODELS } from './models.js';

const CFG = { endpoint: 'http://localhost:8787', clientToken: 'tok' };

const HelloSchema = z.object({ greeting: z.string() });

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: typeof fetch) {
  vi.stubGlobal('fetch', impl);
}

describe('complete', () => {
  it('posts the prompt and returns the schema-validated object', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    stubFetch(async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(
        JSON.stringify({
          text: '{"greeting": "你好"}',
          stopReason: 'end_turn',
          usage: { input_tokens: 12, output_tokens: 5 },
          model: 'claude-haiku-4-5',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const result = await complete(CFG, {
      prompt: 'say hi',
      model: MODELS.haiku,
      maxTokens: 200,
      schema: HelloSchema,
    });

    expect(result.data).toEqual({ greeting: '你好' });
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 5 });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('http://localhost:8787/v1/complete');
    const body = JSON.parse(call.init.body as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      model: 'claude-haiku-4-5',
      prompt: 'say hi',
      max_tokens: 200,
    });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('system');
    const headers = call.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok');
  });

  it('passes optional system + temperature when provided', async () => {
    let bodyOut: Record<string, unknown> | null = null;
    stubFetch(async (_input, init) => {
      bodyOut = JSON.parse(init?.body as string) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          text: '{"greeting":"hi"}',
          stopReason: null,
          usage: { input_tokens: 1, output_tokens: 1 },
          model: 'claude-haiku-4-5',
        }),
      );
    });

    await complete(CFG, {
      prompt: 'p',
      model: MODELS.haiku,
      maxTokens: 100,
      schema: HelloSchema,
      system: 'be terse',
      temperature: 0.2,
    });

    expect(bodyOut).toMatchObject({ system: 'be terse', temperature: 0.2 });
  });

  it('strips ```json fences before validating', async () => {
    stubFetch(async () =>
      new Response(
        JSON.stringify({
          text: '```json\n{"greeting":"hi"}\n```',
          stopReason: null,
          usage: { input_tokens: 0, output_tokens: 0 },
          model: 'm',
        }),
      ),
    );

    const r = await complete(CFG, {
      prompt: 'p',
      model: MODELS.haiku,
      maxTokens: 50,
      schema: HelloSchema,
    });
    expect(r.data.greeting).toBe('hi');
  });

  it('throws GatewayError on non-2xx', async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
    );

    await expect(
      complete(CFG, {
        prompt: 'p',
        model: MODELS.haiku,
        maxTokens: 50,
        schema: HelloSchema,
      }),
    ).rejects.toBeInstanceOf(GatewayError);
  });

  it('rejects when model output fails the schema', async () => {
    stubFetch(async () =>
      new Response(
        JSON.stringify({
          text: '{"unexpected": true}',
          stopReason: null,
          usage: { input_tokens: 0, output_tokens: 0 },
          model: 'm',
        }),
      ),
    );

    await expect(
      complete(CFG, {
        prompt: 'p',
        model: MODELS.haiku,
        maxTokens: 50,
        schema: HelloSchema,
      }),
    ).rejects.toThrow();
  });
});

describe('pingGateway', () => {
  it('returns true on /health { ok: true }', async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    expect(await pingGateway(CFG)).toBe(true);
  });

  it('returns false on non-2xx', async () => {
    stubFetch(async () => new Response('nope', { status: 503 }));
    expect(await pingGateway(CFG)).toBe(false);
  });

  it('returns false on network error', async () => {
    stubFetch(async () => {
      throw new TypeError('network');
    });
    expect(await pingGateway(CFG)).toBe(false);
  });
});

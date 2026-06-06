import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  GatewayError,
  complete,
  completeUntilDone,
  completeText,
  completeTextUntilDone,
  pingGateway,
} from './client.js';
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

describe('completeText', () => {
  it('returns the raw text without schema validation', async () => {
    stubFetch(async () =>
      new Response(
        JSON.stringify({
          text: 'whatever the model said, including ```fences``` and prose',
          stopReason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
          model: 'claude-haiku-4-5-20251001',
        }),
      ),
    );

    const r = await completeText(CFG, {
      prompt: 'p',
      model: MODELS.haiku,
      maxTokens: 200,
    });
    expect(r.text).toContain('fences');
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(r.model).toBe('claude-haiku-4-5-20251001');
  });

  it('throws GatewayError on non-2xx', async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ error: 'rate' }), { status: 429 }),
    );
    await expect(
      completeText(CFG, {
        prompt: 'p',
        model: MODELS.haiku,
        maxTokens: 50,
      }),
    ).rejects.toBeInstanceOf(GatewayError);
  });
});

describe('completeTextUntilDone', () => {
  const chunk = (
    text: string,
    stopReason: string,
    io: [number, number] = [1, 1],
  ) =>
    new Response(
      JSON.stringify({
        text,
        stopReason,
        usage: { input_tokens: io[0], output_tokens: io[1] },
        model: 'claude-haiku-4-5-20251001',
      }),
    );

  it('stitches chunks until the model stops, prefilling continuations', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    stubFetch(async (_input, init) => {
      bodies.push(JSON.parse(String(init!.body)) as Record<string, unknown>);
      call++;
      if (call === 1) return chunk('part1 ', 'max_tokens', [5, 8]);
      if (call === 2) return chunk('part2 ', 'max_tokens', [6, 9]);
      return chunk('end', 'end_turn', [7, 3]);
    });

    const r = await completeTextUntilDone(CFG, {
      prompt: 'p',
      model: MODELS.haiku,
      maxTokens: 100,
    });

    expect(r.text).toBe('part1 part2 end');
    expect(r.stopReason).toBe('end_turn');
    // usage summed across all 3 calls
    expect(r.usage).toEqual({ inputTokens: 18, outputTokens: 20 });
    // first call no prefill; continuations carry the trimmed accumulation
    expect(bodies[0]!.assistant_prefill).toBeUndefined();
    expect(bodies[1]!.assistant_prefill).toBe('part1');
    expect(bodies[2]!.assistant_prefill).toBe('part1 part2');
  });

  it('stops at maxContinuations even if still truncated', async () => {
    let call = 0;
    stubFetch(async () => {
      call++;
      return chunk(`x${call}`, 'max_tokens');
    });
    const r = await completeTextUntilDone(CFG, {
      prompt: 'p',
      model: MODELS.haiku,
      maxTokens: 50,
      maxContinuations: 2,
    });
    expect(call).toBe(3); // 1 initial + 2 continuations
    expect(r.text).toBe('x1x2x3');
    expect(r.stopReason).toBe('max_tokens');
  });

  it('makes a single call when the model finishes first try', async () => {
    let call = 0;
    stubFetch(async () => {
      call++;
      return chunk('done', 'end_turn');
    });
    const r = await completeTextUntilDone(CFG, {
      prompt: 'p',
      model: MODELS.haiku,
      maxTokens: 50,
    });
    expect(call).toBe(1);
    expect(r.text).toBe('done');
  });
});

describe('completeUntilDone', () => {
  const jsonChunk = (text: string, stopReason: string) =>
    new Response(
      JSON.stringify({
        text,
        stopReason,
        usage: { input_tokens: 1, output_tokens: 1 },
        model: 'claude-haiku-4-5-20251001',
      }),
    );

  it('stitches truncated JSON across chunks then validates', async () => {
    let call = 0;
    const bodies: Array<Record<string, unknown>> = [];
    stubFetch(async (_input, init) => {
      bodies.push(JSON.parse(String(init!.body)) as Record<string, unknown>);
      call++;
      // First chunk is valid-prefix-but-incomplete JSON, truncated.
      if (call === 1) return jsonChunk('{"greeting":', 'max_tokens');
      return jsonChunk(' "你好"}', 'end_turn');
    });

    const r = await completeUntilDone(CFG, {
      prompt: 'p',
      model: MODELS.haiku,
      maxTokens: 50,
      schema: HelloSchema,
    });

    expect(call).toBe(2);
    expect(r.data).toEqual({ greeting: '你好' });
    // Continuation carried the partial JSON back as assistant_prefill.
    expect(bodies[1]!.assistant_prefill).toBe('{"greeting":');
  });

  it('throws a helpful error when still truncated after continuations', async () => {
    stubFetch(async () => jsonChunk('{"greeting":', 'max_tokens'));
    await expect(
      completeUntilDone(CFG, {
        prompt: 'p',
        model: MODELS.haiku,
        maxTokens: 50,
        maxContinuations: 1,
        schema: HelloSchema,
      }),
    ).rejects.toThrow(/truncated after continuations/);
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

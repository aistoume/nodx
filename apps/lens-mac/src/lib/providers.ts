/**
 * Provider streaming API calls.  Same as apps/extension/src/shared/providers.ts.
 * (Future: lift to packages/lens-shared when both projects stabilize.)
 */

export type ChunkCallback = (text: string) => void;

export async function callAnthropic(
  apiKey: string, model: string, prompt: string,
  onChunk: ChunkCallback, signal?: AbortSignal,
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model, max_tokens: 800, stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  let full = '';
  await readSse(res.body, (event, data) => {
    if (event !== 'content_block_delta') return;
    const obj = safeParse<{ delta?: { text?: string } }>(data);
    const txt = obj?.delta?.text;
    if (txt) { full += txt; onChunk(txt); }
  });
  return full;
}

export async function callOpenAI(
  apiKey: string, model: string, prompt: string,
  onChunk: ChunkCallback, signal?: AbortSignal,
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, stream: true, max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  let full = '';
  await readSse(res.body, (_event, data) => {
    if (data === '[DONE]') return;
    const obj = safeParse<{ choices?: { delta?: { content?: string } }[] }>(data);
    const txt = obj?.choices?.[0]?.delta?.content;
    if (txt) { full += txt; onChunk(txt); }
  });
  return full;
}

export async function callGoogle(
  apiKey: string, model: string, prompt: string,
  onChunk: ChunkCallback, signal?: AbortSignal,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 800 },
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Google ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  let full = '';
  await readSse(res.body, (_event, data) => {
    const obj = safeParse<{
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    }>(data);
    const txt = obj?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (txt) { full += txt; onChunk(txt); }
  });
  return full;
}

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
    if (done) { flush(); break; }
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      if (line === '') flush();
      else if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
  }
}

function safeParse<T>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch { return null; }
}

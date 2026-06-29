// ──────────────────────────────────────────────────────────────────────
// nodx CLI gateway — local AI gateway backed by the Claude Code CLI.
//
// Speaks the SAME HTTP contract as workers/ai-gateway (the Cloudflare worker
// that uses an Anthropic API key), but instead of calling api.anthropic.com
// with a key, it shells out to `claude -p` — your locally-authenticated
// Claude Code session. So nodx runs on whatever auth Claude Code already has
// (a Claude subscription OR an API key) and never needs its own API key.
//
// This is the sanctioned way to "use my subscription": nodx drives the
// Claude Code CLI you're licensed to run, as local automation. It does NOT
// extract or replay OAuth tokens against the API — that would violate
// Anthropic's terms.
//
// Contract (mirrors the worker):
//   GET  /health        → { ok, service }
//   POST /v1/complete   → { text, stopReason, usage:{input_tokens,output_tokens}, model }
//   POST /v1/embed      → 501 (embeddings need the API-key gateway; CBR degrades)
//
// Run it on the worker's port so the desktop app needs NO config change:
//   PORT=8787 node src/server.mjs     (or: pnpm --filter @nodx/cli-gateway dev)
//
// Tradeoffs vs the API-key worker:
//   • Latency: each call cold-starts a `claude` process (~5–7s overhead).
//   • No max_tokens / temperature control (the CLI owns generation).
//   • No embeddings → CBR retrieval is unavailable in this mode.
// ──────────────────────────────────────────────────────────────────────

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT ?? process.env.CLI_GATEWAY_PORT ?? 8787);
const HOST = process.env.CLI_GATEWAY_HOST ?? '127.0.0.1';
// Optional bearer token. If unset, any token is accepted (localhost only).
const TOKEN = process.env.CLI_GATEWAY_TOKEN ?? '';
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';
// Per-call hard timeout (web search can take minutes; cold start a few s).
const CALL_TIMEOUT_MS = Number(process.env.CLI_GATEWAY_TIMEOUT_MS ?? 300_000);

// Strip Claude Code's coding-agent identity when the caller gives no system
// prompt — nodx wants a neutral reasoning assistant, not a coding agent.
const DEFAULT_SYSTEM =
  '你是一个严谨的推理助手。严格按用户的指令作答，只输出被要求的内容；不要使用任何工具，不要解释你在做什么。';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
};

/** Map nodx model ids to CLI aliases Claude Code reliably accepts. */
function mapModel(model) {
  const s = String(model ?? '').toLowerCase();
  if (s.includes('haiku')) return 'haiku';
  if (s.includes('opus')) return 'opus';
  if (s.includes('sonnet')) return 'sonnet';
  return model || 'sonnet';
}

function sendJson(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': buf.length,
    ...CORS,
  });
  res.end(buf);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Run one `claude -p` completion. Resolves the parsed result envelope, or
 * rejects with { status, message } on spawn / non-zero / error-envelope.
 */
function runClaude({ model, prompt, system, enableWebSearch }) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json', '--model', mapModel(model)];
    if (enableWebSearch) {
      // Allow only the read-only web tools, give it room for search→answer.
      args.push('--allowedTools', 'WebSearch', 'WebFetch', '--max-turns', '8');
    } else {
      // Empty allow-list = no tools at all (can't touch the filesystem);
      // one turn = a single assistant message (the answer).
      args.push('--allowedTools', '--max-turns', '1');
    }
    args.push('--system-prompt', system && system.trim() ? system : DEFAULT_SYSTEM);

    let child;
    try {
      child = spawn(CLAUDE_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      reject({ status: 500, message: `failed to spawn ${CLAUDE_BIN}: ${e?.message ?? e}` });
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done(reject, { status: 504, message: `claude call timed out after ${CALL_TIMEOUT_MS}ms` });
    }, CALL_TIMEOUT_MS);

    child.on('error', (e) => {
      const enoent = e && e.code === 'ENOENT';
      done(reject, {
        status: 500,
        message: enoent
          ? `'${CLAUDE_BIN}' not found on PATH — install Claude Code (npm i -g @anthropic-ai/claude-code) and run \`claude\` once to log in`
          : `spawn error: ${e?.message ?? e}`,
      });
    });
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));

    child.on('close', (code) => {
      if (settled) return;
      const env = parseEnvelope(stdout);
      if (!env) {
        done(reject, {
          status: 502,
          message: `claude exited ${code} without a parseable result. stderr: ${stderr.slice(0, 500) || '(none)'}`,
        });
        return;
      }
      if (env.is_error || env.subtype !== 'success') {
        done(reject, {
          status: 502,
          message: `claude returned an error (${env.subtype ?? 'unknown'}): ${String(env.result ?? '').slice(0, 500) || stderr.slice(0, 300)}`,
        });
        return;
      }
      done(resolve, env);
    });

    child.stdin.write(String(prompt ?? ''));
    child.stdin.end();
  });
}

/** Claude Code prints one JSON object (the result envelope). Be lenient. */
function parseEnvelope(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall back to the last line that parses and looks like a result.
    const lines = trimmed.split('\n').reverse();
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj && obj.type === 'result') return obj;
      } catch {
        // keep scanning
      }
    }
    return null;
  }
}

/** Map the CLI envelope → the worker's GatewayResponse shape. */
function toGatewayResponse(env, requestedModel) {
  let inputTokens = 0;
  let outputTokens = 0;
  let model = String(requestedModel ?? '');
  const mu = env.modelUsage;
  if (mu && typeof mu === 'object') {
    const keys = Object.keys(mu);
    if (keys.length) model = keys[0];
    for (const k of keys) {
      inputTokens += Number(mu[k]?.inputTokens ?? 0);
      outputTokens += Number(mu[k]?.outputTokens ?? 0);
    }
  }
  if (!inputTokens && env.usage) inputTokens = Number(env.usage.input_tokens ?? 0);
  if (!outputTokens && env.usage) outputTokens = Number(env.usage.output_tokens ?? 0);

  // The CLI can't resume an assistant turn via prefill, so never report
  // 'max_tokens' (that would make nodx's continuation loop re-run + concat
  // a fresh full answer → garbage). The CLI runs to the model's full output
  // ceiling (e.g. 32k), so real truncation on nodx-sized prompts is moot.
  let stopReason = env.stop_reason ?? 'end_turn';
  if (stopReason === 'max_tokens') stopReason = 'end_turn';

  return {
    text: String(env.result ?? ''),
    stopReason,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    model,
  };
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/health') {
    sendJson(res, 200, { ok: true, service: 'nodx-cli-gateway', backend: CLAUDE_BIN });
    return;
  }

  if (url.pathname === '/v1/embed' && req.method === 'POST') {
    sendJson(res, 501, {
      error:
        'embeddings unavailable in CLI mode — CBR 检索需要 API-key 网关（配置 GEMINI_API_KEY 后用 `pnpm start`）。核心思考功能不受影响。',
    });
    return;
  }

  if (url.pathname === '/v1/complete' && req.method === 'POST') {
    if (TOKEN) {
      const auth = req.headers.authorization ?? '';
      if (auth !== `Bearer ${TOKEN}`) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
    }
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { error: 'invalid json' });
      return;
    }
    if (typeof body.prompt !== 'string' || !body.prompt) {
      sendJson(res, 400, { error: 'prompt (string) is required' });
      return;
    }
    try {
      const env = await runClaude({
        model: body.model,
        prompt: body.prompt,
        system: typeof body.system === 'string' ? body.system : undefined,
        enableWebSearch: body.enable_web_search === true,
      });
      sendJson(res, 200, toGatewayResponse(env, body.model));
    } catch (e) {
      const status = e && typeof e.status === 'number' ? e.status : 500;
      sendJson(res, status, { error: e?.message ?? String(e) });
    }
    return;
  }

  sendJson(res, 404, { error: 'not found', path: url.pathname });
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[nodx-cli-gateway] listening on http://${HOST}:${PORT} — backend: ${CLAUDE_BIN} (Claude Code session)\n` +
      `  /v1/complete → claude -p   |   /v1/embed → 501 (CBR off in CLI mode)`,
  );
});

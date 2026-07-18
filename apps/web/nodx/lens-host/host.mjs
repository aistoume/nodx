#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────
// nodx Lens native-messaging host — Chrome ↔ local Claude Code CLI bridge.
//
// The zero-terminal path for "extension + claude CLI only" users: Chrome
// spawns THIS process on demand (chrome.runtime.connectNative), so nothing
// listens on a port and no terminal window stays open. Each `complete`
// message shells out to `claude -p` — the user's locally-authenticated
// Claude Code session (subscription or key), same invocation shape as
// workers/cli-gateway/src/server.mjs.
//
// Wire protocol (Chrome native messaging): every message, both directions,
// is a 4-byte little-endian length prefix + UTF-8 JSON.
//   → { id, type: 'ping' }
//   ← { id, ok: true, service: 'nodx-lens-host', claude: '<bin>' }
//   → { id, type: 'complete', model?, prompt, imageBase64?, imageMime?, webSearch? }
//   ← { id, ok: true, text }   |   { id, ok: false, error }
//
// Replies host→Chrome are capped at 1 MB by Chrome — text answers are far
// below that. Installed by install.sh, which bakes the node + claude paths
// into a wrapper script (Chrome's spawn PATH may lack /opt/homebrew/bin).
// ──────────────────────────────────────────────────────────────────────

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';
const CALL_TIMEOUT_MS = Number(process.env.NODX_HOST_TIMEOUT_MS ?? 300_000);

const DEFAULT_SYSTEM =
  '你是一个严谨的推理助手。严格按用户的指令作答，只输出被要求的内容；不要使用任何工具，不要解释你在做什么。';

/** Map nodx model ids to CLI aliases Claude Code reliably accepts. */
function mapModel(model) {
  const s = String(model ?? '').toLowerCase();
  if (s.includes('haiku')) return 'haiku';
  if (s.includes('opus')) return 'opus';
  if (s.includes('sonnet')) return 'sonnet';
  return model || 'sonnet';
}

/** One `claude -p` completion — same flags/locking as the CLI gateway. */
function runClaude({ model, prompt, enableWebSearch, imagePath }) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json', '--model', mapModel(model)];
    if (enableWebSearch) {
      args.push('--allowedTools', 'WebSearch', 'WebFetch', '--max-turns', '8');
    } else if (imagePath) {
      args.push('--allowedTools', 'Read', '--max-turns', '3');
    } else {
      args.push('--allowedTools', '--max-turns', '1');
    }
    args.push('--system-prompt', DEFAULT_SYSTEM);

    let child;
    try {
      child = spawn(CLAUDE_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      reject(new Error(`failed to spawn ${CLAUDE_BIN}: ${e?.message ?? e}`));
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
      done(reject, new Error(`claude call timed out after ${CALL_TIMEOUT_MS}ms`));
    }, CALL_TIMEOUT_MS);

    child.on('error', (e) => {
      done(
        reject,
        new Error(
          e && e.code === 'ENOENT'
            ? `'${CLAUDE_BIN}' not found — install Claude Code and log in, then re-run install.sh`
            : `spawn error: ${e?.message ?? e}`,
        ),
      );
    });
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      if (settled) return;
      const env = parseEnvelope(stdout);
      if (!env) {
        done(
          reject,
          new Error(
            `claude exited ${code} without a parseable result. stderr: ${stderr.slice(0, 400) || '(none)'}`,
          ),
        );
        return;
      }
      if (env.is_error || env.subtype !== 'success') {
        done(
          reject,
          new Error(
            `claude error (${env.subtype ?? 'unknown'}): ${String(env.result ?? '').slice(0, 400) || stderr.slice(0, 300)}`,
          ),
        );
        return;
      }
      done(resolve, String(env.result ?? ''));
    });

    const finalPrompt = imagePath
      ? `First use the Read tool to view the image at ${imagePath} — do not do anything else with the filesystem. Then complete the following task about that image, replying with ONLY the final answer:\n\n${String(prompt ?? '')}`
      : String(prompt ?? '');
    child.stdin.write(finalPrompt);
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
    const lines = trimmed.split('\n').reverse();
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj && obj.type === 'result') return obj;
      } catch {
        /* keep scanning */
      }
    }
    return null;
  }
}

// ── Native-messaging framing over stdio ────────────────────────────────

function send(msg) {
  const buf = Buffer.from(JSON.stringify(msg), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buf.length, 0);
  process.stdout.write(Buffer.concat([header, buf]));
}

async function handle(msg) {
  const id = msg?.id;
  try {
    if (msg?.type === 'ping') {
      send({ id, ok: true, service: 'nodx-lens-host', claude: CLAUDE_BIN });
      return;
    }
    if (msg?.type === 'complete') {
      if (typeof msg.prompt !== 'string' || !msg.prompt) {
        send({ id, ok: false, error: 'prompt (string) is required' });
        return;
      }
      let imagePath;
      if (typeof msg.imageBase64 === 'string' && msg.imageBase64) {
        const dir = join(tmpdir(), 'nodx-lens-host');
        mkdirSync(dir, { recursive: true });
        const ext = String(msg.imageMime ?? '').includes('jpeg') ? 'jpg' : 'png';
        imagePath = join(dir, `img-${randomUUID()}.${ext}`);
        writeFileSync(imagePath, Buffer.from(msg.imageBase64, 'base64'));
      }
      try {
        const text = await runClaude({
          model: msg.model,
          prompt: msg.prompt,
          enableWebSearch: msg.webSearch === true,
          imagePath,
        });
        send({ id, ok: true, text });
      } finally {
        if (imagePath) {
          try {
            unlinkSync(imagePath);
          } catch {
            /* already gone */
          }
        }
      }
      return;
    }
    send({ id, ok: false, error: `unknown message type: ${String(msg?.type)}` });
  } catch (e) {
    send({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

let pending = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  pending = Buffer.concat([pending, chunk]);
  // Extract every complete frame currently buffered.
  while (pending.length >= 4) {
    const len = pending.readUInt32LE(0);
    if (pending.length < 4 + len) break;
    const body = pending.subarray(4, 4 + len).toString('utf8');
    pending = pending.subarray(4 + len);
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      send({ ok: false, error: 'malformed frame' });
      continue;
    }
    void handle(msg);
  }
});
process.stdin.on('end', () => process.exit(0));

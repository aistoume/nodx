/**
 * aicon.solutions install counter — two endpoints on a zone route:
 *
 *   GET /api/install-ping?src=<slug>  → "+1" (total / per-source / per-day)
 *   GET /api/install-stats            → public aggregate JSON
 *
 * Privacy: counters only. No IP, no ID, no UA is ever stored.
 * install.sh (native host) pings src=native-host on success; other
 * installers can join with their own src slug.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/install-ping') return ping(url, env);
    if (url.pathname === '/api/install-stats') return stats(env);
    return new Response('not found', { status: 404 });
  },
};

async function ping(url, env) {
  try {
    const src =
      (url.searchParams.get('src') ?? 'unknown')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 32) || 'unknown';
    const day = new Date().toISOString().slice(0, 10);
    for (const key of [
      'installs:total',
      `installs:src:${src}`,
      `installs:day:${day}`,
    ]) {
      const cur = parseInt((await env.STATS.get(key)) ?? '0', 10);
      await env.STATS.put(key, String(cur + 1));
    }
  } catch {
    // Counting must never fail the caller.
  }
  return new Response('ok', {
    headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
  });
}

async function stats(env) {
  const total = parseInt((await env.STATS.get('installs:total')) ?? '0', 10);

  const bySource = {};
  const srcList = await env.STATS.list({ prefix: 'installs:src:' });
  for (const k of srcList.keys) {
    bySource[k.name.slice('installs:src:'.length)] = parseInt(
      (await env.STATS.get(k.name)) ?? '0',
      10,
    );
  }

  const last14Days = {};
  const now = Date.now();
  for (let i = 0; i < 14; i++) {
    const day = new Date(now - i * 86400_000).toISOString().slice(0, 10);
    const v = await env.STATS.get(`installs:day:${day}`);
    if (v) last14Days[day] = parseInt(v, 10);
  }

  return new Response(JSON.stringify({ total, bySource, last14Days }, null, 2), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

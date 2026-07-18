/**
 * Public read side of the install counter — plain aggregate numbers only.
 * GET /api/install-stats → { total, bySource, last14Days }
 */
export async function onRequest({ env }) {
  if (!env.STATS) {
    return json({ error: 'stats storage not configured yet' }, 503);
  }
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
  return json({ total, bySource, last14Days });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

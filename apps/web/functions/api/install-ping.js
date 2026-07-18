/**
 * Anonymous install counter — `install.sh` (and friends) ping this once on
 * success. Stores ONLY counters (total / per-source / per-day); no IP, no
 * ID, no UA is recorded. Backed by a KV namespace bound as STATS; until
 * that binding exists the endpoint still answers 200 so installers never
 * break on telemetry.
 */
export async function onRequest({ env, request }) {
  try {
    if (env.STATS) {
      const src =
        (new URL(request.url).searchParams.get('src') ?? 'unknown')
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
    }
  } catch {
    // Counting must never fail the caller.
  }
  return new Response('ok', {
    headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' },
  });
}

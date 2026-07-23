// Minimal fixed-window rate limiter, in process memory.
//
// HONEST LIMITATION: on serverless this counts per instance, not globally, so the real ceiling is
// roughly (limit x concurrent instances). It stops naive scripted spam, which is what launchpad
// creation will attract first; it is NOT a defence against a distributed attacker. Moving to
// Upstash/Redis is a drop-in replacement for `hit()` and is the right call before a public launch.

type Window = { count: number; resetAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __rateLimitBuckets: Map<string, Window> | undefined;
}
const buckets = (globalThis.__rateLimitBuckets ??= new Map<string, Window>());

export type RateResult = { ok: true } | { ok: false; retryAfterSec: number };

export function hit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  const w = buckets.get(key);

  if (!w || w.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) sweep(now);
    return { ok: true };
  }
  if (w.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  }
  w.count += 1;
  return { ok: true };
}

function sweep(now: number) {
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

/// Best-effort client identity. `x-forwarded-for` is attacker-controlled in general, but on Vercel
/// the platform overwrites it, so the left-most entry is the real peer there.
export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}

export function tooMany(retryAfterSec: number): Response {
  return new Response(JSON.stringify({ error: "Too many requests — slow down" }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfterSec) },
  });
}

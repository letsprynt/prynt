import { NextRequest } from "next/server";

// Image proxy + cache. Instead of every visitor's browser fetching a token image from a slow/flaky public IPFS
// gateway (ipfs.io routinely 404s / rate-limits), we fetch it ONCE from a fast gateway (Pinata, where we pin),
// cache the bytes, and serve them from OUR domain to all users. CIDs are immutable → we can cache forever, so
// the CDN (in prod) and every browser hold it after the first hit. Result: images load instantly for everyone.

export const dynamic = "force-dynamic"; // we set our own long-lived Cache-Control below

const GATEWAYS = (process.env.IMG_GATEWAYS ?? "https://gateway.pinata.cloud/ipfs/,https://dweb.link/ipfs/,https://ipfs.io/ipfs/")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

type Cached = { body: ArrayBuffer; type: string };
const cache = new Map<string, Cached>(); // persists for the server process; CID-keyed so it never goes stale
const MAX = 300;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB cap — never buffer arbitrarily large gateway responses
// Only re-serve RASTER images from our own origin. SVG is excluded on purpose: an SVG can carry <script>, and
// serving it same-origin would be a stored-XSS vector (frontend security audit, HIGH).
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

function respond({ body, type }: Cached) {
  return new Response(body, {
    headers: {
      "Content-Type": type,
      // Defense-in-depth: never MIME-sniff, never execute scripts — even if a disallowed type slipped through.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=31536000, immutable", // content-addressed → safe to cache forever
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cid: string[] }> }) {
  const { cid } = await params;
  const path = (cid ?? []).join("/");
  // CID (+ optional sub-path) only — never let this proxy arbitrary hosts/paths.
  if (!path || path.includes("..") || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path)) {
    return new Response("bad path", { status: 400 });
  }

  const hit = cache.get(path);
  if (hit) return respond(hit);

  for (const gw of GATEWAYS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12_000);
      const r = await fetch(gw + path, { signal: ctrl.signal, redirect: "error" }); // never follow off-gateway redirects
      clearTimeout(timer);
      if (!r.ok) continue;
      const type = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!ALLOWED_TYPES.has(type)) continue; // raster only — rejects SVG (XSS), HTML error pages, anything else
      if (Number(r.headers.get("content-length") ?? 0) > MAX_BYTES) continue; // declared too large
      const body = await r.arrayBuffer();
      if (body.byteLength > MAX_BYTES) continue; // actual too large
      const entry: Cached = { body, type };
      cache.set(path, entry);
      if (cache.size > MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      return respond(entry);
    } catch {
      /* try the next gateway */
    }
  }
  // Not retrievable yet (fresh pin still propagating) — NOT cached, so the client can retry shortly.
  return new Response("not found", { status: 404 });
}

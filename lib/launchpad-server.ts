import { cookies, headers } from "next/headers";
import { DEFAULT_CONFIG, type LaunchpadConfig } from "./launchpad-config";
import { getByDomain, getBySlug } from "./launchpad-store";
import { SINGLE_TENANT_CONFIG } from "./launchpad-single";
import { normaliseHost, slugFromHost } from "./tenant-host";

// Header name shared with middleware.ts — one constant so the two sides cannot drift.
export const TENANT_HEADER = "x-tenant";
export const TENANT_COOKIE = "tenant";

// The one place a server component reads the tenant: layout, generateMetadata, the OG image routes,
// robots.ts and sitemap.ts all call this.
//
// PHASE 2: the source is now the config database, read DIRECTLY (not through an HTTP call to our own
// /api/launchpads/resolve). A server component fetching its own API adds a network round trip to
// every render and can deadlock a single-worker dev server. The route still exists for clients.
//
// NODE RUNTIME ONLY. This pulls in the postgres driver, so any route that calls it must run on the
// node runtime — that is why the OG image routes were moved off `edge`.

/// Resolution order — THE HOST WINS, always:
///   1. subdomain of the apex — `<slug>.prynt.fun`.
///   2. verified custom domain.
///   3. only if the host claims no tenant: the `x-tenant` header (the `?tenant=` preview override).
///   4. only if the host claims no tenant: the sticky preview cookie.
///   5. the bundled default.
///
/// Putting the host ABOVE the override is a security property, not a preference. If `?tenant=` could
/// win on a hostname that already belongs to someone, then `https://alice.prynt.fun/?tenant=evil`
/// would render Alice's domain in an attacker's branding, complete with matching SEO — a ready-made
/// phishing link on a legitimate origin. Preview therefore only works where nobody is claiming the
/// name: localhost, *.vercel.app, and the apex itself.
///
/// The same reasoning retires the cookie on a tenant host: it is a session cookie on path "/", so
/// one visit to `?tenant=demo-a` would otherwise repaint that host for the rest of the session, and
/// the OG routes are cached publicly with no `Vary: Cookie` — a shared cache could pin the wrong
/// tenant's card onto a canonical domain.
///
/// PLATFORM vs TENANT. The apex (and localhost / *.vercel.app) serves a marketing landing at "/",
/// while every launchpad host serves its coin board there. That distinction is stamped PER REQUEST
/// from WHICH BRANCH answered — never by comparing the returned object against DEFAULT_CONFIG,
/// because a typo'd subdomain legitimately returns DEFAULT_CONFIG while still being a tenant host.
/// It is deliberately not a field on LaunchpadConfig either: that object is owner-editable jsonb, so
/// a permission stored inside it could be granted by a PATCH to /api/launchpads/:slug.
///
/// SINGLE-TENANT SHORT-CIRCUIT. Everything above describes a deployment that serves many launchpads
/// and has to work out which one a request is for. An operator running this app on their own hosting
/// serves exactly one, on every hostname, and has none of the machinery the resolution order needs:
/// no `launchpads` table, no subdomain of our apex, no verified-domain records. When
/// LAUNCHPAD_CONFIG is set, `resolveServerContext` returns that config before any of it runs — no
/// database query, no Host parsing, no `x-tenant` header, no cookie. See lib/launchpad-single.ts.
export type LaunchpadSource = "platform" | "subdomain" | "domain" | "header" | "cookie" | "fallback" | "single";

export interface LaunchpadContext {
  config: LaunchpadConfig;
  source: LaunchpadSource;
  /// True only for hosts the platform itself owns. FAIL-SAFE: anything unexpected resolves to false,
  /// i.e. to the board. Showing the board on the apex for a moment is a cosmetic bug; showing the
  /// platform's sales landing on a customer's own domain is not.
  isPlatform: boolean;
}

export async function resolveServerContext(): Promise<LaunchpadContext> {
  // OUTSIDE the try, and first. Two reasons, both load-bearing:
  //
  //   1. The catch below turns ANY failure into DEFAULT_CONFIG. If the single-tenant branch lived
  //      inside resolve(), a config that threw would not surface as an error — it would render
  //      prynt.fun's name, palette, SEO and schema.org sameAs on the operator's own domain. A
  //      malformed config must be a 500, never a silent impersonation. (launchpad-single.ts throws
  //      at import, so by the time this line runs the config is known-good; the ordering keeps that
  //      property true even if that ever changes.)
  //   2. It guarantees the claim "no database call, no cookie, no header, no Host parsing" — those
  //      all live in resolve(), which is now unreachable in single-tenant mode.
  //
  // isPlatform is hard `false`, not a config field. It is a property of the DEPLOYMENT, and a
  // launchpad running on its owner's hosting is never the platform: it gets the app chrome rather
  // than our B2B landing, its board at "/", and no /board entry in its sitemap. Keeping it out of
  // LaunchpadConfig is deliberate (see the note above) — inside the config it would be an
  // owner-editable capability.
  if (SINGLE_TENANT_CONFIG) {
    return { config: SINGLE_TENANT_CONFIG, source: "single", isPlatform: false };
  }

  try {
    return await resolve();
  } catch (err) {
    console.error("[launchpad-server] resolveServerContext failed:", err);
    return { config: DEFAULT_CONFIG, source: "fallback", isPlatform: false };
  }
}

/// Alias kept for call sites that read as "give me the context" rather than "resolve it".
export async function getServerContext(): Promise<LaunchpadContext> {
  return resolveServerContext();
}

export async function getServerConfig(): Promise<LaunchpadConfig> {
  return (await resolveServerContext()).config;
}

async function resolve(): Promise<LaunchpadContext> {
  const h = await headers();
  const host = normaliseHost(h.get("host"));

  // 1. subdomain of the apex
  const slug = slugFromHost(host);
  if (slug) {
    const bySlug = await getBySlug(slug);
    // A subdomain that resolves to nothing falls back to the platform rather than 404 — a typo'd or
    // deleted hostname should show something coherent, not a broken page. It is marked "fallback"
    // and treated as a platform host because its canonical already points at the apex.
    if (bySlug) return { config: bySlug, source: "subdomain", isPlatform: false };
    return { config: DEFAULT_CONFIG, source: "fallback", isPlatform: true };
  }

  // 2. verified custom domain
  if (host) {
    const byDomain = await getByDomain(host);
    if (byDomain) return { config: byDomain, source: "domain", isPlatform: false };
  }

  // --- from here on the host claims no tenant, so previewing is safe ---

  // 3. explicit per-request override (?tenant=, injected by middleware)
  const headerTenant = h.get(TENANT_HEADER);
  if (headerTenant) {
    const byHeader = await getBySlug(headerTenant.toLowerCase());
    if (byHeader) return { config: byHeader, source: "header", isPlatform: false };
  }

  // 4. sticky preview cookie, so client-side navigation keeps the chosen tenant
  const c = await cookies();
  const cookieTenant = c.get(TENANT_COOKIE)?.value;
  if (cookieTenant) {
    const byCookie = await getBySlug(cookieTenant.toLowerCase());
    if (byCookie) return { config: byCookie, source: "cookie", isPlatform: false };
  }

  // 5. default — nobody claims this host, so it is ours: the apex, www, localhost, a preview URL.
  return { config: DEFAULT_CONFIG, source: "platform", isPlatform: true };
}

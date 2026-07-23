import { RESERVED_SLUGS } from "@/lib/launchpad-schema";

// Host -> tenant mapping. Shared by the middleware, the resolve route and the server-side config
// loader so all three agree; a disagreement here would mean the page renders one tenant's branding
// while its metadata claims another.

/// The apex the wildcard is served from, e.g. "prynt.fun". Without it, subdomain routing is off and
/// only custom domains + ?tenant= work.
export const APEX = (process.env.NEXT_PUBLIC_APEX_DOMAIN ?? "").toLowerCase().replace(/^\.+|\.+$/g, "");

/// Local development hosts where `<slug>.localhost` should behave like `<slug>.<APEX>`.
const DEV_APEXES = ["localhost", "127.0.0.1", "0.0.0.0"];

export function normaliseHost(raw: string | null | undefined): string {
  if (!raw) return "";
  // Strip the port, lowercase, drop a trailing dot (a fully-qualified "example.com." is valid and
  // would otherwise miss every comparison).
  return raw.toLowerCase().trim().split(":")[0].replace(/\.$/, "");
}

/// Extract a tenant slug from `<slug>.<APEX>` (or `<slug>.localhost` in dev).
/// Returns null for the apex itself, for "www", and for anything that is not a single label deep —
/// callers then fall through to custom-domain lookup and finally to the default tenant.
export function slugFromHost(rawHost: string | null | undefined): string | null {
  const host = normaliseHost(rawHost);
  if (!host) return null;

  const apexes = [APEX, ...DEV_APEXES].filter(Boolean);
  for (const apex of apexes) {
    if (host === apex) return null; // the apex serves the default tenant
    if (!host.endsWith(`.${apex}`)) continue;

    const label = host.slice(0, -(apex.length + 1));
    // Only a single label maps to a tenant. Deeper names (a.b.apex) are not ours to interpret and
    // must not silently resolve to tenant "a".
    if (!label || label.includes(".")) return null;
    if (label === "www") return null;
    // A reserved label is never a tenant even if somebody managed to insert the row.
    if (RESERVED_SLUGS.has(label)) return null;
    return label;
  }
  return null;
}

/// The public URL a tenant lives at. Used for the success screen and dashboard links.
export function tenantUrl(slug: string): string {
  if (!APEX) return `/?tenant=${slug}`;
  return `https://${slug}.${APEX}`;
}

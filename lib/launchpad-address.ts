import { APEX } from "@/lib/tenant-host";

// ONE answer to "where does my launchpad live?".
//
// Before this module the wizard gave three different answers on three screens: step 1 printed
// `<slug>.<apex>` with a hardcoded `localhost:3000` fallback, step 3 repeated it, and the success
// screen linked to whatever `tenantUrl()` returned (a `/?tenant=` query link whenever APEX is
// unset). Every address string in the creator flow now comes from `addressPlan()` so they cannot
// disagree again.
//
// The module is deliberately PURE and takes its inputs as arguments (with env-derived defaults), so
// the same function answers on the server, in the client wizard, and in a test.

/// Whether the wildcard subdomain actually serves traffic.
///   live        — `*.<apex>` resolves, has a certificate, and is routed to this deployment.
///   reserved    — the slug is claimed in our database, but the hostname does not serve yet.
///   unavailable — no apex is configured at all, so subdomain routing is off on this deployment
///                 (`slugFromHost` in lib/tenant-host.ts can never match, and the API stores the
///                  platform's own siteUrl instead of a per-tenant one).
export type SubdomainState = "live" | "reserved" | "unavailable";

/// FAIL CLOSED. Serving `<slug>.<apex>` needs two things that live outside this repository:
/// a wildcard DNS record on the zone, and `*.<apex>` added to the hosting project with a wildcard
/// certificate. Neither is observable from application code, so the panel refuses to call the
/// address live until an operator who has done that work sets this flag. A missing flag understates
/// the truth; a defaulted-on flag would make the wizard promise an address that NXDOMAINs, which is
/// the bug this module exists to kill.
export const WILDCARD_READY = process.env.NEXT_PUBLIC_LAUNCHPAD_WILDCARD_READY === "1";

/// Shown in place of a slug the creator has not typed yet, so the panel can render its full shape
/// from the first paint instead of appearing when the field is filled.
export const SLUG_PLACEHOLDER = "your-launchpad";

export type AddressPlan = {
  /// The configured apex, or "" when subdomain routing is off.
  apex: string;
  /// True while the creator has not entered a slug — every URL below is illustrative, not claimable.
  pending: boolean;
  subdomain: {
    state: SubdomainState;
    /// `<slug>.<apex>`, or null when there is no apex to build it from.
    host: string | null;
    /// The https URL, or null. Only follow it when state is "live".
    url: string | null;
  };
  preview: {
    /// Absolute when the caller knows the browser's host, relative otherwise. Always real.
    url: string;
    /// The host this URL is rooted at, for display ("" when relative).
    origin: string;
  };
};

export type AddressPlanInput = {
  slug: string;
  /// The host the creator is actually on — `window.location.host` in the client, the `host` header
  /// on the server. Includes the port, which is exactly why the old hardcoded "localhost:3000"
  /// was wrong on a dev server running at :3002.
  host?: string | null;
  apex?: string;
  wildcardReady?: boolean;
};

export function addressPlan({
  slug,
  host,
  apex = APEX,
  wildcardReady = WILDCARD_READY,
}: AddressPlanInput): AddressPlan {
  const clean = slug.trim().toLowerCase();
  const pending = clean.length === 0;
  const label = pending ? SLUG_PLACEHOLDER : clean;

  const origin = (host ?? "").trim();
  // A relative link is the honest answer before the browser has told us where it is: it resolves to
  // the current origin whatever that turns out to be.
  const previewPath = `/?tenant=${encodeURIComponent(label)}`;
  const previewUrl = origin ? `${protocolFor(origin)}//${origin}${previewPath}` : previewPath;

  if (!apex) {
    return {
      apex: "",
      pending,
      subdomain: { state: "unavailable", host: null, url: null },
      preview: { url: previewUrl, origin },
    };
  }

  const subHost = `${label}.${apex}`;
  return {
    apex,
    pending,
    subdomain: {
      state: wildcardReady ? "live" : "reserved",
      host: subHost,
      url: `https://${subHost}`,
    },
    preview: { url: previewUrl, origin },
  };
}

/// Local hosts are served over plain http; anything else this app is reachable at is https.
function protocolFor(origin: string): string {
  const bare = origin.split(":")[0];
  return bare === "localhost" || bare === "127.0.0.1" || bare === "0.0.0.0" ? "http:" : "https:";
}

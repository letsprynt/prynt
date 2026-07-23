import { NextResponse } from "next/server";
import { getByDomain, getBySlug } from "@/lib/launchpad-store";
import { DEFAULT_CONFIG } from "@/lib/launchpad-config";
import { slugFromHost } from "@/lib/tenant-host";
import { singleTenantNotFound } from "@/lib/launchpad-single";

export const runtime = "nodejs";

/// The hot path: called for a hostname or slug and answers with that tenant's config.
///
/// Server components do NOT call this over HTTP — they call the store directly (an app calling
/// itself through the network adds a round trip and can deadlock a single-worker dev server).
/// This route exists for client-side and external consumers.
export async function GET(req: Request) {
  // PLATFORM-ONLY. On a single-launchpad deployment there is no registry, no accounts system
  // and no row behind this — leaving it reachable answers under the operator's brand.
  const gate = singleTenantNotFound();
  if (gate) return gate;

  const url = new URL(req.url);
  const slugParam = url.searchParams.get("slug");
  const hostParam = url.searchParams.get("host");

  let config = null;
  if (slugParam) {
    config = await getBySlug(slugParam.toLowerCase());
  } else if (hostParam) {
    const host = hostParam.toLowerCase().split(":")[0];
    const slug = slugFromHost(host);
    config = slug ? await getBySlug(slug) : await getByDomain(host);
  }

  const body = config ?? DEFAULT_CONFIG;
  return NextResponse.json(
    { config: body, fallback: !config },
    {
      headers: {
        // Short shared cache with a long stale window: a branding edit shows up within a minute,
        // and an outage in the config DB still serves the last good answer instead of failing.
        "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}

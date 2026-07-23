import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/auth/session";
import type { LaunchpadConfig } from "@/lib/launchpad-config";
import { launchpadConfigSchema } from "@/lib/launchpad-schema";
import { getBySlug, getRow, update } from "@/lib/launchpad-store";
import { clientKey, hit, tooMany } from "@/lib/rate-limit";
import { singleTenantNotFound } from "@/lib/launchpad-single";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/// Shallow merge with deletion. `null` and "" mean "remove this link"; the key is dropped so the
/// re-validation below sees an absent optional rather than a value `safeUrl` would reject.
function mergeLinks(current: LaunchpadConfig["links"], incoming: unknown): LaunchpadConfig["links"] {
  const merged: Record<string, unknown> = { ...current };
  if (incoming && typeof incoming === "object" && !Array.isArray(incoming)) {
    for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
      if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) delete merged[k];
      else merged[k] = v;
    }
  }
  return merged as LaunchpadConfig["links"];
}

/// Public read of a tenant config.
export async function GET(_req: Request, { params }: Ctx) {
  // PLATFORM-ONLY. On a single-launchpad deployment there is no registry, no accounts system
  // and no row behind this — leaving it reachable answers under the operator's brand.
  const gate = singleTenantNotFound();
  if (gate) return gate;

  const { slug } = await params;
  const config = await getBySlug(slug.toLowerCase());
  if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ config }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}

/// Owner-only edit. The config is merged shallowly per top-level section and re-validated in full,
/// so a partial update can never smuggle an invalid value past the schema.
export async function PATCH(req: Request, { params }: Ctx) {
  // PLATFORM-ONLY. On a single-launchpad deployment there is no registry, no accounts system
  // and no row behind this — leaving it reachable answers under the operator's brand.
  const gate = singleTenantNotFound();
  if (gate) return gate;

  const rl = hit(clientKey(req, "patch-launchpad"), 60, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const { slug: rawSlug } = await params;
  const slug = rawSlug.toLowerCase();

  const caller = await currentAddress();
  if (!caller) return NextResponse.json({ error: "Connect and sign in first" }, { status: 401 });

  const row = await getRow(slug);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.ownerAddress.toLowerCase() !== caller) {
    // Deliberately 403 (not 404): the row's existence is already public via GET, so hiding it here
    // would buy nothing and make the error confusing for a legitimate owner on the wrong wallet.
    return NextResponse.json({ error: "You do not own this launchpad" }, { status: 403 });
  }

  const patch = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!patch) return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });

  const current = row.config as LaunchpadConfig;
  const merged = {
    ...current,
    ...patch,
    // Immutable by design: identity, ownership and the domain list are not editable through this
    // endpoint (domains have their own verified flow).
    slug: current.slug,
    ownerAddress: current.ownerAddress,
    domains: current.domains,
    theme: { ...current.theme, ...((patch.theme as object) ?? {}) },
    seo: { ...current.seo, ...((patch.seo as object) ?? {}), siteUrl: current.seo.siteUrl },
    // A link key sent as `null` (or "") is a REMOVAL: the shallow merge alone can only ever add or
    // change a link, which made a footer link impossible to delete once saved. Anything else merges
    // as before, and a key the caller did not send keeps its stored value.
    links: mergeLinks(current.links, patch.links),
    features: { ...current.features, ...((patch.features as object) ?? {}) },
  };

  const parsed = launchpadConfigSchema.safeParse(merged);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid launchpad configuration",
        issues: parsed.error.issues.slice(0, 8).map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  const ok = await update(slug, parsed.data as LaunchpadConfig);
  if (!ok) return NextResponse.json({ error: "Could not save changes" }, { status: 500 });
  return NextResponse.json({ config: parsed.data });
}

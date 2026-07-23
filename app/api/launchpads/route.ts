import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/auth/session";
import { DEFAULT_CONFIG, type LaunchpadConfig } from "@/lib/launchpad-config";
import { checkSlug, launchpadConfigSchema } from "@/lib/launchpad-schema";
import { create, slugTaken } from "@/lib/launchpad-store";
import { dbConfigured } from "@/lib/db/client";
import { clientKey, hit, tooMany } from "@/lib/rate-limit";
import { APEX, tenantUrl } from "@/lib/tenant-host";
import { singleTenantNotFound } from "@/lib/launchpad-single";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Create a launchpad. The signed-in wallet becomes the owner; there is no other way to set it.
export async function POST(req: Request) {
  // PLATFORM-ONLY. On a single-launchpad deployment there is no registry, no accounts system
  // and no row behind this — leaving it reachable answers under the operator's brand.
  const gate = singleTenantNotFound();
  if (gate) return gate;

  // Creation is the expensive, spam-prone write. Two buckets: a tight one per IP, and the session
  // requirement itself, which already costs a wallet signature.
  const rl = hit(clientKey(req, "create-launchpad"), 5, 60 * 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  if (!dbConfigured) {
    return NextResponse.json({ error: "Launchpad creation is not available on this deployment" }, { status: 503 });
  }

  const owner = await currentAddress();
  if (!owner) return NextResponse.json({ error: "Connect and sign in first" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { slug?: string; config?: unknown } | null;
  if (!body?.slug || !body?.config) {
    return NextResponse.json({ error: "slug and config are required" }, { status: 400 });
  }

  const shape = checkSlug(String(body.slug));
  if (!shape.ok) return NextResponse.json({ error: shape.reason }, { status: 400 });
  // Use the value checkSlug actually validated, never the raw input: the two differ by
  // trim/lowercase, and only the normalized form is a valid on-chain slug.
  const slug = shape.slug;

  // Force the server's own values over anything the client sent: slug, owner and the public URL are
  // authority-bearing and must not be client-settable.
  const incoming = body.config as Record<string, unknown>;
  const candidate = {
    ...incoming,
    slug,
    domains: [] as string[],
    ownerAddress: owner,
    seo: {
      ...(incoming.seo as Record<string, unknown> | undefined),
      siteUrl: APEX ? `https://${slug}.${APEX}` : DEFAULT_CONFIG.seo.siteUrl,
    },
  };

  const parsed = launchpadConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid launchpad configuration",
        issues: parsed.error.issues.slice(0, 8).map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    if (await slugTaken(slug)) return NextResponse.json({ error: "That name is already taken" }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "Could not verify availability — try again" }, { status: 503 });
  }

  const result = await create({ slug, ownerAddress: owner, config: parsed.data as LaunchpadConfig });
  if (!result.ok) {
    // A unique-violation here means someone took the slug between the check and the insert; the
    // database index is the real arbiter, which is why the check above is an optimisation only.
    const status = result.error.includes("taken") ? 409 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ id: result.id, slug, url: tenantUrl(slug) }, { status: 201 });
}

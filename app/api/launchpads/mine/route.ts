import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/auth/session";
import { listByOwner, listDomains } from "@/lib/launchpad-store";
import { singleTenantNotFound } from "@/lib/launchpad-single";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Launchpads owned by the signed-in wallet, each with its domain rows so the dashboard renders in
/// one round trip.
export async function GET() {
  // PLATFORM-ONLY. On a single-launchpad deployment there is no registry, no accounts system
  // and no row behind this — leaving it reachable answers under the operator's brand.
  const gate = singleTenantNotFound();
  if (gate) return gate;

  const owner = await currentAddress();
  if (!owner) return NextResponse.json({ error: "Connect and sign in first" }, { status: 401 });

  const rows = await listByOwner(owner);
  const withDomains = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      slug: r.slug,
      status: r.status,
      createdAt: r.createdAt,
      config: r.config,
      domains: await listDomains(r.id),
    })),
  );
  return NextResponse.json({ address: owner, launchpads: withDomains }, { headers: { "cache-control": "no-store" } });
}

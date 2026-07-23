import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth/session";
import { singleTenantNotFound } from "@/lib/launchpad-single";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  // PLATFORM-ONLY. On a single-launchpad deployment there is no registry, no accounts system
  // and no row behind this — leaving it reachable answers under the operator's brand.
  const gate = singleTenantNotFound();
  if (gate) return gate;

  await signOut();
  return NextResponse.json({ ok: true });
}

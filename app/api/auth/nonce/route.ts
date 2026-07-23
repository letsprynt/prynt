import { NextResponse } from "next/server";
import { issueNonce } from "@/lib/auth/session";
import { clientKey, hit, tooMany } from "@/lib/rate-limit";
import { singleTenantNotFound } from "@/lib/launchpad-single";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Step 1 of sign-in: hand out a single-use challenge. The nonce also goes into an httpOnly cookie
/// as a signed JWT, so /verify can trust it without any server-side session store.
export async function GET(req: Request) {
  // PLATFORM-ONLY. On a single-launchpad deployment there is no registry, no accounts system
  // and no row behind this — leaving it reachable answers under the operator's brand.
  const gate = singleTenantNotFound();
  if (gate) return gate;

  const rl = hit(clientKey(req, "nonce"), 30, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const issued = await issueNonce();
  if (!issued) {
    return NextResponse.json({ error: "Auth is not configured on this deployment" }, { status: 503 });
  }
  return NextResponse.json(issued, { headers: { "cache-control": "no-store" } });
}

import { NextResponse } from "next/server";
import { verifySignature } from "@/lib/auth/session";
import { clientKey, hit, tooMany } from "@/lib/rate-limit";
import { singleTenantNotFound } from "@/lib/launchpad-single";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Step 2: check the signature over the challenge and mint a session cookie.
export async function POST(req: Request) {
  // PLATFORM-ONLY. On a single-launchpad deployment there is no registry, no accounts system
  // and no row behind this — leaving it reachable answers under the operator's brand.
  const gate = singleTenantNotFound();
  if (gate) return gate;

  const rl = hit(clientKey(req, "verify"), 20, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const body = (await req.json().catch(() => null)) as { address?: string; signature?: string } | null;
  if (!body?.address || !body?.signature) {
    return NextResponse.json({ error: "address and signature are required" }, { status: 400 });
  }

  // The domain is taken from the request host, never from the client body: it is part of what was
  // signed, so letting the caller choose it would defeat the domain binding.
  const host = req.headers.get("host") ?? "localhost";
  const result = await verifySignature({ address: body.address, signature: body.signature, domain: host });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 401 });

  return NextResponse.json({ address: result.address }, { headers: { "cache-control": "no-store" } });
}

import { NextResponse } from "next/server";
import { checkSlug } from "@/lib/launchpad-schema";
import { slugTaken } from "@/lib/launchpad-store";
import { clientKey, hit, tooMany } from "@/lib/rate-limit";
import { singleTenantNotFound } from "@/lib/launchpad-single";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Live availability check for the creator form. Mirrors exactly what POST /api/launchpads
/// enforces, so the form can never accept a name the server would reject.
export async function GET(req: Request) {
  // PLATFORM-ONLY. On a single-launchpad deployment there is no registry, no accounts system
  // and no row behind this — leaving it reachable answers under the operator's brand.
  const gate = singleTenantNotFound();
  if (gate) return gate;

  const rl = hit(clientKey(req, "check-slug"), 120, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const raw = new URL(req.url).searchParams.get("slug") ?? "";

  const shape = checkSlug(raw);
  if (!shape.ok) return NextResponse.json({ available: false, reason: shape.reason });
  const slug = shape.slug;

  try {
    const taken = await slugTaken(slug);
    return NextResponse.json(
      taken ? { available: false, reason: "Already taken" } : { available: true },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    // slugTaken fails closed on a database error; surface that rather than claim availability.
    return NextResponse.json({ available: false, reason: "Could not check right now — try again" }, { status: 503 });
  }
}

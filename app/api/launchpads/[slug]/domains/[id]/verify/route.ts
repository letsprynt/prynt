import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/auth/session";
import { getDomain, getRow, markVerified } from "@/lib/launchpad-store";
import { clientKey, hit, tooMany } from "@/lib/rate-limit";
import { checkTxtToken, getDomainStatus, verificationRecordName, vercelConfigured } from "@/lib/vercel-domains";
import { singleTenantNotFound } from "@/lib/launchpad-single";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; id: string }> };

/// Prove ownership of a custom domain. BOTH gates must pass:
///   1. the TXT token exists in DNS (proves control of the hostname to us),
///   2. Vercel reports the domain configured (proves it actually routes here and has a cert).
/// Only then does the row become usable for tenant resolution.
export async function POST(req: Request, { params }: Ctx) {
  // PLATFORM-ONLY. On a single-launchpad deployment there is no registry, no accounts system
  // and no row behind this — leaving it reachable answers under the operator's brand.
  const gate = singleTenantNotFound();
  if (gate) return gate;

  const rl = hit(clientKey(req, "verify-domain"), 30, 60 * 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const { slug, id } = await params;

  const caller = await currentAddress();
  if (!caller) return NextResponse.json({ error: "Connect and sign in first" }, { status: 401 });
  const row = await getRow(slug.toLowerCase());
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.ownerAddress.toLowerCase() !== caller) {
    return NextResponse.json({ error: "You do not own this launchpad" }, { status: 403 });
  }

  const domainRow = await getDomain(id);
  // Check the domain belongs to THIS launchpad — otherwise an owner of any launchpad could verify
  // (and thereby activate) a domain row belonging to someone else.
  if (!domainRow || domainRow.launchpadId !== row.id) {
    return NextResponse.json({ error: "Domain not found on this launchpad" }, { status: 404 });
  }
  if (domainRow.verified) return NextResponse.json({ verified: true, alreadyVerified: true });

  const txt = await checkTxtToken(domainRow.domain, domainRow.verificationToken);
  if (!txt.ok) {
    return NextResponse.json(
      {
        verified: false,
        step: "txt",
        error:
          txt.error ??
          `The TXT record at ${verificationRecordName(domainRow.domain)} does not contain the expected token yet.`,
        expected: { name: verificationRecordName(domainRow.domain), value: domainRow.verificationToken },
        found: txt.found,
      },
      { status: 400 },
    );
  }

  const status = vercelConfigured ? await getDomainStatus(domainRow.domain) : null;
  if (status && !status.configured) {
    return NextResponse.json(
      {
        verified: false,
        step: "dns",
        error:
          "Ownership is proven, but the domain is not pointing here yet. Check the CNAME record; DNS changes can take a few minutes to propagate.",
        vercel: status,
      },
      { status: 400 },
    );
  }

  const ok = await markVerified(domainRow.id, domainRow.domain);
  if (!ok) return NextResponse.json({ error: "Could not save verification" }, { status: 500 });
  return NextResponse.json({ verified: true, domain: domainRow.domain });
}

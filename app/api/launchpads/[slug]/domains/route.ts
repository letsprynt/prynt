import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/auth/session";
import { domainSchema } from "@/lib/launchpad-schema";
import { addDomain, getRow, listDomains } from "@/lib/launchpad-store";
import { clientKey, hit, tooMany } from "@/lib/rate-limit";
import {
  addDomainToProject,
  makeVerificationToken,
  verificationRecordName,
  vercelConfigured,
} from "@/lib/vercel-domains";
import { APEX } from "@/lib/tenant-host";
import { singleTenantNotFound } from "@/lib/launchpad-single";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

async function ownerGuard(slug: string) {
  const caller = await currentAddress();
  if (!caller) return { error: NextResponse.json({ error: "Connect and sign in first" }, { status: 401 }) };
  const row = await getRow(slug);
  if (!row) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (row.ownerAddress.toLowerCase() !== caller) {
    return { error: NextResponse.json({ error: "You do not own this launchpad" }, { status: 403 }) };
  }
  return { row };
}

export async function GET(_req: Request, { params }: Ctx) {
  // PLATFORM-ONLY. On a single-launchpad deployment there is no registry, no accounts system
  // and no row behind this — leaving it reachable answers under the operator's brand.
  const gate = singleTenantNotFound();
  if (gate) return gate;

  const { slug } = await params;
  const guard = await ownerGuard(slug.toLowerCase());
  if (guard.error) return guard.error;
  return NextResponse.json({ domains: await listDomains(guard.row!.id) }, { headers: { "cache-control": "no-store" } });
}

/// Claim a custom domain. This only records an INTENT: the row is unverified, and unverified rows
/// are never used to resolve a tenant. Ownership is proven later via the TXT record.
export async function POST(req: Request, { params }: Ctx) {
  // PLATFORM-ONLY. On a single-launchpad deployment there is no registry, no accounts system
  // and no row behind this — leaving it reachable answers under the operator's brand.
  const gate = singleTenantNotFound();
  if (gate) return gate;

  const rl = hit(clientKey(req, "add-domain"), 10, 60 * 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const { slug } = await params;
  const guard = await ownerGuard(slug.toLowerCase());
  if (guard.error) return guard.error;

  const body = (await req.json().catch(() => null)) as { domain?: string } | null;
  const parsed = domainSchema.safeParse(body?.domain ?? "");
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid domain" }, { status: 400 });
  }
  const domain = parsed.data;

  // Our own apex and its subdomains are served by the wildcard; letting a tenant claim one would
  // shadow the platform itself.
  if (APEX && (domain === APEX || domain.endsWith(`.${APEX}`))) {
    return NextResponse.json({ error: `${domain} is served by the platform and cannot be added` }, { status: 400 });
  }

  const token = makeVerificationToken();
  const saved = await addDomain(guard.row!.id, domain, token);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 409 });

  // Register on Vercel too so the certificate is issued and the hostname routes here. A failure is
  // reported but NOT fatal: the row exists and the user can retry from the dashboard.
  const vercel = vercelConfigured ? await addDomainToProject(domain) : null;

  return NextResponse.json(
    {
      domain: saved.row,
      dns: {
        cname: { name: domain, value: vercel?.ok ? vercel.cname : "cname.vercel-dns.com" },
        txt: { name: verificationRecordName(domain), value: token },
      },
      vercel: vercel ? (vercel.ok ? { ok: true } : { ok: false, error: vercel.error }) : { ok: false, error: "Vercel API is not configured" },
    },
    { status: 201 },
  );
}

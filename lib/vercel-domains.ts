import { promises as dns } from "node:dns";

// Thin wrapper over the Vercel Domains API for tenant custom domains, plus the TXT check that
// proves the requester actually controls the hostname.
//
// TWO INDEPENDENT GATES, on purpose:
//   1. TXT record  — proves ownership to US. Without it, anyone could add `coinbase.com` to their
//      launchpad and (once DNS pointed here) serve their branding on someone else's name.
//   2. Vercel      — proves the hostname is actually routed to this deployment and gets a cert.
// A domain is only marked verified when BOTH pass.

const API = "https://api.vercel.com";
const TOKEN = process.env.VERCEL_API_TOKEN;
const PROJECT = process.env.VERCEL_PROJECT_ID;
const TEAM = process.env.VERCEL_TEAM_ID;

export const vercelConfigured = Boolean(TOKEN && PROJECT);

/// The DNS label the TXT record must live on, e.g. `_launchpad-verify.launch.example.com`.
export const TXT_PREFIX = "_launchpad-verify";

export function verificationRecordName(domain: string) {
  return `${TXT_PREFIX}.${domain}`;
}

export function makeVerificationToken() {
  return `lp_verify_${crypto.randomUUID().replace(/-/g, "")}`;
}

function teamQs() {
  return TEAM ? `?teamId=${encodeURIComponent(TEAM)}` : "";
}

async function vercel(path: string, init?: RequestInit) {
  if (!vercelConfigured) return { ok: false as const, status: 503, body: { error: "Vercel API is not configured" } };
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body } as const;
  } catch (err) {
    console.error("[vercel-domains] request failed:", err);
    return { ok: false as const, status: 502, body: { error: "Could not reach the Vercel API" } };
  }
}

export type AddDomainResult =
  | { ok: true; cname: string; alreadyPresent: boolean }
  | { ok: false; error: string };

/// Register the hostname on the Vercel project. Idempotent: an existing domain is treated as
/// success, because the user may be retrying after a DNS mistake.
export async function addDomainToProject(domain: string): Promise<AddDomainResult> {
  const res = await vercel(`/v10/projects/${PROJECT}/domains${teamQs()}`, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });

  const code = (res.body as { error?: { code?: string; message?: string } })?.error?.code;
  if (!res.ok && code !== "domain_already_in_use" && code !== "domain_already_exists") {
    const message =
      (res.body as { error?: { message?: string } })?.error?.message ?? `Vercel rejected the domain (${res.status})`;
    return { ok: false, error: message };
  }
  return {
    ok: true,
    cname: process.env.NEXT_PUBLIC_VERCEL_CNAME_TARGET ?? "cname.vercel-dns.com",
    alreadyPresent: !res.ok,
  };
}

export type VercelDomainStatus = {
  configured: boolean;
  verified: boolean;
  misconfigured: boolean;
  note?: string;
};

export async function getDomainStatus(domain: string): Promise<VercelDomainStatus> {
  if (!vercelConfigured) {
    return { configured: false, verified: false, misconfigured: false, note: "Vercel API is not configured" };
  }
  const cfg = await vercel(`/v6/domains/${encodeURIComponent(domain)}/config${teamQs()}`);
  const misconfigured = Boolean((cfg.body as { misconfigured?: boolean })?.misconfigured);
  const dom = await vercel(`/v9/projects/${PROJECT}/domains/${encodeURIComponent(domain)}${teamQs()}`);
  const verified = Boolean((dom.body as { verified?: boolean })?.verified);
  return { configured: cfg.ok && !misconfigured, verified, misconfigured };
}

/// Does `_launchpad-verify.<domain>` contain our token? Node's resolver is used directly rather
/// than the OS cache so a freshly-added record is seen without waiting for a local TTL.
export async function checkTxtToken(domain: string, token: string): Promise<{ ok: boolean; found: string[]; error?: string }> {
  const name = verificationRecordName(domain);
  try {
    const records = await dns.resolveTxt(name);
    const flat = records.map((chunks) => chunks.join("").trim());
    return { ok: flat.includes(token), found: flat };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const msg =
      code === "ENOTFOUND" || code === "ENODATA"
        ? `No TXT record found at ${name} — add it at your DNS provider, then retry. DNS changes can take a few minutes to propagate.`
        : `Could not read DNS for ${name} (${code ?? "unknown error"})`;
    return { ok: false, found: [], error: msg };
  }
}

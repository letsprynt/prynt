// Social-link validation + normalization. Creator-supplied links are untrusted, so we (1) require the X and
// Telegram fields to actually point at those domains (no phishing link hidden behind a "Twitter" label), and
// (2) force https. Used both at creation (form) and at display (drop a link whose host no longer matches).

export type SocialKind = "website" | "twitter" | "telegram";

const ALLOW: Record<"twitter" | "telegram", string[]> = {
  twitter: ["x.com", "twitter.com"],
  telegram: ["t.me", "telegram.me", "telegram.org"],
};

const LABEL: Record<SocialKind, string> = {
  website: "website",
  twitter: "X / Twitter link",
  telegram: "Telegram link",
};

function hostMatches(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  // exact domain, or a subdomain of it (mobile.twitter.com, etc.) — never a look-alike like x.com.evil.tld
  return allowed.some((a) => h === a || h.endsWith("." + a));
}

export type SocialCheck = { ok: boolean; url: string | null; error: string | null };

/// Validate + normalize one social field. Empty is OK (socials are optional). Returns the canonical https URL.
export function validateSocial(kind: SocialKind, raw: string | null | undefined): SocialCheck {
  const t = (raw ?? "").trim();
  if (!t) return { ok: true, url: null, error: null };

  let candidate = t;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = "https://" + candidate; // bare "x.com/foo" → add scheme

  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { ok: false, url: null, error: `Enter a valid ${LABEL[kind]}` };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, url: null, error: `${LABEL[kind]} must be a web (http/https) link` };
  }
  u.protocol = "https:"; // always upgrade to https

  if (kind === "twitter" && !hostMatches(u.host, ALLOW.twitter)) {
    return { ok: false, url: null, error: "Must be an x.com or twitter.com link" };
  }
  if (kind === "telegram" && !hostMatches(u.host, ALLOW.telegram)) {
    return { ok: false, url: null, error: "Must be a t.me (Telegram) link" };
  }
  return { ok: true, url: u.href, error: null };
}

/// Display-time guard: return the link only if it still validates for its field, else null (drops mislabeled links).
export function socialForDisplay(kind: SocialKind, url: string | null | undefined): string | null {
  return validateSocial(kind, url).url;
}

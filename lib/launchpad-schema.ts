import { z } from "zod";

// Single source of truth for what a tenant config may contain. The API validates against these
// schemas before anything reaches the database, and the TypeScript types in launchpad-config.ts are
// checked against the inferred types — so a field can never drift between validation and rendering.
//
// THREAT MODEL. Every value here is attacker-supplied and ends up either (a) inside an inline
// <style> block emitted into the document, or (b) inside SEO/meta text. So:
//   - colours must match a strict colour grammar, never free text;
//   - URLs are restricted to https/http or same-origin paths — `javascript:` and `data:` are the
//     obvious XSS vectors and are rejected here rather than filtered downstream;
//   - text fields are length-capped and stripped of angle brackets.
// There is deliberately NO field that accepts raw CSS or HTML. Custom CSS is a future tier and
// would need a real sanitiser (or an iframe), not a regex.

/// #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() with numeric args only. No `var()`, no `url()`, no
/// arbitrary functions — those would let a value escape into the surrounding declaration.
const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/;

export const colour = z
  .string()
  .trim()
  .max(64)
  .refine((v) => HEX.test(v) || RGB.test(v), {
    message: "Must be a hex colour (#RGB/#RRGGBB) or rgb()/rgba()",
  });

/// A CSS length used for radii. Digits + a unit, nothing else.
export const cssLength = z
  .string()
  .trim()
  .max(16)
  .regex(/^\d{1,4}(?:\.\d{1,2})?(?:px|rem|em|%)$/, "Must be a length like 12px or 0.5rem");

/// Structural characters that would let a value escape its declaration or the surrounding
/// `:root{...}` block once emitted into an inline <style>.
const STRUCTURAL = /[<>{};@\\]/;

/// Every `name(` in the value must be on the allow-list. Written as an extraction + set membership
/// rather than a negative-lookahead regex on purpose: `\b(?!linear-gradient\b)[a-z-]+\(` looks
/// correct but a word boundary also sits INSIDE the hyphen, so it matches the trailing "gradient("
/// and rejects a perfectly valid gradient. Matching the whole hyphenated identifier avoids that.
function onlyAllowedFunctions(v: string, allowed: string[]): boolean {
  const names = v.match(/[a-zA-Z-]+(?=\s*\()/g) ?? [];
  const ok = new Set(allowed);
  return names.every((n) => ok.has(n.toLowerCase()));
}

/// A box-shadow value: offsets, blur, spread, an optional `inset`, and colour literals. Anything
/// calling a function other than rgb/rgba (`url(`, `image-set(`, …) is rejected.
export const shadow = z
  .string()
  .trim()
  .max(200)
  .refine((v) => !STRUCTURAL.test(v) && onlyAllowedFunctions(v, ["rgb", "rgba", "hsl", "hsla"]), {
    message: "Unsupported shadow value",
  });

/// A gradient or a flat colour. Same rule as `shadow`, plus the gradient functions themselves.
export const gradient = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) =>
      !STRUCTURAL.test(v) &&
      onlyAllowedFunctions(v, [
        "rgb", "rgba", "hsl", "hsla",
        "linear-gradient", "radial-gradient", "conic-gradient",
        "repeating-linear-gradient", "repeating-radial-gradient",
      ]),
    { message: "Unsupported gradient value" },
  );

/// Font stacks are quoted family names and generic keywords — no `url()` (that would be a font
/// fetch from an attacker-controlled origin).
export const fontStack = z
  .string()
  .trim()
  .max(300)
  .refine((v) => !/[<>{};@\\]/.test(v) && !/\(/.test(v), { message: "Unsupported font stack" });

/// Absolute http(s) URL or a same-origin path. Blocks javascript:, data:, vbscript: and friends.
export const safeUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => {
      if (v.startsWith("/") && !v.startsWith("//")) return true; // same-origin path
      try {
        const u = new URL(v);
        return u.protocol === "https:" || u.protocol === "http:";
      } catch {
        return false;
      }
    },
    { message: "Must be an https:// URL or a /path" },
  );

/// Display text. Angle brackets are stripped rather than rejected so a user typing "A < B" in a
/// tagline is not blocked; the value is also used in JSON-LD, where `<` needs escaping anyway.
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v.replace(/[<>]/g, ""));

export const themeSchema = z.object({
  bg: colour,
  surface: colour,
  surface2: colour,
  border: colour,
  borderSoft: colour,
  accent: colour,
  accentHover: colour,
  accentDeep: colour,
  accentSoft: colour,
  accentLine: colour,
  ink: colour,
  hot: colour,
  up: colour,
  down: colour,
  text: colour,
  textMuted: colour,
  textSubtle: colour,
  grad: gradient,
  glow: shadow,
  fontSans: fontStack,
  radiusXs: cssLength,
  radiusSm: cssLength,
  radiusMd: cssLength,
  radiusLg: cssLength,
  radiusCard: cssLength,
  radiusPill: cssLength,
  ring: shadow,
  ringHover: shadow,
  shadowSm: shadow,
  shadowMd: shadow,
  shadowLg: shadow,
  chrome: colour,
  chromeBar: colour,
  hover: colour,
  track: colour,
  control: colour,
  dividerStrong: colour,
  overlay: colour,
});

export const seoSchema = z.object({
  title: text(120),
  description: text(300),
  homeDescription: text(300).optional(),
  // SEO copy for the platform's /board page, not a capability flag — safe to live in owner-editable
  // config, unlike anything that decides which chrome or which page a host gets.
  boardTitle: text(120).optional(),
  boardDescription: text(300).optional(),
  ogDescription: text(300).optional(),
  siteDescription: text(300).optional(),
  organizationLogoUrl: safeUrl.optional(),
  siteUrl: safeUrl,
  keywords: z.array(text(48)).max(20).default([]),
  twitterHandle: text(32).optional(),
  ogAccent: colour,
  ogBackground: colour,
  ogTextPrimary: colour,
  ogTextSecondary: colour,
  ogTagline: text(140),
});

export const linksSchema = z.object({
  twitter: safeUrl.optional(),
  telegram: safeUrl.optional(),
  docs: safeUrl.optional(),
  defillama: safeUrl.optional(),
});

export const featuresSchema = z.object({
  showKingOfHill: z.boolean(),
  showLeaderboard: z.boolean(),
  showWhitepaper: z.boolean(),
  networkFeed: z.boolean(),
});

const address = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a 0x address")
  .transform((v) => v.toLowerCase() as `0x${string}`);

export const launchpadConfigSchema = z.object({
  slug: z.string(),
  domains: z.array(z.string().max(253)).max(20).default([]),
  name: text(32),
  tld: text(16),
  tagline: text(140),
  logoUrl: safeUrl,
  kothBgUrl: safeUrl,
  faviconUrl: safeUrl.optional(),
  theme: themeSchema,
  seo: seoSchema,
  links: linksSchema.default({}),
  ownerAddress: address.optional(),
  treasuryAddress: address.optional(),
  features: featuresSchema,
});

export type LaunchpadConfigInput = z.input<typeof launchpadConfigSchema>;
export type LaunchpadConfigParsed = z.output<typeof launchpadConfigSchema>;

// ---------------------------------------------------------------------------------------------
//                                            SLUGS
// ---------------------------------------------------------------------------------------------

/// Subdomains that must never be handed to a tenant. Three groups, and each one is a real failure
/// mode rather than a nicety:
///   - infrastructure hostnames we already serve or will serve (api, www, cdn, …) — a tenant here
///     would shadow our own service;
///   - mail/protocol names (mx, smtp, autodiscover, …) — squatting these enables mail interception
///     and breaks SPF/DKIM discovery for the apex;
///   - our own brands and the obvious impersonation targets (prynt, admin, support, …).
export const RESERVED_SLUGS = new Set([
  // infrastructure
  "www", "api", "app", "admin", "dashboard", "cdn", "static", "assets", "img", "images",
  "media", "files", "download", "downloads", "status", "health", "metrics", "grafana",
  "test", "staging", "dev", "preview", "demo", "beta", "alpha", "sandbox", "local",
  "internal", "private", "vercel", "now", "edge", "proxy", "gateway", "ws", "wss",
  // mail + protocol discovery
  "mail", "email", "mx", "smtp", "imap", "pop", "pop3", "webmail", "autodiscover",
  "autoconfig", "ns", "ns1", "ns2", "dns", "mta-sts", "_domainkey", "dmarc", "spf",
  // brand + impersonation
  "prynt", "root", "support", "help", "security", "abuse", "legal", "billing", "account",
  "accounts", "auth", "login", "signin", "signup", "register", "wallet", "docs", "blog",
  "about", "terms", "privacy", "team", "careers", "press", "contact", "official", "verify",
  "verified", "trust", "safe", "secure",
  // platform-owned routes. The apex serves a marketing landing at "/" and the coin board at
  // "/board"; a tenant subdomain sharing one of these names would collide with a platform URL the
  // moment we link to it, so the names are taken out of circulation before anyone can claim them.
  "board", "coins", "explore", "trade", "launchpads", "pricing", "platform",
]);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export type SlugCheck = { ok: true; slug: string } | { ok: false; reason: string };

/// SHAPE ONLY — what a slug has to look like for every consumer of it, everywhere.
///
/// This half is universal: the value is stamped into the IPFS metadata of every coin launched
/// (app/api/upload/route.ts) and is handed to `LaunchpadRegistry.isValidSlug`, which rejects
/// uppercase and whitespace so `PRYNT` cannot shadow `prynt`. So it is enforced on the hosted path
/// AND on a self-hosted deployment (lib/launchpad-single.ts).
///
/// Returns the NORMALIZED slug on success, and callers must use that value rather than the string
/// they passed in: `checkSlugShape("  PRYNT ")` is ok, but those raw bytes would revert on-chain
/// with `InvalidSlug` and would not match the `launchpads.slug` row.
export function checkSlugShape(raw: string): SlugCheck {
  const slug = raw.trim().toLowerCase();
  if (slug.length < 3) return { ok: false, reason: "Too short — minimum 3 characters" };
  if (slug.length > 32) return { ok: false, reason: "Too long — maximum 32 characters" };
  if (!SLUG_RE.test(slug)) {
    return { ok: false, reason: "Use lowercase letters, numbers and dashes; must start and end with a letter or number" };
  }
  if (slug.includes("--")) return { ok: false, reason: "No double dashes" };
  // xn-- is the punycode prefix; allowing it lets a tenant register a homograph of another brand.
  if (slug.startsWith("xn-")) return { ok: false, reason: "Reserved prefix" };
  return { ok: true, slug };
}

/// SHAPE + NAMESPACE. The reservation half protects THIS platform's subdomain namespace: `admin`,
/// `mx`, `board`, `prynt` and ~110 others would shadow an infrastructure hostname, a mail record or
/// a platform route under `*.prynt.fun`. That namespace exists only where the platform hands out
/// subdomains, so this function gates the HOSTED path only — POST /api/launchpads and its live
/// availability check. A self-hosting operator whose brand slugifies to "safe" or "trust" has no
/// registry to collide with and is checked with `checkSlugShape` instead.
export function checkSlug(raw: string): SlugCheck {
  const shape = checkSlugShape(raw);
  if (!shape.ok) return shape;
  if (RESERVED_SLUGS.has(shape.slug)) {
    return {
      ok: false,
      reason: "This name is reserved on this site — pick another handle (your brand name can stay as it is)",
    };
  }
  return shape;
}

/// Turn a display name into a candidate slug (used by the creator to prefill the field).
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32)
    .replace(/-$/, "");
}

// ---------------------------------------------------------------------------------------------
//                                          DOMAINS
// ---------------------------------------------------------------------------------------------

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .refine((v) => DOMAIN_RE.test(v), { message: "Not a valid domain name" })
  .refine((v) => !v.endsWith(".localhost") && v !== "localhost", { message: "Not a routable domain" });

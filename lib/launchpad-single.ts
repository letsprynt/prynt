import { launchpadConfigSchema, checkSlugShape } from "./launchpad-schema";
import type { LaunchpadConfig } from "./launchpad-config";
import type { ZodIssue } from "zod";

// ---------------------------------------------------------------------------------------------
//                                    SINGLE-TENANT MODE
// ---------------------------------------------------------------------------------------------
//
// The product is not only a hosted multi-tenant SaaS. An operator takes this app, deploys it to
// THEIR OWN Vercel account, and it serves ONE launchpad — theirs — on every hostname it answers on.
//
// That deployment has no `launchpads` table, no session cookie from our auth, no subdomain of our
// apex and no row anyone could PATCH. So it cannot resolve a tenant; it has to BE one. This module
// is where that one launchpad comes from: a single environment variable holding the whole config.
//
//   LAUNCHPAD_CONFIG = base64url( JSON.stringify(config) )
//
// WHY ONE OPAQUE VARIABLE AND NOT ~59 READABLE ONES. launchpad-config.ts:7-10 makes every one of the
// 38 theme tokens required on purpose, and seoSchema requires 8 more fields with no defaults. A flat
// variable set is therefore 59 paste operations in which 58 correct ones plus a single typo'd hex
// still yield a dead deployment — and the only "forgiving" alternative (merge what is present over
// DEFAULT_CONFIG) is exactly the half-applied theme the required-ness exists to prevent, and would
// silently serve prynt's brand on the operator's own domain. One atomic value cannot be partially
// wrong. The designer at /create-launchpad is the editor; the operator's loop is regenerate → paste
// → redeploy, never hand-editing #RRGGBB in a hosting dashboard where no validator can reach them.
//
// WHY BASE64URL AND NOT RAW JSON. Raw JSON survives the Vercel textarea but not a `.env` file
// (newlines) nor a shell `export` (quotes and braces). base64url is one unbroken token with no
// shell-significant characters, and a truncated copy/paste always fails the decode instead of
// sometimes parsing into a half-config. Raw JSON is still ACCEPTED here (see decode()) because it is
// useful when debugging locally — but the generated value, and everything documented in
// docs/SELF_HOSTING.md, is base64url.
//
// FAILURE IS LOUD, AT IMPORT, ALWAYS. If the variable is present but does not decode, parse or
// validate, this module throws while it is being imported. Every server render imports
// launchpad-server.ts, which imports this, so the whole deployment answers 500 on every route with
// the reason in the log. The tempting alternative — fall back to DEFAULT_CONFIG — is disqualified:
// it would put prynt's title, keywords, palette and a schema.org Organization pointing at prynt's
// DefiLlama page (launchpad-config.ts:212) onto the operator's domain. That is brand impersonation
// dressed up as graceful degradation. A broken build is recoverable; a live impersonation is not.
//
// THE ERROR TEXT IS PART OF THE PRODUCT. The person reading it is a memecoin operator staring at a
// Vercel build log with no way to reach us. "Invalid config" is useless. Every message below names
// the exact field, shows what was found, and says what a valid value looks like.

/// Server-only. `NEXT_PUBLIC_LAUNCHPAD_CONFIG` is accepted as an alias so a deployment that sets
/// only the public mirror still boots into single-tenant mode.
///
/// THIS MODULE IS NOT THE CLIENT'S READER. It imports the zod schema and throws at import, so it is
/// never pulled into a client bundle. The one client surface that needs the brand before any server
/// round trip — the WalletConnect modal's name/description/accent — decodes the public mirror
/// itself, with its own tiny fail-soft parser: see lib/wagmi.ts. Setting the mirror is OPTIONAL and
/// changes exactly that one thing.
const RAW = process.env.LAUNCHPAD_CONFIG ?? process.env.NEXT_PUBLIC_LAUNCHPAD_CONFIG;

const VAR_NAME =
  process.env.LAUNCHPAD_CONFIG !== undefined ? "LAUNCHPAD_CONFIG" : "NEXT_PUBLIC_LAUNCHPAD_CONFIG";

// ---------------------------------------------------------------------------------------------
//                                          DECODING
// ---------------------------------------------------------------------------------------------

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LaunchpadConfigError";
  }
}

function fail(body: string): never {
  throw new ConfigError(
    `\n\n${"=".repeat(78)}\n` +
      `${VAR_NAME} is set, but this deployment cannot start with it.\n` +
      `${"=".repeat(78)}\n\n` +
      `${body}\n\n` +
      `Generate a fresh value with the launchpad designer, then replace the whole\n` +
      `${VAR_NAME} value in your hosting dashboard and redeploy.\n` +
      `Step-by-step instructions: docs/SELF_HOSTING.md\n` +
      `${"=".repeat(78)}\n`,
  );
}

/// base64url -> UTF-8. Deliberately hand-rolled over `atob`/`Buffer` compatibility rather than
/// picking one, so this module works unchanged on the node runtime, the edge runtime and in a
/// client bundle. No new dependency, and nothing here can throw except by our own hand.
function fromBase64Url(v: string): string | null {
  const b64 = v.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  try {
    if (typeof atob === "function") {
      const bin = atob(padded);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    // Node without atob (older runtimes).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const B = (globalThis as any).Buffer;
    if (B) return B.from(padded, "base64").toString("utf8");
    return null;
  } catch {
    return null;
  }
}

function decode(raw: string): unknown {
  let v = raw.trim().replace(/^["']|["']$/g, "");

  // The designer's copy button hands over the bare value, but the .env file it also offers is a
  // `NAME=value` line — and Vercel's "Edit variable" box takes the VALUE only. Someone who copies a
  // whole line into it saves "LAUNCHPAD_CONFIG=eyJ…". That is unambiguous and recoverable, so it is
  // repaired rather than turned into a deploy failure whose message would be about the wrong thing.
  const named = v.match(/^(?:NEXT_PUBLIC_)?LAUNCHPAD_CONFIG\s*=\s*(.*)$/s);
  if (named) v = named[1].trim().replace(/^["']|["']$/g, "");

  if (!v) {
    fail(
      `The variable is empty.\n\n` +
        `Either paste your launchpad config into it, or delete the variable entirely —\n` +
        `deleting it puts this deployment back into normal multi-tenant mode.`,
    );
  }

  // Convenience path: someone pasted the JSON itself. Documented as unsupported, accepted anyway,
  // because failing on it would be pedantry — the validator behind this is identical either way.
  if (v.startsWith("{")) {
    try {
      return JSON.parse(v);
    } catch {
      fail(
        `The value starts with "{", so it looks like raw JSON — but it is not complete,\n` +
          `valid JSON. This usually means the paste was cut short, or a newline in the\n` +
          `value confused the hosting dashboard.\n\n` +
          `Use the base64 value the designer gives you instead: it is one long unbroken\n` +
          `line with no quotes, braces or spaces, so nothing can mangle it in transit.`,
      );
    }
  }

  if (!/^[A-Za-z0-9_-]+=*$/.test(v)) {
    // Strip only what a valid value may contain, so "=" in the middle (a pasted `NAME=value` that
    // was not in the shape repaired above) is REPORTED rather than silently cancelling out and
    // printing an empty list of offending characters.
    const bad = [...new Set(v.replace(/[A-Za-z0-9_-]/g, "").split(""))].slice(0, 6);
    fail(
      `The value contains characters that cannot be part of a launchpad config:\n` +
        `  ${bad.length ? bad.map((c) => JSON.stringify(c)).join("  ") : "(a stray “=” inside the value)"}\n\n` +
        `A valid value is ONE unbroken line of letters, digits, "-" and "_" and nothing\n` +
        `else — no spaces, no quotes, no line breaks. If you pasted it into a text editor\n` +
        `first, the editor probably wrapped it onto several lines. Copy it again straight\n` +
        `from the designer and paste it directly into the environment-variable field.`,
    );
  }

  const json = fromBase64Url(v);
  if (json === null) {
    fail(
      `The value could not be decoded (it is ${v.length} characters long).\n\n` +
        `Almost always this means only part of it was copied. Select the entire value —\n` +
        `use the designer's "Copy" button rather than dragging across the text.`,
    );
  }

  try {
    return JSON.parse(json);
  } catch {
    fail(
      `The value decoded, but what came out is not a complete launchpad config.\n` +
        `It is ${json.length} characters and ends with:\n` +
        `  …${JSON.stringify(json.slice(-40))}\n\n` +
        `A complete config ends with "}". This one does not, so the value was cut short —\n` +
        `some hosting dashboards silently truncate very long values. Copy it again and\n` +
        `check the saved value is the same length as the one you copied.`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
//                                   HUMAN-READABLE VALIDATION
// ---------------------------------------------------------------------------------------------

const COLOUR_HELP =
  'a colour — "#1B7A4E", "#fff", or "rgba(27, 122, 78, 0.08)". ' +
  "Named colours, var(), color-mix() and oklch() are not accepted";
const LENGTH_HELP = 'a length WITH a unit — "12px", "0.5rem", "999px". A bare "0" is not accepted';
const URL_HELP = 'a web address starting with "https://", or a path starting with "/" such as "/logo.png"';
/// seo.siteUrl is the one URL that may NOT be a bare path: app/layout.tsx feeds it to `new URL()`
/// for metadataBase, and robots.ts uses it as the Host line.
const SITE_URL_HELP = 'your launchpad\'s full address, such as "https://moonshot.vercel.app"';
const SHADOW_HELP = 'a shadow — "0 6px 20px rgba(0, 0, 0, .08)"';
const GRADIENT_HELP = 'a gradient or flat colour — "linear-gradient(135deg, #1B7A4E, #114A30)"';
const FONT_HELP =
  'a font list — \'"Satoshi", system-ui, sans-serif\'. It may not contain "(" , so a ' +
  "Google Fonts url() cannot go here";

/// What a valid value for this field looks like, in the operator's language. Keyed off the field
/// path rather than off zod internals so it cannot break when zod changes shape.
function helpFor(path: (string | number)[]): string {
  const [head, leaf] = [String(path[0] ?? ""), String(path[path.length - 1] ?? "")];

  if (head === "theme") {
    if (/^radius/.test(leaf)) return LENGTH_HELP;
    if (leaf === "fontSans") return FONT_HELP;
    if (leaf === "grad") return GRADIENT_HELP;
    if (leaf === "glow" || leaf === "ring" || leaf === "ringHover" || /^shadow/.test(leaf)) return SHADOW_HELP;
    return COLOUR_HELP;
  }
  if (head === "links") return URL_HELP;
  if (/Url$/.test(leaf)) return URL_HELP;
  if (head === "seo") {
    if (leaf === "siteUrl") return SITE_URL_HELP;
    if (/^og(Accent|Background|Text)/.test(leaf)) return COLOUR_HELP;
    if (leaf === "keywords") return "a list of short phrases, at most 20 of them";
    if (leaf === "twitterHandle") return 'an X handle such as "@yourname"';
    return "a line of plain text";
  }
  if (head === "features") return "true or false";
  if (head === "domains") return "a list of hostnames (ignored in single-launchpad mode)";
  if (leaf === "slug") return 'a short lowercase id such as "moonshot" — letters, digits and dashes';
  if (leaf === "tld") return 'the bit after your name, such as ".fun" — it is wordmark, not a real domain';
  return "a line of plain text";
}

/// Top-level keys whose value is an object, so "the whole X section is missing" is the true
/// sentence rather than "X is missing".
const SECTIONS = new Set(["theme", "seo", "links", "features", "domains"]);

function valueAt(root: unknown, path: (string | number)[]): unknown {
  let cur: unknown = root;
  for (const k of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

function show(v: unknown): string {
  if (typeof v === "string") return v.length > 60 ? JSON.stringify(v.slice(0, 60) + "…") : JSON.stringify(v);
  if (v === undefined) return "nothing";
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

function describe(issue: ZodIssue, root: unknown): string {
  const path = issue.path;
  const name = path.length ? path.join(".") : "the config";
  const found = valueAt(root, path);

  // A whole section missing reads very differently from one bad token, so say so plainly.
  if (found === undefined) {
    if (path.length === 1 && SECTIONS.has(name)) {
      return `the whole "${name}" section is missing. A config produced by the designer always has one — this value was assembled or edited by hand.`;
    }
    return `${name} is missing. It must be ${helpFor(path)}.`;
  }

  return `${name} is ${show(found)}, which is not valid. It must be ${helpFor(path)}.`;
}

// ---------------------------------------------------------------------------------------------
//                                        SITE ADDRESS
// ---------------------------------------------------------------------------------------------

/// The ONE field an operator cannot know when they generate the config: they only learn their URL
/// after the first deploy. It drives metadataBase (app/layout.tsx), og:url, the canonical tag,
/// robots.txt's Host + Sitemap lines and every sitemap entry — so a stale value here quietly points
/// the operator's entire SEO surface at somebody else's site.
///
/// Precedence: NEXT_PUBLIC_SITE_URL > the config's own seo.siteUrl > VERCEL_PROJECT_PRODUCTION_URL.
///
/// VERCEL_PROJECT_PRODUCTION_URL RANKS LAST, and that ordering is the whole point. Vercel sets it on
/// every deployment without the operator doing anything, so ranking it above the config would
/// discard the address the designer REQUIRES them to type — silently, on the exact host this product
/// targets, and across metadataBase, og:url, the canonical tag, robots.txt and every sitemap entry.
/// A value the operator chose beats one the platform injected; the injected one is a fallback for
/// the config that never carried a real address.
///
/// NEVER the request's Host header. Host is attacker-controlled; deriving the canonical tag, the OG
/// url and robots.txt from it turns one crafted request into poisoned canonical/OG/robots output.
function resolveSiteUrl(fromConfig: string): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    const url = normaliseSiteUrl(explicit, "NEXT_PUBLIC_SITE_URL");
    // One line in the deploy log rather than a silent discard: an operator who moved to a custom
    // domain and forgot to update one of the two has something to search for.
    if (fromConfig.trim().replace(/\/+$/, "") !== url) {
      console.info(
        `[launchpad] site address: using NEXT_PUBLIC_SITE_URL (${url}) instead of the ${JSON.stringify(
          fromConfig,
        )} baked into ${VAR_NAME}.`,
      );
    }
    return url;
  }

  if (fromConfig.trim()) return normaliseSiteUrl(fromConfig, `${VAR_NAME} (seo.siteUrl)`);

  // Nothing chosen anywhere: fall back to Vercel's own production hostname (bare, no scheme).
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return normaliseSiteUrl(fromConfig, `${VAR_NAME} (seo.siteUrl)`);
}

function normaliseSiteUrl(v: string, where: string): string {
  const trimmed = v.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    fail(
      `Your site address is "${v}", which is not a complete web address.\n\n` +
        `It came from: ${where}\n\n` +
        `It must start with https:// and include the hostname, for example:\n` +
        `  https://moonshot.vercel.app\n` +
        `  https://moonshot.fun\n\n` +
        `This one value decides the address your launchpad tells Google, X and\n` +
        `Telegram it lives at, so it has to be the real one. If you do not know it\n` +
        `yet, deploy once, copy the address Vercel gives you, then set it as the\n` +
        `NEXT_PUBLIC_SITE_URL environment variable and redeploy.`,
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    fail(`Your site address is "${v}" (from ${where}). It must start with https://`);
  }
  return trimmed;
}

// ---------------------------------------------------------------------------------------------
//                                          THE LOAD
// ---------------------------------------------------------------------------------------------

function load(): LaunchpadConfig | null {
  if (RAW === undefined) return null;

  const raw = decode(RAW);

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    fail(
      `The value decoded, but it is ${Array.isArray(raw) ? "a list" : typeof raw}, not a launchpad config.\n` +
        `Make sure you copied the config value and not something else.`,
    );
  }

  const parsed = launchpadConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    const shown = issues.slice(0, 12);
    const lines = shown.map((i, n) => `  ${n + 1}. ${describe(i, raw)}`).join("\n");
    fail(
      `${issues.length === 1 ? "One value in it is" : `${issues.length} values in it are`} not valid:\n\n` +
        lines +
        (issues.length > shown.length ? `\n  …and ${issues.length - shown.length} more.` : ""),
    );
  }

  const cfg = parsed.data as LaunchpadConfig;

  // launchpadConfigSchema validates `slug` as a bare string — historically harmless, because an API
  // route always ran checkSlug first. In single-tenant mode there is no route in front of the
  // schema, and this field is not cosmetic: app/api/upload/route.ts stamps it into the metadata
  // pinned to IPFS for every coin launched here, permanently. So it is checked here instead.
  //
  // SHAPE ONLY, deliberately. The other half of checkSlug is RESERVED_SLUGS, which protects the
  // platform's own `*.prynt.fun` subdomain namespace — a namespace this deployment does not have.
  // Rejecting an operator whose brand slugifies to "safe", "trust" or "official" would be refusing
  // to boot over a collision that cannot happen on their hosting.
  const slug = checkSlugShape(cfg.slug ?? "");
  if (!slug.ok) {
    fail(
      `slug is ${show(cfg.slug)}, which cannot be used: ${slug.reason}.\n\n` +
        `Your slug is stamped permanently into the public record of every coin launched\n` +
        `on your launchpad, so it has to be a real, plain identifier — lowercase letters,\n` +
        `digits and dashes, 3 to 32 characters, for example "moonshot".`,
    );
  }

  return {
    ...cfg,
    slug: slug.slug,
    seo: { ...cfg.seo, siteUrl: resolveSiteUrl(cfg.seo.siteUrl) },
  };
}

/// The one launchpad this deployment serves, or `null` when the app is in its normal multi-tenant
/// mode. Parsed and validated exactly once, at import — so nothing downstream has to handle a
/// failure, and no request can be the first to discover the config is broken.
export const SINGLE_TENANT_CONFIG: LaunchpadConfig | null = load();

/// True when this deployment belongs to one operator and serves one launchpad on every hostname.
///
/// Route handlers and pages that only make sense on the platform — the launchpad designer's write
/// endpoints, the owner dashboard, our wallet-auth session routes — must answer 404 when this is
/// true. Leaving them reachable is worse than removing them: with no database behind it the
/// designer reports every name available, asks a stranger for a wallet signature and then 503s,
/// under the operator's brand; and /api/launchpads/resolve would serve prynt's entire config as
/// public, cacheable JSON from the operator's own origin.
export function isSingleTenant(): boolean {
  return SINGLE_TENANT_CONFIG !== null;
}

/// The route-handler half of the rule above, so a guard is one line and cannot be written wrong:
///
///     const gate = singleTenantNotFound();
///     if (gate) return gate;
///
/// Plain `Response`, not `NextResponse`, so this module keeps its "imports nothing" property and
/// stays usable from the node runtime, the edge runtime and a client bundle alike. Pages use
/// `notFound()` from next/navigation instead — same outcome, rendered as the app's 404.
export function singleTenantNotFound(): Response | null {
  if (SINGLE_TENANT_CONFIG === null) return null;
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

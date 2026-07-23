// Multi-tenant launchpad configuration. One deployment serves many launchpads; everything that
// differs between them (brand, palette, copy, SEO, feature switches) lives here and nowhere else.
//
// prynt.fun is DEFAULT_CONFIG and must keep rendering byte-identically to the single-tenant build,
// so every theme value below is transcribed 1:1 from the `:root` block in app/globals.css.

/// Visual tokens only. Every field is required on purpose: adding a token to the interface must
/// break the build for any tenant that forgot it, rather than silently falling back to prynt's
/// emerald. Layout/geometry tokens (--sp-*, --t, --lift, --sidebar-w) are NOT here — they are
/// structural, identical for all tenants, and stay hard-coded in globals.css.
export interface LaunchpadTheme {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  borderSoft: string;
  accent: string;
  accentHover: string;
  accentDeep: string;
  accentSoft: string;
  accentLine: string;
  ink: string;
  hot: string;
  up: string;
  down: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  grad: string;
  glow: string;
  fontSans: string;
  radiusXs: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  radiusCard: string;
  radiusPill: string;
  ring: string;
  ringHover: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  /// Chrome + interactive greys. Separate from `surface`/`surface2` because the sidebar and the
  /// translucent bars are their own brand ground, and a tenant may want them to differ from cards.
  chrome: string;
  chromeBar: string;
  hover: string;
  track: string;
  control: string;
  dividerStrong: string;
  overlay: string;
}

export interface LaunchpadSeo {
  title: string;
  description: string;
  /// The homepage carries its own longer, keyword-bearing <meta name="description"> — the visible
  /// page is a bare app grid, so this string is the only prose Google gets for the root URL.
  /// Optional: tenants that don't set it fall back to `description`.
  homeDescription?: string;
  /// The platform apex moves its coin board from "/" to "/board" and gives "/" new B2B copy. These
  /// two fields carry the board's ORIGINAL, already-indexed title and description across with it, so
  /// the landing and the board never compete for the same query. Fall back to title/homeDescription.
  boardTitle?: string;
  boardDescription?: string;
  /// Social cards carry a shorter, punchier line than the <meta name="description"> — a long
  /// description gets truncated mid-sentence in the X/Telegram preview. Falls back to `description`.
  ogDescription?: string;
  /// schema.org WebSite.description. Written for the crawler ("what is this site"), which is a
  /// different job from the meta description ("why click this result"). Falls back to `description`.
  siteDescription?: string;
  /// schema.org Organization.logo — the square brand mark for Google's knowledge panel, which is
  /// NOT the same asset as the visual `logoUrl` used in the sidebar. Falls back to /icon.png.
  organizationLogoUrl?: string;
  siteUrl: string;
  keywords: string[];
  twitterHandle?: string;
  // OG cards are rendered at the edge from code, so they need flat colour values that do not
  // depend on CSS custom properties being present.
  ogAccent: string;
  ogBackground: string;
  ogTextPrimary: string;
  ogTextSecondary: string;
  ogTagline: string;
}

export interface LaunchpadLinks {
  twitter?: string;
  telegram?: string;
  docs?: string;
  /// Public listing pages the tenant genuinely owns. Emitted as schema.org `sameAs`, so claiming a
  /// page a tenant does not own would be a lie to the crawler — leave undefined unless it is real.
  defillama?: string;
}

export interface LaunchpadFeatures {
  showKingOfHill: boolean;
  showLeaderboard: boolean;
  showWhitepaper: boolean;
  networkFeed: boolean;
}

export interface LaunchpadConfig {
  slug: string;
  domains: string[];
  name: string;
  tld: string;
  tagline: string;
  logoUrl: string;
  kothBgUrl: string;
  faviconUrl?: string;
  theme: LaunchpadTheme;
  seo: LaunchpadSeo;
  links: LaunchpadLinks;
  ownerAddress?: `0x${string}`;
  treasuryAddress?: `0x${string}`;
  features: LaunchpadFeatures;
}

// Satoshi first, then the platform stack. `var(--font-body)` is deliberately absent: it used to be
// fed by next/font (Inter) from layout.tsx, and a font-family list containing an undefined custom
// property is invalid — the browser drops the whole declaration and the app loses its typeface.
const FONT_STACK =
  "'Satoshi', -apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", Inter, system-ui, sans-serif";

const PRYNT_THEME: LaunchpadTheme = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  surface2: "#F6F7F8",
  border: "#ECECEE",
  borderSoft: "rgba(0, 0, 0, 0.05)",
  accent: "#1B7A4E",
  accentHover: "#156040",
  accentDeep: "#114A30",
  accentSoft: "rgba(27, 122, 78, 0.08)",
  accentLine: "rgba(27, 122, 78, 0.22)",
  ink: "#FFFFFF",
  hot: "#A35D00",
  up: "#1B7A4E",
  down: "#C0392B",
  text: "#1D1D1F",
  textMuted: "#6E6E73",
  textSubtle: "#9A9AA0",
  grad: "linear-gradient(135deg, #1B7A4E, #114A30)",
  glow: "0 8px 24px rgba(0, 0, 0, .10)",
  fontSans: FONT_STACK,
  radiusXs: "8px",
  radiusSm: "12px",
  radiusMd: "12px",
  radiusLg: "18px",
  radiusCard: "14px",
  radiusPill: "999px",
  ring: "0 0 0 1px #E8E8EB",
  ringHover: "0 0 0 1px #DCDCE1",
  shadowSm: "0 1px 2px rgba(0, 0, 0, .05)",
  shadowMd: "0 6px 20px rgba(0, 0, 0, .08)",
  shadowLg: "0 24px 60px rgba(0, 0, 0, .14)",
  chrome: "#FAFAFA",
  chromeBar: "rgba(255, 255, 255, 0.82)",
  hover: "#EDEEF0",
  track: "#E9EAEC",
  control: "#D3D3D8",
  dividerStrong: "#D8D8DC",
  overlay: "rgba(29, 29, 31, 0.28)",
};

export const DEFAULT_CONFIG: LaunchpadConfig = {
  slug: "prynt",
  domains: ["prynt.fun", "www.prynt.fun"],
  name: "prynt",
  tld: ".fun",
  tagline: "Launch a coin in seconds. Trade it the moment it exists.",
  logoUrl: "/pryntlogo-nobg.png",
  kothBgUrl: "/koth-bg.jpg",
  theme: PRYNT_THEME,
  seo: {
    title: "prynt.fun — meme coin launchpad on Robinhood Chain",
    description:
      "Launch a coin in seconds on a fair bonding curve — auto-graduates to Uniswap, 100% of the liquidity burned forever.",
    homeDescription:
      "Launch a meme coin in seconds on Robinhood Chain. Fair bonding curve — no presale, no team allocation — 1% trade fee split 50/50 with creators, auto-graduation to Uniswap with 100% of the liquidity burned.",
    // Transcribed character-for-character from `title` / `homeDescription` above: these are the
    // strings the root URL is currently ranked on, and they follow the board to /board unchanged.
    boardTitle: "prynt.fun — meme coin launchpad on Robinhood Chain",
    boardDescription:
      "Launch a meme coin in seconds on Robinhood Chain. Fair bonding curve — no presale, no team allocation — 1% trade fee split 50/50 with creators, auto-graduation to Uniswap with 100% of the liquidity burned.",
    ogDescription:
      "Launch a meme coin in seconds on a fair bonding curve. Auto-graduates to Uniswap, liquidity burned forever.",
    siteDescription:
      "Meme coin launchpad on Robinhood Chain — launch a coin in seconds on a fair bonding curve, auto-graduation to Uniswap, 100% of the liquidity burned.",
    organizationLogoUrl: "/icon.png",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://prynt.fun",
    keywords: [
      "meme coin launchpad",
      "Robinhood Chain",
      "launch a meme coin",
      "bonding curve",
      "pump.fun alternative",
      "memecoin",
      "fair launch",
      "Uniswap graduation",
      "crypto launchpad",
    ],
    // The shipped OG cards still carry the pre-redesign neon palette (#D6FF01 on #050506), which no
    // longer matches anything on the site. These values realign the card with the current light theme.
    ogAccent: PRYNT_THEME.accent,
    ogBackground: "#FFFFFF",
    ogTextPrimary: "#1D1D1F",
    ogTextSecondary: "#6E6E73",
    ogTagline: "fair launch · liquidity burned · creators earn 0.5%",
  },
  links: { defillama: "https://defillama.com/protocol/prynt" },
  features: {
    showKingOfHill: true,
    showLeaderboard: true,
    showWhitepaper: true,
    networkFeed: true,
  },
};

/// Demo tenant A — dark canvas, indigo accent. Exists to prove the theme layer actually drives the
/// whole UI: if any hard-coded colour survives in a component, it screams on this tenant.
export const DEMO_TENANT_A: LaunchpadConfig = {
  slug: "demo-a",
  domains: ["demo-a.localhost"],
  name: "nocturne",
  tld: ".xyz",
  tagline: "Launch after dark. Trade before sunrise.",
  logoUrl: "/pryntlogo-nobg.png",
  kothBgUrl: "/koth-bg.jpg",
  theme: {
    bg: "#0B0B10",
    surface: "#14141C",
    surface2: "#1C1C26",
    border: "#2A2A36",
    borderSoft: "rgba(255, 255, 255, 0.06)",
    accent: "#7C5CFF",
    accentHover: "#6A48F0",
    accentDeep: "#4B2FC7",
    accentSoft: "rgba(124, 92, 255, 0.14)",
    accentLine: "rgba(124, 92, 255, 0.32)",
    ink: "#FFFFFF",
    hot: "#F2A33C",
    up: "#3DD68C",
    down: "#FF6B6B",
    text: "#F2F2F7",
    textMuted: "#A0A0B0",
    textSubtle: "#6E6E80",
    grad: "linear-gradient(135deg, #7C5CFF, #4B2FC7)",
    glow: "0 8px 28px rgba(124, 92, 255, .28)",
    fontSans: FONT_STACK,
    radiusXs: "10px",
    radiusSm: "14px",
    radiusMd: "14px",
    radiusLg: "22px",
    radiusCard: "18px",
    radiusPill: "999px",
    ring: "0 0 0 1px #2A2A36",
    ringHover: "0 0 0 1px #3A3A4A",
    shadowSm: "0 1px 2px rgba(0, 0, 0, .40)",
    shadowMd: "0 6px 20px rgba(0, 0, 0, .50)",
    shadowLg: "0 24px 60px rgba(0, 0, 0, .65)",
    chrome: "#101018",
    chromeBar: "rgba(11, 11, 16, 0.82)",
    hover: "#1C1C26",
    track: "#23232E",
    control: "#31313E",
    dividerStrong: "#2A2A36",
    overlay: "rgba(0, 0, 0, 0.55)",
  },
  seo: {
    title: "nocturne.xyz — meme coin launchpad on Robinhood Chain",
    description: "A dark-mode fair-launch memecoin platform. Bonding curve in, Uniswap out, liquidity burned.",
    siteUrl: "https://demo-a.localhost",
    keywords: ["meme coin launchpad", "Robinhood Chain", "bonding curve", "fair launch"],
    ogAccent: "#7C5CFF",
    ogBackground: "#0B0B10",
    ogTextPrimary: "#F2F2F7",
    ogTextSecondary: "#A0A0B0",
    ogTagline: "fair launch · liquidity burned · creators earn 0.5%",
  },
  links: {},
  features: {
    showKingOfHill: true,
    showLeaderboard: true,
    showWhitepaper: false, // the whitepaper is prynt-specific content
    networkFeed: true,
  },
};

/// Demo tenant B — light like prynt, but orange and squared off, so the two demos differ from each
/// other on both hue and geometry rather than only on light/dark.
export const DEMO_TENANT_B: LaunchpadConfig = {
  slug: "demo-b",
  domains: ["demo-b.localhost"],
  name: "ember",
  tld: ".market",
  tagline: "Every coin starts at zero. Some of them don't stay there.",
  logoUrl: "/pryntlogo-nobg.png",
  kothBgUrl: "/koth-bg.jpg",
  theme: {
    bg: "#FFFDFB",
    surface: "#FFFFFF",
    surface2: "#FFF3E8",
    border: "#F0E3D6",
    borderSoft: "rgba(0, 0, 0, 0.05)",
    accent: "#D2691E",
    accentHover: "#B45516",
    accentDeep: "#8C400F",
    accentSoft: "rgba(210, 105, 30, 0.10)",
    accentLine: "rgba(210, 105, 30, 0.26)",
    ink: "#FFFFFF",
    hot: "#C2410C",
    up: "#137A52",
    down: "#B91C1C",
    text: "#1A1613",
    textMuted: "#6B6259",
    textSubtle: "#9C9188",
    grad: "linear-gradient(135deg, #D2691E, #8C400F)",
    glow: "0 8px 24px rgba(140, 64, 15, .12)",
    fontSans: FONT_STACK,
    radiusXs: "2px",
    radiusSm: "3px",
    radiusMd: "3px",
    radiusLg: "4px",
    radiusCard: "4px",
    radiusPill: "4px",
    ring: "0 0 0 1px #EFE1D2",
    ringHover: "0 0 0 1px #E2CDB6",
    shadowSm: "0 1px 2px rgba(60, 30, 0, .06)",
    shadowMd: "0 6px 20px rgba(60, 30, 0, .10)",
    shadowLg: "0 24px 60px rgba(60, 30, 0, .16)",
    chrome: "#FFF7F0",
    chromeBar: "rgba(255, 253, 251, 0.85)",
    hover: "#F6EADF",
    track: "#EFE1D4",
    control: "#DCC8B5",
    dividerStrong: "#E6D6C6",
    overlay: "rgba(26, 22, 19, 0.30)",
  },
  seo: {
    title: "ember.market — meme coin launchpad on Robinhood Chain",
    description: "Fair-launch memecoins on a bonding curve. Auto-graduation to Uniswap, liquidity burned forever.",
    siteUrl: "https://demo-b.localhost",
    keywords: ["meme coin launchpad", "Robinhood Chain", "bonding curve", "fair launch"],
    ogAccent: "#D2691E",
    ogBackground: "#FFFDFB",
    ogTextPrimary: "#1A1613",
    ogTextSecondary: "#6B6259",
    ogTagline: "fair launch · liquidity burned · creators earn 0.5%",
  },
  links: {},
  features: {
    showKingOfHill: true,
    showLeaderboard: true,
    showWhitepaper: false,
    networkFeed: true,
  },
};

export const TENANTS: LaunchpadConfig[] = [DEFAULT_CONFIG, DEMO_TENANT_A, DEMO_TENANT_B];

// THE seam. When tenants move to a database/API, this is the only function that changes (it becomes
// a cached fetch); resolveConfig and every caller above it stay exactly as they are. Keep it
// synchronous-looking at the call site by caching upstream, not by leaking a promise into here.
function loadTenants(): LaunchpadConfig[] {
  return TENANTS;
}

/// Strip the port and casing so "Demo-A.localhost:3000" still matches "demo-a.localhost".
function normalizeHost(host: string): string {
  return host.trim().toLowerCase().split(":")[0];
}

/// Does this hostname belong to a tenant? Callers need to distinguish "the host itself claims a
/// brand" (prynt.fun) from "the host is anonymous" (localhost, a Vercel preview URL) — a sticky
/// preview choice may only override the latter. Returns null when nothing matches.
export function findByHost(host: string | null): LaunchpadConfig | null {
  if (!host) return null;
  const h = normalizeHost(host);
  return loadTenants().find((t) => t.domains.some((d) => normalizeHost(d) === h)) ?? null;
}

/// Resolve the tenant for a request. Precedence: explicit override (?tenant= / x-tenant header, used
/// for previewing a tenant on any host) beats the hostname, and an unknown value falls back to prynt
/// rather than 404-ing — a mis-typed tenant should degrade to the default site, never to an error.
export function resolveConfig(host: string | null, tenantOverride?: string | null): LaunchpadConfig {
  const slug = tenantOverride?.trim().toLowerCase();
  if (slug) {
    const bySlug = loadTenants().find((t) => t.slug === slug);
    if (bySlug) return bySlug;
  }

  return findByHost(host) ?? DEFAULT_CONFIG;
}

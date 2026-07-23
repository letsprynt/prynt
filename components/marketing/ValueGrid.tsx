import Link from "next/link";

// Showcase section: the three things a buyer actually owns after signing up. Every tile maps 1:1
// onto something that already ships in this repo, and every tile carries a proof link to the page
// where that thing can be seen working. Nothing aspirational goes in here — if a claim has no page
// to point at, it does not belong.
//
// The prose is deliberately short (<= 14 words per tile). The old version of this section was four
// identical cards each carrying a four-line grey paragraph, which is a spec sheet, not a product
// page. The MEANING now lives in a miniature of the real UI above each caption.
//
// The art is decoration: pure JSX + CSS, no images, no network, no client JS. Every art root is
// aria-hidden — the caption is the accessible content, the mock is not.

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// The fake board card in tile A is painted in a DIFFERENT accent from the page on purpose: the
// point of the tile is that the accent is the operator's choice, and an emerald mock inside an
// emerald page would look like a screenshot of prynt.fun instead.
//
// Colours are passed as an inline `--sw` custom property rather than being written into the
// stylesheet, because the design law forbids colour literals in .mk-* CSS. oklch() keeps them in
// the same perceptual space as the token palette, so they read as one family at a glance.
const SWATCHES = [
  "oklch(0.55 0.20 295)", // violet — the one the mock card is wearing
  "oklch(0.62 0.19 25)", // red
  "oklch(0.74 0.16 85)", // amber
  "oklch(0.60 0.13 205)", // teal
  "oklch(0.50 0.14 265)", // indigo
];

const CARD_ACCENT = SWATCHES[0];

/// Tile A art: a miniature board card wearing someone else's accent, over a row of theme chips.
function BrandArt() {
  return (
    <div className="mk-show-art" aria-hidden="true">
      <div className="mk-art-card" style={{ "--sw": CARD_ACCENT } as React.CSSProperties}>
        <div className="mk-art-thumb" />
        <div className="mk-art-bar mk-art-bar--name" />
        <div className="mk-art-bar mk-art-bar--ticker" />
        <div className="mk-art-track">
          <div className="mk-art-fill" />
        </div>
      </div>
      <div className="mk-art-swatches">
        {SWATCHES.map((sw, i) => (
          <span
            key={sw}
            className={i === 0 ? "mk-art-swatch mk-art-swatch--on" : "mk-art-swatch"}
            style={{ "--sw": sw } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

/// Tile B art: the two DNS records the dashboard prints, under the URL they end up serving.
/// The check sits on the TXT row because that is the record Verify actually reads.
function DomainArt() {
  return (
    <div className="mk-show-art" aria-hidden="true">
      <div className="mk-art-dns">
        <div className="mk-art-url">
          <svg className="mk-art-lock" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" {...stroke} />
            <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" {...stroke} />
          </svg>
          <span>yourbrand.com</span>
        </div>
        <div className="mk-art-row">
          <span className="mk-art-key">CNAME</span>
          <span className="mk-art-arrow">→</span>
          <span className="mk-art-val">cname.prynt.fun</span>
        </div>
        <div className="mk-art-row">
          <span className="mk-art-key">TXT</span>
          <span className="mk-art-arrow">→</span>
          <span className="mk-art-val">prynt-verify=…</span>
          <svg className="mk-art-check" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
            <path d="M4.5 12.5 9.5 17.5 19.5 7" {...stroke} strokeWidth={2.4} />
          </svg>
        </div>
      </div>
    </div>
  );
}

/// Tile C art: the bonding curve itself. The dashed line near the top is graduation; the area fill
/// is drawn with currentColor at low alpha so the CSS agent can recolour the whole graphic by
/// setting `color` on .mk-art-curve, without a single colour literal in the SVG.
function CurveArt() {
  return (
    <div className="mk-show-art" aria-hidden="true">
      <div className="mk-art-curve">
        <svg viewBox="0 0 200 100" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="mk-art-curve-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Same path as the stroke, closed along the baseline, so the fill can never drift off it. */}
          <path
            d="M2 96 C 44 92, 78 84, 106 64 C 132 46, 152 26, 198 14 L 198 100 L 2 100 Z"
            fill="url(#mk-art-curve-fill)"
            stroke="none"
          />
          <path
            d="M2 96 C 44 92, 78 84, 106 64 C 132 46, 152 26, 198 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M2 14 H198"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeDasharray="4 4"
            strokeOpacity="0.45"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="mk-art-chip">Graduated → Uniswap</span>
      </div>
    </div>
  );
}

type Tile = {
  variant: "a" | "b" | "c";
  art: React.ReactNode;
  title: string;
  body: string;
  href: string;
  cta: string;
};

const TILES: Tile[] = [
  {
    variant: "a",
    art: <BrandArt />,
    title: "Your brand, not ours",
    // Absorbs the deleted fourth card ("SEO and social cards that are yours"): per-launchpad title,
    // description, sitemap, robots and generated OG images. Naming the artefact is enough here —
    // the FAQ carries the detail — but the words must not vanish from the page entirely.
    body: "Name, logo, accent, theme — even the SEO and social cards.",
    href: "/create-launchpad",
    cta: "Themes",
  },
  {
    variant: "b",
    art: <DomainArt />,
    // Verification is a button in the dashboard, not a background job — "verifies by itself" would
    // be a promise the code does not keep.
    title: "Your own domain",
    body: "Free subdomain now. Your own domain: two DNS records, then Verify.",
    href: "/dashboard",
    cta: "Domain settings",
  },
  {
    variant: "c",
    art: <CurveArt />,
    // "on your launchpad" is deliberately absent: coins are not scoped to a launchpad. Nothing
    // on-chain records which front end a coin was created from, so every launchpad lists the same
    // coins. That fact is stated outright in the fees section and the FAQ.
    title: "The curve, already built",
    // Carries copy-law fact (c) — the LP burn — now that the fees section dropped its caption. It
    // must not be trimmed out of this string without moving it somewhere else visible.
    body: "One fair curve, no presale. It fills, liquidity moves to Uniswap, the LP burns.",
    href: "/how-it-works",
    cta: "See the curve",
  },
];

export function ValueGrid() {
  return (
    <section className="mk-show" aria-labelledby="mk-show-heading">
      <header className="mk-shead">
        <h2 id="mk-show-heading" className="mk-shead-title">
          Three things become yours
        </h2>
        <p className="mk-shead-lead">Everything else is already running.</p>
      </header>
      <div className="mk-show-grid">
        {TILES.map((t) => (
          // No per-tile modifier class. The three tints it used to select were two shades of the
          // same accent plus one grey, which made three instances of one component look like three
          // unrelated cards; the single --mk-tint now lives on .mk-show-tile itself.
          <article key={t.variant} className="mk-show-tile">
            {t.art}
            <h3 className="mk-show-title">{t.title}</h3>
            <p className="mk-show-body">{t.body}</p>
            <Link href={t.href} className="mk-show-link">
              {t.cta}
              <span aria-hidden="true">→</span>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

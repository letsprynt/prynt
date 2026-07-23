import Link from "next/link";
import type { TokenSummary } from "@/lib/api";
import { imgSrc } from "@/lib/img";

// Section 1 of the platform landing: one claim, two buttons, then the product frame at full measure.
//
// Why this file re-declares the indexer base URL and does its own fetch instead of calling
// fetchTokens() from "@/lib/api": that module carries the "use client" directive, so every one of
// its runtime exports becomes a client reference — calling it during a server render throws. The
// same workaround is already used by app/sitemap.ts and the opengraph-image routes. Only the TYPE
// is imported here, and types are erased at compile time, so that import is safe.
const INDEXER = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:42069";

// 6, not 9: .mk-frame is clipped at min(760px, 78vh), so at the full measure the third row of a 3x3
// never rendered above the fold anyway — it only added coin labels to the page's word budget.
// Ten tiles at five columns is two COMPLETE rows. The number is load-bearing: the frame used to
// carry a max-height that sliced the last row in half, which reads as a rendering bug rather than as
// a window. Sizing the tiles to the real board's card width (~194px vs the ~345px they had at three
// columns) makes the whole board fit uncut, so the clip could go.
const FRAME_SIZE = 10;

/// FAIL-OPEN by contract: the hero is the first thing a buyer sees, so an indexer outage must never
/// remove it or throw. On any failure this returns an empty list and the frame renders skeleton tiles.
async function loadFrameTokens(): Promise<TokenSummary[]> {
  try {
    const q = new URLSearchParams({ sort: "marketCap", order: "desc", limit: String(FRAME_SIZE) });
    const res = await fetch(`${INDEXER}/api/tokens?${q}`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = (await res.json()) as { tokens?: TokenSummary[] };
    return Array.isArray(json.tokens) ? json.tokens.slice(0, FRAME_SIZE) : [];
  } catch {
    return [];
  }
}

/// Deterministic money formatting. These strings are produced during a server render and shipped in
/// the RSC payload, so nothing locale-dependent (toLocaleString) may leak in — it would render
/// differently for a client that ever re-renders the tree, and it reads inconsistently across regions.
function compactUsd(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(a / 1e3).toFixed(1)}k`;
  if (a >= 0.01) return `$${a.toFixed(2)}`;
  return "<$0.01";
}

function compactEthAmount(eth: string | undefined): string {
  const x = Number(eth);
  if (!Number.isFinite(x) || x === 0) return "0 ETH";
  const a = Math.abs(x);
  if (a >= 1e3) return `${(a / 1e3).toFixed(2)}k ETH`;
  if (a >= 1) return `${a.toFixed(2)} ETH`;
  if (a >= 0.001) return `${a.toFixed(4)} ETH`;
  return `${a.toExponential(1)} ETH`;
}

function marketCapLabel(t: TokenSummary): string {
  return compactUsd(t.marketCapUsd) ?? compactEthAmount(t.marketCapEth);
}

function FrameTile({ t }: { t: TokenSummary }) {
  const src = t.nsfw ? null : imgSrc(t.imageUrl);
  const pct = Math.max(0, Math.min(100, Math.round(t.bondingProgressPct ?? 0)));
  return (
    // An anchor, not a div. The frame is a mock of a board, but the coins in it are real, so the
    // tiles link where their real counterparts link. This also carries the landing's internal links
    // into the indexed /token/* long tail — that job used to belong to the coin grid below, and this
    // is where those links live now that the grid is gone. Plain <a>, matching the deleted grid:
    // next/link's prefetch buys nothing on a marketing page and the anchor is all a crawler needs.
    <a className="mk-frame-tile" href={`/token/${t.curve}`}>
      <div className="mk-frame-thumb">
        {src ? (
          // Plain <img>: the component must stay server-rendered, and token art is arbitrary
          // remote/IPFS-proxied media that next/image would need per-host config for.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" decoding="async" />
        ) : (
          <span aria-hidden="true">{t.symbol?.slice(0, 3) || "?"}</span>
        )}
      </div>
      <div className="mk-frame-meta">
        <strong>{t.name}</strong>
        <span>{t.symbol}</span>
      </div>
      <div className="mk-frame-cap">{marketCapLabel(t)}</div>
      <div className="mk-frame-track" aria-hidden="true">
        <div className="mk-frame-fill" style={{ width: `${pct}%` }} />
      </div>
    </a>
  );
}

function SkeletonTile() {
  return (
    // No --empty modifier: nothing styles it. The skeleton's shape comes from .mk-frame-thumb's
    // aspect-ratio and the bar rows below, which match a real tile's height row for row.
    <div className="mk-frame-tile" aria-hidden="true">
      <div className="mk-frame-thumb" />
      <div className="mk-frame-meta">
        <span className="mk-frame-bar mk-frame-bar--wide" />
        <span className="mk-frame-bar" />
      </div>
      {/* Stands in for .mk-frame-cap. Without it a skeleton tile is ~26px shorter than a real one,
          so the frame changes height the moment the indexer recovers. */}
      <span className="mk-frame-bar" />
      <div className="mk-frame-track">
        <div className="mk-frame-fill" style={{ width: "0%" }} />
      </div>
    </div>
  );
}

export async function Hero() {
  const tokens = await loadFrameTokens();
  const tiles = tokens.length > 0 ? tokens.map((t) => <FrameTile key={t.curve} t={t} />) : Array.from({ length: FRAME_SIZE }, (_, i) => <SkeletonTile key={i} />);

  return (
    <>
      {/* One idea, centred. The previous hero stacked a headline, a four-line paragraph, two CTAs and
          a three-line disclaimer in one column — four messages competing for the same glance. The two
          facts that disclaimer carried are not lost: the shared-coin-market point is stated in full in
          the FAQ answer "Do the coins belong to my launchpad?", and the operator-earns-no-fees point is
          the pull quote in the fees section. */}
      <section className="mk-hero" aria-labelledby="mk-hero-h">
        <p className="mk-eyebrow">Launchpad as a product</p>
        {/* Exact-match target keyword, five words. Longer h1s wrapped to four lines and ranked no
            better. "audited" was removed deliberately and must not come back: README.md, SECURITY.md
            and /whitepaper all state the contracts are UNAUDITED with no third-party review. */}
        <h1 className="mk-hero-title" id="mk-hero-h">Launch your own memecoin launchpad</h1>
        <p className="mk-hero-sub">
          Your name, your domain, your colours — on contracts that already run prynt.fun.
        </p>
        <div className="mk-hero-cta">
          <Link href="/create-launchpad" className="mk-btn mk-btn-primary mk-btn-lg">
            Create your launchpad
          </Link>
          <Link href="/board" className="mk-btn mk-btn-ghost mk-btn-lg">
            See a live one
          </Link>
        </div>
        {/* Price on the first screen. This is the strongest fact the product owns and it used to be
            reachable only by opening a <details> ~5000px down the page. Kept to the two words the
            FAQ answer leads with; the full statement of copy-law fact (e) — gas and your own
            registrar are the only costs — stays in that answer, which is where the detail belongs. */}
        <p className="mk-hero-note">No setup fee, no subscription. You pay gas.</p>
      </section>

      {/* Product frame: a miniature of the board a buyer's own launchpad renders, filled with real
          indexed coins so the screenshot can never go stale or be accused of being a mockup. It sits
          outside .mk-hero so the stage can carry its own accent wash edge to edge under the copy. */}
      <div className="mk-hero-stage">
        {/* aria-hidden on the ROOT, not per child: the whole frame is a picture of a product, and
            reading its 30-odd words of coin data out loud straight after the h1 duplicates the real
            coin grid further down. The per-child aria-hidden attributes this replaced are gone. */}
        <div className="mk-frame" aria-hidden="true">
          <div className="mk-frame-chrome">
            <span className="mk-frame-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="mk-frame-url">yourbrand.prynt.fun</span>
          </div>
          <div className="mk-frame-body">
            <div className="mk-frame-pills">
              <span className="mk-frame-pill mk-frame-pill--on">Trending</span>
              <span className="mk-frame-pill">New</span>
              <span className="mk-frame-pill">Graduated</span>
            </div>
            <div className="mk-frame-grid">{tiles}</div>
          </div>
        </div>
      </div>
    </>
  );
}

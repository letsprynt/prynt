import { ImageResponse } from "next/og";
import { getServerConfig } from "@/lib/launchpad-server";
import { resolveConfig } from "@/lib/launchpad-config";

// Per-coin share card: when a coin link lands on X/Telegram/Discord it renders a branded 1200×630 card
// with the coin's image, ticker and live stats instead of a bare link. This is the viral loop — coin links
// are what people actually share. Falls back to the generic brand card if the indexer is unreachable.
// Node runtime, not edge: the tenant config now comes from Postgres and the driver is node-only.
// next/og's ImageResponse renders on both runtimes, so this costs nothing but a slightly slower
// cold start on a route that is cached hard anyway.
export const runtime = "nodejs";
// `alt` is a *static* module export — Next reads it outside of any request, so it cannot be
// per-tenant and falls back to the default launchpad. The image below is still per-request.
export const alt = `coin on ${resolveConfig(null).seo.title}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INDEXER = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:42069";

// Local, dependency-free hex helpers. Satori has no CSS custom properties and no colour functions,
// so transparency and the darker end of the monogram gradient have to be computed here. Non-hex
// input degrades gracefully instead of throwing, which would take the whole card down.
function hexToRgba(hex: string, alpha: number): string {
  const rgb = toRgb(hex);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : "rgba(0,0,0,0)";
}
function shade(hex: string, factor: number): string {
  const rgb = toRgb(hex);
  if (!rgb) return hex;
  const c = rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * factor))));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
function toRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

type TokenInfo = {
  name?: string;
  symbol?: string;
  imageUrl?: string;
  marketCapEth?: string;
  bondingProgress?: number;
  graduated?: boolean;
  tradeCount?: number;
};

export default async function TokenOgImage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const cfg = await getServerConfig();
  const { ogAccent: ACCENT, ogBackground: BG, ogTextPrimary, ogTextSecondary } = cfg.seo;

  let t: TokenInfo = {};
  try {
    const res = await fetch(`${INDEXER}/api/tokens/${(address ?? "").toLowerCase()}`, {
      next: { revalidate: 300 },
    });
    if (res.ok) t = ((await res.json()) as { token?: TokenInfo }).token ?? {};
  } catch {
    /* fall through to the generic card */
  }

  const symbol = (t.symbol ?? "").slice(0, 14);
  const name = (t.name ?? "").slice(0, 36);
  const progressRaw = Number(t.bondingProgress ?? 0);
  const progress = Math.max(0, Math.min(100, Math.round(progressRaw <= 1 ? progressRaw * 100 : progressRaw)));
  const mc = Number(t.marketCapEth ?? NaN);
  const mcLabel = Number.isFinite(mc) ? `${mc >= 10 ? mc.toFixed(1) : mc.toFixed(3)} ETH mcap` : null;
  const status = t.graduated ? "graduated to Uniswap ✦" : `${progress}% bonded`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          backgroundColor: BG,
          backgroundImage: `radial-gradient(circle at 24% 50%, ${hexToRgba(ACCENT, 0.14)}, ${hexToRgba(
            BG,
            0,
          )} 55%)`,
          color: ogTextPrimary,
          fontFamily: "sans-serif",
          padding: "0 84px",
        }}
      >
        {/* coin image / monogram */}
        {t.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={t.imageUrl}
            alt=""
            width={340}
            height={340}
            style={{ borderRadius: 42, objectFit: "cover", border: `6px solid ${ACCENT}` }}
          />
        ) : (
          <div
            style={{
              width: 340,
              height: 340,
              borderRadius: 42,
              // Deep end of the gradient is derived from the accent instead of a hard-coded olive,
              // so it stays on-brand for every tenant.
              background: `linear-gradient(135deg, ${ACCENT}, ${shade(ACCENT, 0.62)})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 160,
              fontWeight: 800,
              color: BG,
            }}
          >
            {(symbol || "?").slice(0, 1)}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", marginLeft: 72, flex: 1 }}>
          <div style={{ display: "flex", fontSize: 88, fontWeight: 800, letterSpacing: "-0.03em" }}>
            {symbol || `${cfg.name}${cfg.tld}`}
          </div>
          {name && name.toLowerCase() !== symbol.toLowerCase() && (
            <div style={{ display: "flex", fontSize: 40, color: ogTextSecondary, marginTop: 6 }}>{name}</div>
          )}
          <div style={{ display: "flex", gap: 26, marginTop: 34, fontSize: 30, color: ACCENT, fontWeight: 600 }}>
            <span>{status}</span>
            {mcLabel && <span style={{ color: ogTextSecondary }}>· {mcLabel}</span>}
          </div>
          {/* bonding progress bar */}
          <div
            style={{
              display: "flex",
              width: 560,
              height: 18,
              borderRadius: 9,
              // Track tinted from the secondary text colour: visible on a white canvas as well as
              // on a dark one, unlike the old fixed white-on-black wash.
              backgroundColor: hexToRgba(ogTextSecondary, 0.22),
              marginTop: 26,
            }}
          >
            <div
              style={{
                display: "flex",
                width: t.graduated ? 560 : Math.max(8, Math.round((progress / 100) * 560)),
                height: 18,
                borderRadius: 9,
                background: `linear-gradient(90deg, ${shade(ACCENT, 1.25)}, ${ACCENT})`,
              }}
            />
          </div>
          {/* Wordmark and tagline are stacked, not inlined: the tagline is tenant-supplied and can be
              any length, and a single row would run past the 620px the text column actually has. */}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>
              <span style={{ color: ogTextPrimary }}>{cfg.name}</span>
              <span style={{ color: ACCENT }}>{cfg.tld}</span>
            </div>
            <div style={{ display: "flex", maxWidth: 620, marginTop: 8, fontSize: 24, color: ogTextSecondary }}>
              {cfg.tagline}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

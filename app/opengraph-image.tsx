import { ImageResponse } from "next/og";
import { getServerConfig } from "@/lib/launchpad-server";
import { resolveConfig } from "@/lib/launchpad-config";

// Local, dependency-free hex → rgba(). Satori has no CSS custom properties and no colour functions,
// so any transparency has to be computed here. Non-hex input degrades to fully transparent rather
// than throwing, which would take the whole card down.
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "rgba(0,0,0,0)";
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Auto-wires og:image + twitter:image for the whole site (homepage + any route without its own override).
// Generated at the edge from code — no static asset needed — so a shared link renders a branded card.
// Node runtime, not edge: the tenant config now comes from Postgres and the driver is node-only.
// next/og's ImageResponse renders on both runtimes, so this costs nothing but a slightly slower
// cold start on a route that is cached hard anyway.
export const runtime = "nodejs";
// `alt` is a *static* module export: Next reads it when it builds the <meta> tag, outside of any
// request, so it cannot be per-tenant. It falls back to the default launchpad's title; the image
// itself below is still resolved per request.
export const alt = resolveConfig(null).seo.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const cfg = await getServerConfig();
  const { ogAccent, ogBackground, ogTextPrimary, ogTextSecondary, ogTagline } = cfg.seo;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: ogBackground,
          // Soft accent wash behind the wordmark. Kept low-alpha so it reads on light and dark
          // backgrounds alike instead of assuming the old near-black canvas.
          backgroundImage: `radial-gradient(circle at 50% 36%, ${hexToRgba(ogAccent, 0.16)}, ${hexToRgba(
            ogBackground,
            0,
          )} 62%)`,
          color: ogTextPrimary,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 132, fontWeight: 800, letterSpacing: "-0.04em" }}>
          <span>{cfg.name}</span>
          <span style={{ color: ogAccent }}>{cfg.tld}</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 42,
            marginTop: 22,
            color: ogTextPrimary,
            textAlign: "center",
            // Explicit max width, not padding: the tagline is tenant-supplied and Satori only wraps
            // text inside a constrained box.
            maxWidth: 1020,
          }}
        >
          {cfg.tagline}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 46,
            fontSize: 30,
            color: ogTextSecondary,
            letterSpacing: "0.02em",
          }}
        >
          {ogTagline}
        </div>
      </div>
    ),
    { ...size },
  );
}

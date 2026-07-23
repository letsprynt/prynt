import type { Metadata } from "next";
import { getServerConfig } from "@/lib/launchpad-server";
import { TokenPageClient } from "./TokenPageClient";

// Server wrapper whose only job is SEO: per-coin <title>/<meta>/OG straight from the indexer, so every
// coin page is its own Google result and renders a proper card (name + image) when shared on X/Telegram.
// The interactive page itself stays fully client-side in TokenPageClient.

const INDEXER = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:42069";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const addr = (address ?? "").toLowerCase();
  // Branding (site URL + display name) comes from the tenant config resolved from the request host.
  const cfg = await getServerConfig();
  const SITE = cfg.seo.siteUrl;
  const brand = `${cfg.name}${cfg.tld}`;
  const fallback: Metadata = {
    title: "Token",
    description: "Trade meme coins on a fair bonding curve — instant liquidity, 1% trade fee split with the creator, auto-graduation to Uniswap.",
  };
  try {
    const res = await fetch(`${INDEXER}/api/tokens/${addr}`, { next: { revalidate: 60 } });
    if (!res.ok) return fallback;
    const { token: t } = (await res.json()) as { token?: Record<string, unknown> };
    const name = String(t?.name ?? "").trim();
    const symbol = String(t?.symbol ?? "").trim();
    if (!symbol && !name) return fallback;

    const progressRaw = Number(t?.bondingProgress ?? 0);
    const progress = Math.round(progressRaw <= 1 ? progressRaw * 100 : progressRaw);
    const mcEth = Number(t?.marketCapEth ?? NaN);
    const bits = [
      t?.graduated ? "graduated to Uniswap" : `${progress}% bonded`,
      Number.isFinite(mcEth) ? `mcap ${mcEth >= 10 ? mcEth.toFixed(1) : mcEth.toFixed(3)} ETH` : null,
      `${Number(t?.tradeCount ?? 0)} trades`,
    ].filter(Boolean).join(" · ");

    const userDesc = String(t?.description ?? "").trim();
    const description = userDesc
      ? `${userDesc.slice(0, 140)}${userDesc.length > 140 ? "…" : ""} — ${bits} · trade ${symbol || name} on ${brand}`
      : `Trade ${symbol || name} on the ${brand} bonding curve — ${bits}. Instant liquidity, 1% fee split with the creator, LP burned on graduation.`;

    const title = symbol && name && symbol.toLowerCase() !== name.toLowerCase() ? `${symbol} — ${name}` : symbol || name;
    const url = `${SITE}/token/${addr}`;

    // og:image / twitter:image come from the sibling opengraph-image.tsx (file convention beats config),
    // which renders a branded 1200×630 card with the coin's image + live stats.
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        type: "website",
        siteName: brand,
        url,
        title: `${title} · ${brand}`,
        description,
      },
      twitter: {
        card: "summary_large_image",
        title: `${title} · ${brand}`,
        description,
      },
    };
  } catch {
    return fallback;
  }
}

export default async function TokenPage({ params }: Props) {
  const { address } = await params;
  const addr = (address ?? "").toLowerCase();
  const cfg = await getServerConfig();
  const SITE = cfg.seo.siteUrl;
  // BreadcrumbList → Google shows "prynt.fun › coins" instead of a bare URL in the result snippet.
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: `${cfg.name}${cfg.tld}`, item: SITE },
      { "@type": "ListItem", position: 2, name: "coins", item: `${SITE}/` },
      { "@type": "ListItem", position: 3, name: addr, item: `${SITE}/token/${addr}` },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
      <TokenPageClient address={address ?? ""} />
    </>
  );
}

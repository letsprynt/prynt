import type { MetadataRoute } from "next";
import { getServerContext } from "@/lib/launchpad-server";

// The indexer is shared infrastructure across tenants, so it stays an env var; only the public
// site origin is per-tenant.
const INDEXER = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:42069";

// The output depends on the request host (which tenant resolved), so it cannot be statically
// revalidated — ISR would freeze one tenant's sitemap and serve it to every other host.
export const dynamic = "force-dynamic";

// Emits the homepage + one URL per launched token (and its creator's profile) so crawlers index the long tail.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { config: cfg, isPlatform } = await getServerContext();
  const SITE = cfg.seo.siteUrl;
  const base: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: "always", priority: 1 },
    // On the platform host the coin board lives at /board; on a tenant host /board redirects to "/",
    // so listing it there would advertise a redirect as a canonical URL.
    ...(isPlatform
      ? ([{ url: `${SITE}/board`, changeFrequency: "always", priority: 0.9 }] as MetadataRoute.Sitemap)
      : []),
    { url: `${SITE}/how-it-works`, changeFrequency: "monthly", priority: 0.6 },
    // The whitepaper is protocol-spec content only some tenants serve — list it only for those.
    ...(cfg.features.showWhitepaper
      ? ([{ url: `${SITE}/whitepaper`, changeFrequency: "monthly", priority: 0.6 }] as MetadataRoute.Sitemap)
      : []),
  ];
  try {
    const res = await fetch(`${INDEXER}/api/tokens?limit=200&sort=new`, { next: { revalidate: 3600 } });
    if (!res.ok) return base;
    const { tokens } = (await res.json()) as { tokens: { curve: string; creator: string; lastTradeAt: string | null }[] };
    const seenCreators = new Set<string>();
    const entries: MetadataRoute.Sitemap = [];
    for (const t of tokens ?? []) {
      entries.push({
        url: `${SITE}/token/${t.curve.toLowerCase()}`,
        lastModified: t.lastTradeAt ? new Date(Number(t.lastTradeAt) * 1000) : undefined,
        changeFrequency: "hourly",
        priority: 0.7,
      });
      const c = t.creator?.toLowerCase();
      if (c && !seenCreators.has(c)) {
        seenCreators.add(c);
        entries.push({ url: `${SITE}/profile/${c}`, changeFrequency: "daily", priority: 0.4 });
      }
    }
    return [...base, ...entries];
  } catch {
    return base;
  }
}

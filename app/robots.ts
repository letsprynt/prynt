import type { MetadataRoute } from "next";
import { getServerConfig } from "@/lib/launchpad-server";

// Multi-tenant: the canonical host comes from the resolved tenant, not from a build-time env var,
// so every launchpad served by this deployment advertises its own sitemap/host.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const cfg = await getServerConfig();
  const SITE = cfg.seo.siteUrl;
  return {
    // /api/* are machine endpoints (image proxy, upload) — crawling them wastes budget and can index junk.
    // Nothing else is disallowed on purpose: /board, /create-launchpad and the marketing landing must
    // stay crawlable, and /dashboard is kept out of the index via its own robots:noindex metadata
    // (a robots.txt block there would stop crawlers from ever seeing that directive).
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}

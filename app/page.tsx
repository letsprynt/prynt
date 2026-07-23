import { Suspense } from "react";
import type { Metadata } from "next";
import { BoardHome } from "@/components/board/BoardHome";
import { getServerContext } from "@/lib/launchpad-server";
import { Hero } from "@/components/marketing/Hero";
import { ProofBar } from "@/components/marketing/ProofBar";
import { ValueGrid } from "@/components/marketing/ValueGrid";
import { Economics } from "@/components/marketing/Economics";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { CtaBand } from "@/components/marketing/CtaBand";
import { Faq } from "@/components/marketing/Faq";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { StickyCta } from "@/components/marketing/StickyCta";

// The root URL now means two different things depending on who is asking:
//   - a launchpad host (subdomain, custom domain, ?tenant= preview) -> the coin board, unchanged;
//   - the platform's own hosts (apex, www, localhost, *.vercel.app) -> the B2B sales landing.
// The board did not move for tenants; on the platform it lives at /board.

// Brand-new B2B metadata for the platform host. It deliberately shares no phrase with /board
// ("meme coin launchpad on Robinhood Chain" + the board description), because the two pages now sit
// on the same origin and would otherwise compete for the same query — the board wants traders
// looking for coins, this page wants operators looking for launchpad software.
const PLATFORM_TITLE = "Launchpad as a service — start your own white-label memecoin launchpad";
const PLATFORM_DESCRIPTION =
  // "battle-tested" was here and had to go: README.md and SECURITY.md both state the contracts are
  // UNAUDITED, and this string is what a crawler and every social unfurl show. The visible page was
  // already clean (see the note in Hero.tsx); the head was not.
  "Run your own branded memecoin launchpad: your name, your domain, your theme and your own metadata, on top of " +
  "the same bonding-curve contracts that already run prynt.fun, with automatic graduation to Uniswap. No smart " +
  "contracts to write and no infrastructure to operate.";
const PLATFORM_KEYWORDS = [
  "launchpad as a service",
  "white label memecoin launchpad",
  "launch your own launchpad",
  "create your own token launchpad",
  "memecoin launchpad software",
  "branded launchpad platform",
  "bonding curve launchpad for your brand",
];

export async function generateMetadata(): Promise<Metadata> {
  const { config: cfg, isPlatform } = await getServerContext();
  const brand = `${cfg.name}${cfg.tld}`;

  if (isPlatform) {
    return {
      // `absolute`: the layout template appends " · <brand>", which reads as noise on a sales
      // headline that is already long and does not need the brand to qualify it.
      title: { absolute: PLATFORM_TITLE },
      description: PLATFORM_DESCRIPTION,
      keywords: PLATFORM_KEYWORDS,
      alternates: { canonical: "/" },
      // The layout's og/twitter fall back to the board copy; without these the social card for the
      // sales page would still advertise the coin board.
      //
      // `openGraph` and `twitter` are REPLACED by a child route, not deep-merged: every field the
      // layout set has to be restated here or it silently disappears from the landing page's head.
      // That is how og:type / og:site_name went missing and how twitter:card fell back to the small
      // "summary" square.
      openGraph: {
        type: "website",
        siteName: brand,
        title: PLATFORM_TITLE,
        description: PLATFORM_DESCRIPTION,
        url: "/",
      },
      twitter: {
        card: "summary_large_image",
        title: PLATFORM_TITLE,
        description: PLATFORM_DESCRIPTION,
        ...(cfg.seo.twitterHandle ? { site: cfg.seo.twitterHandle, creator: cfg.seo.twitterHandle } : {}),
      },
    };
  }

  // Tenant homepage: unchanged. Explicit canonical + a keyword-bearing description; the crawlable
  // (screen-reader-only) h1 lives in BoardHome, because the visible page is a pure app grid with no
  // headline text for Google to latch onto otherwise.
  return {
    alternates: { canonical: "/" },
    description: cfg.seo.homeDescription ?? cfg.seo.description,
  };
}

export default async function Home() {
  const { isPlatform } = await getServerContext();
  if (!isPlatform) return <BoardHome />;

  return (
    <div className="mk-page">
      {/* Awaited inline, not streamed: the h1 and the primary CTA must be in the first flush of the
          document for both LCP and crawlers that do not execute the streaming tail. */}
      <Hero />

      {/* Streamed. ProofBar walks the indexer page by page to count coins, so it is the slowest
          thing on the page; it also legitimately renders nothing when no number could be measured,
          which is exactly what the fallback shows. */}
      <Suspense fallback={null}>
        <ProofBar />
      </Suspense>

      <ValueGrid />
      <Economics />

      <HowItWorks />


      {/* The page's only inverted, full-bleed surface. It sits here, not at the very end, because it
          has to interrupt the white column while there is still page left — a dark band under the
          FAQ would read as part of the footer instead of as a break. */}
      <CtaBand />

      <Faq />
      <MarketingFooter />
      <StickyCta />
    </div>
  );
}

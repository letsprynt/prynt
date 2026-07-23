import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/shell/AppShell";
import { ClientBootstrap } from "@/components/shell/ClientBootstrap";
import { getServerConfig, getServerContext } from "@/lib/launchpad-server";
import { LaunchpadProvider } from "@/lib/launchpad-context";
import { themeToCssVars } from "@/lib/launchpad-theme";
import type { LaunchpadConfig } from "@/lib/launchpad-config";

const PLAUSIBLE = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

/// name + tld (e.g. "prynt" + ".fun") — the wordmark used as siteName / applicationName / title suffix.
function brandName(cfg: LaunchpadConfig): string {
  return `${cfg.name}${cfg.tld}`;
}

// Metadata is per-request now because the tenant is: one deployment answers on every launchpad
// domain, and each needs its own title, description and canonical origin.
export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getServerConfig();
  const brand = brandName(cfg);

  return {
    metadataBase: new URL(cfg.seo.siteUrl),
    title: { default: cfg.seo.title, template: `%s · ${brand}` },
    description: cfg.seo.description,
    applicationName: brand,
    category: "finance",
    keywords: cfg.seo.keywords,
    // The tenant may ship its own favicon; otherwise Next's file convention (app/icon.png) applies,
    // so `icons` must stay undefined rather than be set to an empty object.
    ...(cfg.faviconUrl ? { icons: { icon: cfg.faviconUrl } } : {}),
    openGraph: {
      type: "website",
      siteName: brand,
      url: cfg.seo.siteUrl,
      title: cfg.seo.title,
      description: cfg.seo.ogDescription ?? cfg.seo.description,
    },
    twitter: {
      card: "summary_large_image",
      title: cfg.seo.title,
      description: cfg.seo.ogDescription ?? cfg.seo.description,
      ...(cfg.seo.twitterHandle ? { site: cfg.seo.twitterHandle, creator: cfg.seo.twitterHandle } : {}),
    },
  };
}

// Structured data for Google (rich results / knowledge panel): who we are + what the site is.
function jsonLd(cfg: LaunchpadConfig) {
  const brand = brandName(cfg);
  const site = cfg.seo.siteUrl;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: brand,
        url: site,
        logo: new URL(cfg.seo.organizationLogoUrl ?? "/icon.png", site).toString(),
        // Only tenants with a real listing page declare one (links.defillama); claiming one for a
        // tenant that has none would be a lie to the crawler, so the property is then omitted.
        ...(cfg.links.defillama ? { sameAs: [cfg.links.defillama] } : {}),
      },
      {
        "@type": "WebSite",
        name: brand,
        url: site,
        description: cfg.seo.siteDescription ?? cfg.seo.description,
      },
    ],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // isPlatform decides the chrome, not the content: AppShell swaps in the marketing shell only on
  // the platform's own hosts and only on marketing routes. It defaults to false, so a resolver
  // failure lands on the app chrome rather than on a sales header over someone's launchpad.
  const { config: cfg, isPlatform } = await getServerContext();

  return (
    <html lang="en">
      <head>
        {/* The tenant's :root override. It must come after globals.css (both are `:root`, so equal
            specificity and the later rule wins) — the imported stylesheet is emitted as a <link> in
            <head> and this <style> follows it in document order. */}
        <style dangerouslySetInnerHTML={{ __html: themeToCssVars(cfg) }} />
      </head>
      <body>
        {/* JSON.stringify does not escape "<", and inside a <script> the HTML tokenizer runs first:
            a config string containing "</script>" would close the block and turn tenant data into
            executable markup. < is valid JSON and parses back to the same characters. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(cfg)).replace(/</g, "\\u003c") }}
        />
        {/* Route-independent client effects (referral capture, sound unlock). Mounted here rather
            than in AppShell so they also run on routes that render a different chrome. */}
        <ClientBootstrap />
        <LaunchpadProvider config={cfg}>
          <Providers>
            <AppShell isPlatform={isPlatform}>{children}</AppShell>
          </Providers>
        </LaunchpadProvider>
        {PLAUSIBLE && <Script defer data-domain={PLAUSIBLE} src="https://plausible.io/js/script.js" strategy="afterInteractive" />}
      </body>
    </html>
  );
}

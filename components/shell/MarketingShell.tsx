"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { useLaunchpad } from "@/lib/launchpad-context";
import { Toaster } from "@/components/Toaster";

// Chrome for the platform's B2B landing page only. It deliberately drops the app furniture
// (sidebar, bottom nav, live ticker, create-coin modal): those are affordances for traders on a
// coin board, and on a sales page they compete with the one action that matters — starting a
// launchpad. The board keeps AppShell untouched at /board.
//
// Referral capture and the sound unlock are NOT re-implemented here: they live in ClientBootstrap,
// mounted in the root layout, precisely so this shell can replace AppShell on "/" without dropping
// ?ref= attribution. Do not add those effects back into any shell.
export function MarketingShell({ children }: { children: ReactNode }) {
  const cfg = useLaunchpad();

  return (
    <div className="mk-shell">
      <header className="mk-header">
        <div className="mk-shell-inner mk-header-inner">
          <Link href="/" className="brand mk-wordmark">
            <span className="logo-mark" aria-hidden />
            <span className="logo-text">
              <span className="logo-name">{cfg.name}</span><span className="logo-tld">{cfg.tld}</span>
            </span>
          </Link>

          <nav className="mk-nav" aria-label="Primary">
            <Link href="/board" className="mk-nav-link">Live demo</Link>
            <Link href="/how-it-works" className="mk-nav-link">How it works</Link>
          </nav>

          <Link href="/create-launchpad" className="mk-header-cta">Create your launchpad</Link>
        </div>
      </header>

      {/* .mk-main MUST keep both classes. .mk-shell-inner supplies the 1120px measure and the page
          gutter, and .mk-bleed (the full-bleed CTA band) is defined as the exact negative of that
          gutter — dropping either class here, or wrapping children in a second padded element,
          silently leaves the band inset. Breaking out is a CSS concern; the shell only guarantees
          that the measure is applied at exactly one level. */}
      <main className="mk-main mk-shell-inner">{children}</main>

      {/* No footer here on purpose. The marketing footer is section 10 of the landing page itself
          (components/marketing/MarketingFooter.tsx) and is a server component — rendering one here
          too would put two <footer class="mk-footer"> elements on the same document. If a second
          marketing route is ever added, give it the same component rather than reviving this block. */}

      <Toaster />
    </div>
  );
}

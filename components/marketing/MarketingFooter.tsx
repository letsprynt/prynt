import Link from "next/link";
import { getServerConfig } from "@/lib/launchpad-server";

/// Section 10 of the platform landing page: the dense marketing footer.
///
/// It is deliberately link-heavy. The landing page is the one page on the apex with no token grid, so the
/// footer is where crawlers pick up the internal paths into the indexed parts of the site (/board and from
/// there the /token/* long tail) as well as the two conversion routes.
export async function MarketingFooter() {
  const cfg = await getServerConfig();
  const site = `${cfg.name}${cfg.tld}`;
  const defillama = cfg.links.defillama;

  return (
    // role="contentinfo" is explicit because this <footer> is a descendant of <main> (AppShell owns
    // the <main> wrapper and is out of scope to change), and a footer scoped to sectioning content
    // maps to `generic` per HTML-AAM — the page would otherwise expose no contentinfo landmark and
    // the risk disclaimer below would be unreachable by landmark navigation.
    <footer className="mk-footer" role="contentinfo">
      <div className="mk-footer-inner">
        <div className="mk-footer-brand">
          <span className="mk-footer-wordmark">{site}</span>
          {/* Leads with the thesis, not a product blurb — the CSS agent sets this large, so the old
              tagline is demoted inside the same paragraph rather than given a second block. */}
          <p className="mk-footer-statement">
            Anyone can run a launchpad. Nobody should have to write a contract.
          </p>
        </div>

        <nav className="mk-footer-cols" aria-label="Footer">
          <div className="mk-footer-col">
            <h3 className="mk-footer-head">Product</h3>
            <Link href="/create-launchpad">Create your launchpad</Link>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/board">Explore coins</Link>
          </div>

          {/* "Data" was a third column holding DeFiLlama plus a second /board link that duplicated
              "Explore coins". One column, no duplicate destination. */}
          <div className="mk-footer-col">
            <h3 className="mk-footer-head">Learn</h3>
            <Link href="/how-it-works">How it works</Link>
            {/* The whitepaper is prynt-specific content, and tenants can switch it off — never link a 404. */}
            {cfg.features.showWhitepaper && <Link href="/whitepaper">Whitepaper</Link>}
            {defillama && (
              // First-party destination we chose ourselves, so no ExternalLink interstitial (that component is
              // for untrusted creator-supplied URLs) — and it keeps this footer a server component.
              <a href={defillama} target="_blank" rel="noopener noreferrer">
                DeFiLlama
              </a>
            )}
          </div>
        </nav>
      </div>

      <div className="mk-footer-legal">
        {/* No new Date(): the value would be frozen into whatever render is cached and read stale
            across a New Year boundary. The year carries no legal weight, so it is simply gone. */}
        <span>&copy; {site}</span>
        <span>
          Memecoins are entertainment, not an investment. Most go to zero — never spend more than you can
          afford to lose.
        </span>
      </div>
    </footer>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUi } from "@/lib/ui";
import { useLaunchpad } from "@/lib/launchpad-context";
import { bridgeUrl } from "@/lib/explorer";
import { IconBook, IconChat, IconChevronLeft, IconChevronRight, IconHome, IconPlus, IconTrendUp } from "@/components/icons";

// Support link hidden for now — restore the <a> in the nav below to re-enable.
// const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_URL ?? "https://t.me/";

export function Sidebar({ isPlatform = false }: { isPlatform?: boolean }) {
  const { collapsed, toggleCollapsed, setSort, openCreate } = useUi();
  const cfg = useLaunchpad();
  const pathname = usePathname();
  // On the platform host "/" is the sales landing and the coin board lives at /board, so the app
  // chrome's idea of "home" moves with it. A tenant launchpad still has its board at "/".
  const homeHref = isPlatform ? "/board" : "/";
  const onHome = pathname === homeHref;
  const bridge = bridgeUrl(); // non-null only where users must bridge ETH in for gas (e.g. Robinhood Chain)

  return (
    <aside className="sidebar">
      <Link href={homeHref} className="brand sidebar-logo" onClick={() => setSort("new")}>
        <span className="logo-mark" aria-hidden />
        <span className="logo-text side-label">
          {/* .logo-name / .logo-tld are styling hooks in globals.css (two spans so the tld can differ in colour). */}
          <span className="logo-name">{cfg.name}</span><span className="logo-tld">{cfg.tld}</span>
        </span>
      </Link>

      <nav className="side-nav">
        <Link href={homeHref} onClick={() => setSort("new")} className={`side-link${onHome ? " active" : ""}`}>
          <span className="side-ico"><IconHome /></span>
          <span className="side-label">Home</span>
        </Link>
        {/* Platform-only. Same destination as Home by necessity (the board is the only coin list),
            but it lands on the biggest coins rather than the newest — the two entries are a sort
            intent, which is the pattern the brand link already uses. */}
        {isPlatform && (
          <Link href="/board" onClick={() => setSort("marketCap")} className="side-link">
            <span className="side-ico"><IconTrendUp /></span>
            <span className="side-label">Explore coins</span>
          </Link>
        )}
        <Link href="/how-it-works" className={`side-link${pathname === "/how-it-works" ? " active" : ""}`}>
          <span className="side-ico"><IconBook /></span>
          <span className="side-label">How it works</span>
        </Link>
        {cfg.features.showWhitepaper && (
          <Link href="/whitepaper" className={`side-link${pathname === "/whitepaper" ? " active" : ""}`}>
            <span className="side-ico" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M9 13h6M9 17h6" />
              </svg>
            </span>
            <span className="side-label">Whitepaper</span>
          </Link>
        )}
        {bridge && (
          <a href={bridge} target="_blank" rel="noopener noreferrer" className="side-link" title="Bridge ETH to Robinhood Chain for gas">
            <span className="side-ico" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8v8M21 8v8M3 13h18M7 13v-3M12 13V9M17 13v-3" />
              </svg>
            </span>
            <span className="side-label">Bridge ETH</span>
          </a>
        )}
        {/* Support link hidden for now
        <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="side-link">
          <span className="side-ico"><IconChat /></span>
          <span className="side-label">Support</span>
        </a>
        */}
      </nav>

      <button className="side-create" onClick={openCreate}>
        <span className="side-ico"><IconPlus /></span>
        <span className="side-label">Create coin</span>
      </button>

      <button className="side-collapse" onClick={toggleCollapsed} aria-label="Toggle sidebar">
        {collapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
      </button>
    </aside>
  );
}

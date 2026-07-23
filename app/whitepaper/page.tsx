import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpenCreateButton } from "@/components/OpenCreateButton";
import { IconBars, IconCheck, IconCrown, IconDrop, IconLock, IconZap } from "@/components/icons";
import { getServerConfig } from "@/lib/launchpad-server";

// This page is the prynt protocol spec — real deployed addresses, real on-chain constants — so its
// body is deliberately NOT parameterised per tenant. Tenants that are not prynt simply don't have a
// whitepaper: features.showWhitepaper gates the route off entirely (404) rather than showing them
// someone else's contracts under their own brand.

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getServerConfig();
  if (!cfg.features.showWhitepaper) return {};
  return {
    title: "Whitepaper",
    description:
      "The prynt protocol, specified exactly as deployed: bonding-curve math, flat capped fees, permissionless graduation to Uniswap with 100% of the LP burned, and a narrow, disclosed trust model.",
    alternates: { canonical: "/whitepaper" },
  };
}

const EXPLORER = "https://robinhoodchain.blockscout.com/address/";

const CONTRACTS = [
  { name: "LaunchpadFactory", addr: "0x5c0cdFA92C6645b6ee83e686598DbC29260F885d" },
  { name: "FeeManager", addr: "0x181e56B1d5BBf2A17089e4aAa576EAeCEeE1Ee40" },
  { name: "Migrator", addr: "0xdA642b73787aEAe0EE539f4eaae46748E7cADeAE" },
  { name: "LaunchToken impl", addr: "0x179e0a8f8DFF93eA421D21BC9c2CA777AfeAC68a" },
  { name: "BondingCurve impl", addr: "0xf5E047f67437e2368bFdc5235B4b09958Fd52aB9" },
  { name: "Uniswap V2 Router (migration target)", addr: "0x89e5db8b5aa49aa85ac63f691524311aeb649eba" },
];

const ECONOMICS = [
  { label: "Floor market cap", value: "≈1.40 ETH", note: "≈$2.4k — where every coin starts" },
  { label: "Sold on the curve", value: "793.1M", note: "79.31% of the 1B supply" },
  { label: "Raised at sell-out", value: "≈4.25 ETH", note: "≈$7.2k into the Uniswap pool" },
  { label: "Graduation market cap", value: "≈20.5 ETH", note: "≈$35k — same price the pool opens at" },
];

export default async function WhitepaperPage() {
  const cfg = await getServerConfig();
  if (!cfg.features.showWhitepaper) notFound();

  return (
    <div className="hiw">
      <header className="hiw-hero">
        <span className="hiw-eyebrow">Whitepaper · v1.0 · July 2026</span>
        <h1>The prynt protocol,<br />specified as deployed.</h1>
        <p>
          prynt is a non-custodial fair-launch protocol on Robinhood Chain. Every number on this page is
          an on-chain constant you can verify against the verified source on Blockscout — no promises,
          just bytecode.
        </p>
        <div className="hiw-cta-row">
          <OpenCreateButton className="hiw-cta-primary">Launch your coin</OpenCreateButton>
          <Link href="/how-it-works" className="hiw-cta-secondary">Plain-English version</Link>
        </div>
      </header>

      <section className="hiw-section">
        <h2>1 · Design principles</h2>
        <div className="hiw-grid2">
          <div className="hiw-card">
            <span className="hiw-card-ico"><IconCheck size={18} /></span>
            <h3>Fair by construction</h3>
            <p>
              No presale, no team allocation, no per-coin configuration. Every coin starts on the exact
              same curve at the same price. The creator&rsquo;s optional first buy executes inside the launch
              transaction itself, so it can&rsquo;t be front-run or sniped.
            </p>
          </div>
          <div className="hiw-card">
            <span className="hiw-card-ico"><IconDrop size={18} /></span>
            <h3>Clean tokens — no tax, ever</h3>
            <p>
              Coins are plain ERC-20s with EIP-2612 permit: no transfer tax, no blacklist, no minting, no
              owner, no upgradability. Some competing launchpads embed a tax in the token that keeps
              paying their team on every DEX trade forever — prynt coins carry nothing.
            </p>
          </div>
          <div className="hiw-card">
            <span className="hiw-card-ico"><IconLock size={18} /></span>
            <h3>Fees capped in bytecode</h3>
            <p>
              The immutable curve re-clamps whatever fee the FeeManager quotes to at most 2%. Even a
              hostile admin cannot impose a predatory fee — the ceiling is compiled in.
            </p>
          </div>
          <div className="hiw-card">
            <span className="hiw-card-ico"><IconZap size={18} /></span>
            <h3>Exit is guaranteed</h3>
            <p>
              Graduation is permissionless and idempotent: anyone can trigger it, a failed attempt leaves
              funds retryable in the curve, and no reachable state can freeze a graduated raise.
            </p>
          </div>
        </div>
      </section>

      <section className="hiw-section">
        <h2>2 · Architecture</h2>
        <p>
          Six immutable contracts, deployed once — no proxies, no upgrade path. The{" "}
          <strong>LaunchpadFactory</strong> clones a token and its curve atomically and escrows the full
          supply in the curve. The <strong>BondingCurve</strong> is the per-coin AMM and holds the real
          ETH raised. The <strong>FeeManager</strong> quotes fee rates and custodies trade fees. The{" "}
          <strong>Migrator</strong> seeds the Uniswap V2 pool at graduation and burns the LP. The{" "}
          <strong>Treasury</strong> receives protocol revenue. The <strong>LaunchToken</strong> is the
          fixed-supply ERC-20 every coin is cloned from.
        </p>
        <p className="muted hiw-fine">
          Off-chain, an indexer serves the UI and a keeper auto-triggers graduations within seconds. Both
          are conveniences, not custodians — the chain is the source of truth, and anyone can call{" "}
          <code>migrate()</code> if the keeper disappears.
        </p>
      </section>

      <section className="hiw-section">
        <h2>3 · The curve, in numbers</h2>
        <p>
          Each coin trades against a constant-product curve with virtual reserves:{" "}
          <code>vETH = realETH + 1.5</code>, <code>vTOK = realTOK + 279.9M</code>,{" "}
          <code>k = vETH × vTOK</code>. Supply is fixed at 1,000,000,000: 793.1M sold on the curve,
          206.9M escrowed for the Uniswap pool. The contract&rsquo;s ETH balance always equals its real
          reserve until migration — trivially auditable.
        </p>
        <div className="hiw-fees">
          {ECONOMICS.map((f) => (
            <div key={f.label} className="hiw-fee">
              <span className="hiw-fee-val">{f.value}</span>
              <span className="hiw-fee-label">{f.label}</span>
              <span className="hiw-fee-note muted">{f.note}</span>
            </div>
          ))}
        </div>
        <p className="muted hiw-fine">
          Migration parity by construction: the Uniswap pool opens at exactly the curve&rsquo;s final price —
          no listing gap, no free arbitrage for snipers. USD figures assume ETH ≈ $1,700.
        </p>
      </section>

      <section className="hiw-section">
        <h2>4 · Fees</h2>
        <div className="hiw-fees">
          <div className="hiw-fee">
            <span className="hiw-fee-val">0.001 ETH</span>
            <span className="hiw-fee-label">Creation fee</span>
            <span className="hiw-fee-note muted">hard-capped at 1 ETH in bytecode</span>
          </div>
          <div className="hiw-fee">
            <span className="hiw-fee-val">1% flat</span>
            <span className="hiw-fee-label">Trade fee — 0.5% protocol, 0.5% creator</span>
            <span className="hiw-fee-note muted">hard-capped at 2% in bytecode</span>
          </div>
          <div className="hiw-fee">
            <span className="hiw-fee-val">1% flat</span>
            <span className="hiw-fee-label">After graduation — 0.5% creator, 0.5% protocol</span>
            <span className="hiw-fee-note muted">hard-coded token fee on DEX pair swaps (V2 launches)</span>
          </div>
        </div>
        <p className="muted hiw-fine">
          One flat 1% whether a coin is worth $3k or $3M, split down the middle: 0.5% to the protocol,
          0.5% to the coin&rsquo;s creator — for the coin&rsquo;s whole life. On the bonding curve it&rsquo;s taken
          from each trade&rsquo;s ETH; after graduation (V2 launches) the token itself levies a hard-coded 1%
          on canonical-pair swaps, accrued in-token and permissionlessly harvested (<code>harvest</code>)
          to ETH into the same FeeManager. There is no admin able to change, pause or redirect either fee.
          Coins launched before the fee upgrade keep their original terms (bonding-phase fees only; their
          post-graduation swaps pay nothing to prynt or the creator). Creator earnings accrue pull-based
          (<code>claimable</code> / <code>claim</code>) and can optionally be split across up to 10 addresses
          with <code>setFeeShares</code> — keyed to the creator&rsquo;s address, so one split covers all their
          coins. Fee collection is accounting-only on the hot path — a broken FeeManager can never brick trading.
        </p>
      </section>

      <section className="hiw-section hiw-grid2">
        <div className="hiw-card">
          <span className="hiw-card-ico"><IconCrown size={18} /></span>
          <h3>Graduation</h3>
          <p>
            The buy that empties the curve closes it. <code>migrate()</code> — permissionless — hands the
            raise plus 206.9M reserved tokens to the Migrator, which seeds the canonical Uniswap V2 pair
            and burns <strong>100% of the LP to a dead address</strong>. Adversarially pre-seeded pairs
            are handled; a graduated raise can never be frozen or skimmed.
          </p>
        </div>
        <div className="hiw-card">
          <span className="hiw-card-ico"><IconBars size={18} /></span>
          <h3>Trust model</h3>
          <p>
            The owner (a hardware wallet, two-step transfers) can edit the fee table within the 2% cap,
            set the creation fee within the 1 ETH cap, and withdraw protocol revenue.{" "}
            <strong>Nothing else.</strong> Nobody — including the admin — can touch a curve&rsquo;s funds,
            change a launched token, pause trading, block graduation, or withdraw burned LP.
          </p>
        </div>
      </section>

      <section className="hiw-section">
        <h2>5 · Verification</h2>
        <p>
          All contracts are verified on Blockscout and covered by 289 unit and property tests plus
          mainnet-fork migration tests against the real Uniswap V2 deployment — including adversarial
          scenarios (pre-seeded pairs, WETH-starved pools, MEV sandwiches). An independent multi-agent
          security review preceded the mainnet deploy. No third-party audit firm has reviewed the
          contracts — the source is public; judge for yourself.
        </p>
        <div className="hiw-faq">
          {CONTRACTS.map((c) => (
            <details key={c.addr} className="hiw-faq-item">
              <summary>{c.name}</summary>
              <p>
                <a href={EXPLORER + c.addr} target="_blank" rel="noopener noreferrer">
                  <code>{c.addr}</code>
                </a>
              </p>
            </details>
          ))}
        </div>
        <p className="muted hiw-fine">
          Robinhood Chain · chain ID 4663 · deployment block 4394643 · ~100 ms blocks, gas in ETH. prynt
          is an independent project — not affiliated with, operated by, or endorsed by Robinhood Markets, Inc.
        </p>
      </section>

      <section className="hiw-section hiw-disclaimer">
        <h2>Disclaimer</h2>
        <p>
          Memecoins launched on prynt are <strong>speculative entertainment, not investments</strong>.
          They have no intrinsic value, represent no ownership, and most will go to zero. prynt is a
          neutral, non-custodial protocol interface: coins are created by anonymous users, not by prynt,
          and on-chain transactions cannot be paused, reversed or refunded. Smart contracts are immutable
          and may contain bugs. Nothing on this page is financial, investment or legal advice.
        </p>
      </section>

      <section className="hiw-final">
        <h2>Verify, then launch.</h2>
        <p className="muted">Every claim above is checkable on-chain.</p>
        <div className="hiw-cta-row">
          <OpenCreateButton className="hiw-cta-primary">Launch your coin</OpenCreateButton>
          <Link href="/" className="hiw-cta-secondary">Browse coins</Link>
        </div>
      </section>
    </div>
  );
}

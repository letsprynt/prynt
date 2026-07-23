import type { Metadata } from "next";
import Link from "next/link";
import { OpenCreateButton } from "@/components/OpenCreateButton";
import { IconBars, IconCheck, IconCrown, IconDrop, IconLock, IconZap } from "@/components/icons";
import { getServerConfig } from "@/lib/launchpad-server";

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getServerConfig();
  const site = `${cfg.name}${cfg.tld}`;
  return {
    title: "How it works",
    description: `How ${site} works — a fair bonding curve, a 1% trade fee split 50/50 with the coin's creator, and auto-graduation to Uniswap with the liquidity burned forever.`,
    alternates: { canonical: "/how-it-works" },
  };
}

const STEPS = [
  {
    icon: <IconDrop size={22} />,
    title: "1 · Launch",
    body: "Pick a name, ticker and image and launch in one transaction. No coding, no presale, no team allocation — every coin starts on the same bonding curve. An optional first buy is bundled into the launch tx so snipers can’t front-run you.",
  },
  {
    icon: <IconBars size={22} />,
    title: "2 · Trade",
    body: "Buy and sell against the curve instantly — no order book, no liquidity to seed. Robinhood Chain produces a block every ~100 ms and gas costs a fraction of a cent, so trades confirm the moment you click. Selling is one click too (gasless approval via permit).",
  },
  {
    icon: <IconCrown size={22} />,
    title: "3 · Graduate",
    body: "When the curve sells out, the coin “graduates”: it migrates to a Uniswap pool seeded with the raised ETH plus the reserved tokens, and 100% of the LP is burned to a dead address — liquidity can never be pulled. From there it trades on the open market and the bonding curve closes.",
  },
];

const FEES = [
  { label: "Launch fee", value: "0.001 ETH", note: "one-time, on creation" },
  { label: "Trade fee", value: "1% flat", note: "every buy & sell — bonding curve AND the DEX after graduation" },
  { label: "→ Platform", value: "0.5%", note: "half of the trade fee" },
  { label: "→ Creator", value: "0.5%", note: "the other half — paid in ETH, claim any time" },
];

// Brand-dependent copy, so it is built per request from the resolved tenant. `name` is the bare
// brand ("prynt"), `site` the full domain-style name ("prynt.fun") — the original copy used both.
const buildFaq = (name: string, site: string) => [
  {
    q: "What is a bonding curve?",
    a: "A bonding curve is an automatic market maker with a fixed supply (1,000,000,000 tokens). Instead of matching buyers and sellers, you trade directly against a formula: the more tokens that have been bought, the higher the price. That means instant liquidity from the very first trade and no need for anyone to provide it.",
  },
  {
    q: "Is it a fair launch?",
    a: "Yes. There’s no presale and no team allocation — everyone, including the creator, buys on the same curve at the same price. The only head start is the optional first buy, and that happens inside the launch transaction so it can’t be sniped.",
  },
  {
    q: "What does “graduation” mean?",
    a: "Once the bonding curve’s allocation is fully sold, the coin migrates to a Uniswap V2 pool. The raised ETH plus the reserved tokens seed the pool, and 100% of the LP is burned to a dead address so liquidity can never be pulled. The curve then closes and the coin trades on the open DEX.",
  },
  {
    q: "How much does it cost to launch?",
    a: "A flat 0.001 ETH launch fee plus network gas — that’s it. No presale, no listing fee, no minimum. You can optionally bundle a first buy into the same transaction to grab some of your own supply at the floor price.",
  },
  {
    q: "Do creators earn anything?",
    a: "Yes. Creators earn 0.5% of every trade on their coin — half of the flat 1% trade fee — for the coin’s whole life: on the bonding curve and, after graduation, on every Uniswap swap too (a 1% fee hard-coded into the token, on top of Uniswap’s standard 0.30% pool fee; coins launched before the fee upgrade earn on the bonding curve only). It accrues in ETH inside the on-chain FeeManager and can be claimed any time from your profile page. Creators can even split their share across up to 10 addresses on-chain — one split that applies to all of their coins.",
  },
  {
    q: "Can I edit my token after launching?",
    a: "The name, ticker and image are set at launch and stored on-chain, so they stay locked in — that’s what keeps every coin tamper-proof. Pick them carefully before you hit launch.",
  },
  {
    q: "Do I need to provide liquidity?",
    a: "No. The bonding curve is the liquidity — your coin is tradeable from the very first second, with nothing to seed. When it sells out, the pool is created and seeded automatically on graduation.",
  },
  {
    q: `What chain does ${name} run on?`,
    a: `${site} runs on Robinhood Chain — an Arbitrum-based Ethereum L2 launched by Robinhood in 2026. Gas is paid in ETH, blocks land every ~100 ms and fees are pennies, so the whole launchpad feels instant. Everything — launches, trades, graduations — settles on-chain. ${name} is an independent project and is not affiliated with, or endorsed by, Robinhood.`,
  },
  {
    q: "How do I get ETH onto Robinhood Chain?",
    a: "Bridge from Ethereum with the official Arbitrum bridge — the “Bridge ETH” link in the sidebar takes you there. A deposit arrives in about 10 minutes. Any EVM wallet works: Rabby ships with Robinhood Chain built in, MetaMask adds it in one click when you connect, and the Robinhood Wallet app supports it natively on mobile.",
  },
  {
    q: "Are memecoins an investment?",
    a: "No. Memecoins are entertainment with a price tag — they have no intrinsic value, no cash flows, no team obligations and no expectation of profit. Most go to zero. Never spend money you can’t afford to lose entirely.",
  },
];

// FAQPage structured data → Google shows the questions as expandable rich results under our listing,
// roughly doubling the SERP real estate for queries like "how to launch a memecoin on robinhood chain".
const buildFaqJsonLd = (faq: ReturnType<typeof buildFaq>) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
});

export default async function HowItWorksPage() {
  const cfg = await getServerConfig();
  const site = `${cfg.name}${cfg.tld}`;
  const faq = buildFaq(cfg.name, site);

  return (
    <div className="hiw">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqJsonLd(faq)) }} />
      <header className="hiw-hero">
        <span className="hiw-eyebrow">How it works</span>
        <h1>Launch a coin in seconds.<br />Trade it the moment it exists.</h1>
        <p>{site} is a fair-launch memecoin platform on Robinhood Chain. Every coin lives on an on-chain bonding curve — instant liquidity, no presale, a flat 1% fee split 50/50 with the coin’s creator, and a path to graduate onto Uniswap. Blocks land every ~100 ms, so it all happens in real time.</p>
        <div className="hiw-cta-row">
          <OpenCreateButton className="hiw-cta-primary">Launch your coin</OpenCreateButton>
          <Link href="/" className="hiw-cta-secondary">Browse coins</Link>
        </div>
      </header>

      <section className="hiw-steps">
        {STEPS.map((s) => (
          <div key={s.title} className="hiw-step">
            <span className="hiw-step-ico">{s.icon}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </section>

      <section className="hiw-section">
        <h2>Fees, in plain numbers</h2>
        <div className="hiw-fees">
          {FEES.map((f) => (
            <div key={f.label} className={`hiw-fee${f.label.startsWith("→") ? " sub" : ""}`}>
              <span className="hiw-fee-val">{f.value}</span>
              <span className="hiw-fee-label">{f.label}</span>
              <span className="hiw-fee-note muted">{f.note}</span>
            </div>
          ))}
        </div>
        <p className="muted hiw-fine">A single flat 1% applies whether a coin is worth $5k or $5M — no hidden tiers, and it follows the coin for life: on the bonding curve it’s taken from each trade’s ETH, after graduation it’s a 1% fee hard-coded into the token on Uniswap swaps. Half always goes to the coin’s creator. (Coins launched before the fee upgrade keep their original terms: fees on the bonding curve only.)</p>
      </section>

      <section className="hiw-section hiw-grid2">
        <div className="hiw-card">
          <span className="hiw-card-ico"><IconLock size={18} /></span>
          <h3>Liquidity burned forever</h3>
          <p>On graduation, 100% of the Uniswap LP is burned to a dead address — nobody, not even the creator or the team, can ever pull the liquidity.</p>
        </div>
        <div className="hiw-card">
          <span className="hiw-card-ico"><IconZap size={18} /></span>
          <h3>King of the Hill</h3>
          <p>The coin closest to graduating (past ~70% bonded) gets pinned to the top of the home page and swaps live the instant another coin overtakes it — prime real estate for momentum.</p>
        </div>
        <div className="hiw-card">
          <span className="hiw-card-ico"><IconCheck size={18} /></span>
          <h3>One-click sell</h3>
          <p>New coins support gasless approvals (EIP-2612 permit), so selling is a single signature + transaction instead of the usual approve-then-sell two-step.</p>
        </div>
        <div className="hiw-card">
          <span className="hiw-card-ico"><IconDrop size={18} /></span>
          <h3>No code, no presale</h3>
          <p>Launch in a single transaction — no coding, no presale, no team allocation. Every coin starts on the exact same curve, at the same price, for everyone.</p>
        </div>
      </section>

      <section className="hiw-section">
        <h2>FAQ</h2>
        <div className="hiw-faq">
          {faq.map((f) => (
            <details key={f.q} className="hiw-faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="hiw-section hiw-disclaimer" id="disclaimer">
        <h2>Disclaimer</h2>
        <p>
          Memecoins launched on {site} are <strong>speculative entertainment, not investments</strong>. They have
          no intrinsic value, represent no ownership, promise no profit and most of them will go to <strong>zero</strong>.
          Prices are driven purely by other people buying and selling — they can collapse in seconds and liquidity on
          the bonding curve or the DEX pool may be thin.
        </p>
        <p>
          {site} is a neutral, non-custodial protocol interface: coins are created by anonymous users, not by{" "}
          {cfg.name}, and we can’t pause, reverse or refund on-chain transactions. Smart contracts are immutable and, like
          all software, may contain bugs. Nothing on this site is financial, investment or legal advice — do your own
          research and never spend money you can’t afford to lose entirely.
        </p>
        <p className="muted">
          {site} is an independent project. It is not affiliated with, operated by, or endorsed by Robinhood
          Markets, Inc. — “Robinhood Chain” refers to the public blockchain network {cfg.name} is deployed on.
        </p>
      </section>

      <section className="hiw-final">
        <h2>Ready to launch?</h2>
        <p className="muted">Your coin is one transaction away.</p>
        <div className="hiw-cta-row">
          <OpenCreateButton className="hiw-cta-primary">Launch your coin</OpenCreateButton>
          <Link href="/" className="hiw-cta-secondary">Browse coins</Link>
        </div>
      </section>
    </div>
  );
}

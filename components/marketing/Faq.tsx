import { getServerConfig } from "@/lib/launchpad-server";

/// Section 8 of the platform landing page.
///
/// These questions are the ones that actually block the purchase decision ("do I need to write a
/// contract?", "what does it cost?", "who owns the tokens?"). Every answer has to match what the product
/// really does today — the operator of a launchpad sells BRANDING, not a share of trading fees, so nothing
/// here may hint at operator revenue beyond the one true case: they earn the coin-creator's 0.5% on coins
/// they launch themselves.
type FaqItem = { q: string; a: string };

const buildFaq = (site: string): FaqItem[] => [
  {
    q: "Do I need to code?",
    a: `No. You never touch Solidity. ${site} already runs the factory, bonding-curve and graduation contracts — creating a launchpad only sets up your brand, theme, domain and SEO on top of them.`,
  },
  {
    q: "What does a launchpad cost?",
    // Copy-law fact (e): free, gas and your registrar only.
    a: "Nothing. No setup fee, no subscription. You pay gas when you deploy or trade a coin, and whatever your own domain costs at your registrar.",
  },
  {
    q: "Do the coins belong to my launchpad?",
    // Rewritten from "Who owns the coins launched on my launchpad?" — the old question presupposed
    // per-launchpad coin ownership, which does not exist anywhere in the product. Copy-law fact (a).
    a: "No. Nothing on-chain records which front end a coin came from, so every launchpad lists the same coins. Yours is the brand and the front door, never custody of anyone's tokens or funds.",
  },
  {
    q: "Do I earn trading fees?",
    // Copy-law fact (b). Kept blunt: this is the assumption that would otherwise cost a buyer money.
    a: "No. The 1% is split 0.5% to the coin's creator and 0.5% to the protocol — an operator has no cut. You earn only on coins you launch yourself, as that coin's creator.",
  },
  {
    q: "What happens at graduation?",
    // Copy-law fact (c). It lived under the fee bar until that caption was cut for length; deleting
    // it outright is not an option, so it moved here.
    a: "Its liquidity moves to Uniswap and the LP tokens are burned, so nobody can pull that liquidity — not the creator, not the operator, not us.",
  },
  {
    q: "Can I use my domain?",
    a: "Yes. Every launchpad gets a free subdomain at once. To attach your own, add a CNAME record pointing at us and a TXT record proving you control it; once both resolve it serves over HTTPS with its own SEO and social cards.",
  },
  {
    q: "Which chain, and can I rebrand later?",
    // Only the fields the dashboard form actually submits are listed (name, tagline, logoUrl, theme,
    // accent, links, feature toggles) plus domains. SEO copy is settable through the API but has no
    // control in the dashboard UI, so promising it here would send a buyer looking for a field that
    // is not on the screen.
    a: "Robinhood Chain, where blocks land in about 100 ms. Nothing is frozen: name, tagline, logo, theme, accent, links, sections and domains can all be changed later from the dashboard.",
  },
];

// FAQPage structured data — Google renders these as expandable rich results, which widens our listing for
// buying-intent queries like "white label memecoin launchpad".
const buildFaqJsonLd = (faq: FaqItem[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
});

export async function Faq() {
  const cfg = await getServerConfig();
  const site = `${cfg.name}${cfg.tld}`;
  const faq = buildFaq(site);

  return (
    <section className="mk-faq" aria-labelledby="mk-faq-title">
      {/* JSON.stringify does not escape "<", and inside a <script> the HTML tokenizer runs before the JSON
          parser — a literal closing script tag in any answer would end the tag early and turn the rest into
          markup. Escaping every "<" as its < JSON escape is still valid JSON and defuses that entirely. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqJsonLd(faq)).replace(/</g, "\\u003c") }}
      />

      <h2 id="mk-faq-title" className="mk-faq-title">Before you launch</h2>

      <div className="mk-faq-list">
        {faq.map((f) => (
          <details key={f.q} className="mk-faq-item">
            <summary>
              <span>{f.q}</span>
              <span className="mk-faq-mark" aria-hidden="true" />
            </summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

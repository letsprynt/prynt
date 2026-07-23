// Landing section — the fee model.
//
// TWO SPLITS LIVE ON THIS PAGE AND THEY MUST NOT BE CONFLATED:
//
//   LIVE TODAY   1% -> 0.5% coin creator / 0.5% protocol. No operator leg exists anywhere in the
//                deployed contracts. FeeManager.collectFees(token, creator, creatorFeeAmount)
//                (src/FeeManager.sol:126) takes two legs and gives the protocol the remainder;
//                there is no third parameter and no launchpad identity in the call.
//   PLANNED      1% -> 0.5% coin creator / 0.25% launchpad operator / 0.25% protocol.
//
// The planned split needs a new FeeManager, a new BondingCurve and a new factory — the deployed
// curve stores FEE_MANAGER as `immutable` (src/BondingCurve.sol:179), so the 9 existing coins can
// never be retrofitted. Until that ships, an operator earns nothing from running a launchpad.
//
// So this section sells the model and marks it as not-yet-live, in the same breath, at the same
// size. `LIVE` below is the single switch: flip it when the three-way split is on mainnet and the
// status note disappears. Do not flip it early — the whole point of the note is that a reader
// deciding to build a business on this must not be told they are earning when they are not.
//
// The split is NOT described as contract-enforced. It is a FeeManager tier set by an owner
// transaction (docs/TECH_REPORT.md §5.3 — the repo default is creatorBps: 0), so "enforced by the
// contracts rather than by us" was backwards and had to go. The LP burn below IS contract
// behaviour, which is why that fact keeps its stronger wording in the showcase tile and the FAQ.
// Numbers must stay in sync with /how-it-works, the canonical explanation of the same split.

/// Is the three-way split live on mainnet? While false, the section shows the planned split with an
/// explicit status note stating what the deployed contracts actually pay today.
const LIVE = false;

const ROWS: { phase: string; when: string; fee: string }[] = [
  {
    phase: "On the bonding curve",
    when: "every buy and sell",
    fee: "1% of the trade",
  },
  {
    phase: "After graduation, on Uniswap",
    // Grandfathering is real and /how-it-works states it: coins from the pre-upgrade (V1) factory
    // carry no DEX tax at all, so an unqualified "every coin, for life" would be false for them.
    // This qualifier is not optional copy.
    when: "since the fee upgrade only — earlier coins are grandfathered, no DEX tax",
    fee: "1% on top of Uniswap's 0.30%",
  },
];

export function Economics() {
  return (
    <section className="mk-fees" aria-labelledby="mk-fees-h">
      <header className="mk-shead">
        <h2 className="mk-shead-title" id="mk-fees-h">
          The fee model
        </h2>
        <p className="mk-shead-lead">
          One percent per trade, split three ways. Half to the person who made the coin, and the rest
          split evenly between the launchpad it came from and us.
        </p>
      </header>

      {/* The bar is the section. Each segment's width IS its share — 50 / 25 / 25 — so the graphic
          can never say something the numbers do not. Widths are inline because they are data, not
          styling: a reader checking the picture against the legend is checking the same two numbers. */}
      <div className="mk-fees-split">
        <div className="mk-fees-bar" aria-hidden="true">
          <span className="mk-fees-half mk-fees-half--creator" style={{ width: "50%" }} />
          <span className="mk-fees-half mk-fees-half--operator" style={{ width: "25%" }} />
          <span className="mk-fees-half mk-fees-half--protocol" style={{ width: "25%" }} />
        </div>

        <ul className="mk-fees-legend">
          <li className="mk-fees-legend-item">
            <i className="mk-fees-dot mk-fees-dot--creator" aria-hidden="true" />
            0.5% to the coin&rsquo;s creator
          </li>
          <li className="mk-fees-legend-item">
            <i className="mk-fees-dot mk-fees-dot--operator" aria-hidden="true" />
            0.25% to the launchpad it was created from
          </li>
          <li className="mk-fees-legend-item">
            <i className="mk-fees-dot mk-fees-dot--protocol" aria-hidden="true" />
            0.25% to the protocol
          </li>
        </ul>

        {/* Not fine print, and not a footnote at the bottom of the page: it sits directly under the
            graphic it qualifies, because a reader who scrolls past the bar has already formed the
            belief this note exists to correct. */}
        {!LIVE && (
          <p className="mk-fees-status">
            <strong>The launchpad&rsquo;s 0.25% is not live yet.</strong> Today the deployed
            contracts split the 1% as 0.5% to the coin&rsquo;s creator and 0.5% to the protocol,
            with no operator share. The three-way split needs a contract upgrade and pays nothing
            until that ships — treat it as the plan, not as income.
          </p>
        )}
      </div>

      <ul className="mk-fees-rows">
        {ROWS.map((r) => (
          <li className="mk-fees-row" key={r.phase}>
            <div className="mk-fees-when">
              <strong>{r.phase}</strong>
              <small>{r.when}</small>
            </div>
            <div className="mk-fees-what">{r.fee}</div>
          </li>
        ))}
      </ul>

      {/* The display line is the one thing a reader can act on TODAY, so it is the creator leg —
          that one is live and needs no asterisk. The operator leg is the reason to want a launchpad,
          but it is future tense and the cite says so in its own words rather than leaning on the
          status note above to carry it; a pull quote gets screenshotted and quoted out of context,
          so it has to be true standing alone. */}
      <blockquote className="mk-fees-quote">
        <p>Launch coins yourself and you take 0.5% of every trade on them.</p>
        <cite>
          That leg is live now and is paid to you as the coin&rsquo;s creator, whether or not you run
          a launchpad. The operator&rsquo;s 0.25% is the plan for the next contract upgrade, and pays
          nothing before it. On Uniswap, only for coins launched since the fee upgrade.
        </cite>
      </blockquote>
    </section>
  );
}

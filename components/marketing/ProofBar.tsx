import type { TokenSummary } from "@/lib/api";

// Section 2: a borderless row of REAL numbers sitting directly under the hero frame.
//
// The rule for this component is absolute: a stat is rendered only when its number was actually
// measured. No zeros, no "1,000+" placeholders, no invented metrics. If nothing could be measured
// the whole bar returns null and the page closes up around it — an empty row is honest, a fake
// one is not, and this is the section a buyer will spot-check first.
//
// See the note in Hero.tsx for why the indexer is called directly instead of via "@/lib/api".
const INDEXER = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:42069";

const PAGE = 200; // the indexer caps /api/tokens at 200 rows per request
const MAX_PAGES = 12; // hard ceiling so a large index can never turn one page render into 100 fetches

type CoinCount = { total: number; graduated: number | null; exact: boolean } | null;

/// The indexer exposes no totals endpoint, so the count is derived by walking /api/tokens. If the
/// ceiling is hit before the last page the total is reported as "N+" (exact=false) rather than as a
/// precise figure we cannot stand behind. Graduated is only reported for a complete walk, since a
/// truncated scan would undercount it silently.
async function countCoins(): Promise<CoinCount> {
  try {
    let total = 0;
    let graduated = 0;
    let exact = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams({
        sort: "new",
        order: "desc",
        limit: String(PAGE),
        offset: String(page * PAGE),
      });
      const res = await fetch(`${INDEXER}/api/tokens?${q}`, { next: { revalidate: 300 } });
      if (!res.ok) return null;
      const json = (await res.json()) as { tokens?: TokenSummary[]; hasMore?: boolean };
      const rows = Array.isArray(json.tokens) ? json.tokens : [];
      total += rows.length;
      graduated += rows.filter((t) => t.migrated).length;
      if (!json.hasMore || rows.length === 0) {
        exact = true;
        break;
      }
    }
    if (total === 0) return null; // nothing indexed yet: show no stat rather than a zero
    return { total, graduated: exact ? graduated : null, exact };
  } catch {
    return null;
  }
}

/// Thousands separators without toLocaleString, which is locale-dependent and would make the
/// server-rendered string differ from what a client render would produce.
function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/// Value before label in the DOM so the stylesheet can stack them (number above caption) with plain
/// flow order — no order:-1 or absolute positioning, which would leave the reading order wrong for
/// a screen reader.
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="mk-proof-item">
      <strong className="mk-proof-value">{value}</strong>
      <span className="mk-proof-label">{label}</span>
    </div>
  );
}

// A "launchpads live" count was deliberately removed rather than fixed. countActive() counts rows in
// the launchpads table, and today those rows are prynt itself plus the two bundled demo tenants from
// scripts/seed-launchpads.ts. Presenting our own seed data to a buyer as adoption is the same
// anti-proof that got the launchpad gallery cut; the coin numbers below are genuinely third-party.
// Below this, the total is reported as a sentence rather than as a display numeral. The number is
// the same either way — what changes is what it CLAIMS. Set at 52px, a single-digit total is the
// second beat of a page selling launchpad software, and a buyer reads it as a traction figure it
// cannot support ("nobody is here"). At caption size the identical number reads as what it always
// was: proof the page is wired to a live index. The honesty rule above is untouched — nothing is
// hidden, rounded up or padded, and the threshold only moves the typography.
const BIG_NUMBER_FLOOR = 100;

export async function ProofBar() {
  const coins = await countCoins();

  const stats: { value: string; label: string }[] = [];
  if (coins && coins.total >= BIG_NUMBER_FLOOR) {
    stats.push({ value: coins.exact ? group(coins.total) : `${group(coins.total)}+`, label: "coins launched" });
    // Only a complete walk can state this honestly; a truncated one would undercount.
    if (coins.graduated != null && coins.graduated > 0) {
      stats.push({ value: group(coins.graduated), label: "graduated to Uniswap" });
    }
  }

  // Below the floor the count folds into the provenance line; with no count at all there is nothing
  // to attest to and the whole band still returns null, exactly as before.
  const note = coins
    ? `${coins.exact ? group(coins.total) : `${group(coins.total)}+`} coins launched · live from the Robinhood Chain indexer`
    : null;
  if (stats.length === 0 && !note) return null;

  return (
    <section className="mk-proof" aria-label="Live platform numbers">
      <div className="mk-proof-inner">
        {stats.map((s) => (
          <Stat key={s.label} value={s.value} label={s.label} />
        ))}
        {/* Provenance, not a stat: deliberately has no .mk-proof-value, so the modifier is what the
            stylesheet keys off to drop it out of the big-number rhythm. */}
        <div className="mk-proof-item mk-proof-item--note">
          <span className="mk-proof-label">
            {stats.length > 0 ? "Live from the Robinhood Chain indexer" : note}
          </span>
        </div>
      </div>
    </section>
  );
}

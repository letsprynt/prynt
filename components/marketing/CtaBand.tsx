import Link from "next/link";
import type { TokenSummary } from "@/lib/api";
import { imgSrc } from "@/lib/img";
import { CoinPitStage, type PitCoin } from "./CoinPitStage";

// Landing section 8 — the rhythm break, and the page's only toy.
//
// Everything above and below it is dark type on white at the 1120px measure; this is the page's ONLY
// inverted surface. It used to be one line and one button on flat black. The coins now bounce inside
// it: real coin art under a physics loop (CoinPitStage.tsx), piling up on the floor of the band with
// the headline and the button sitting above them. It is the same break, with something to touch.
//
// LAYERING, and why the button still works: the pit is an absolutely-positioned layer that fills the
// band and owns pointer events, so a drag anywhere in the empty space throws a coin. The content sits
// on top with `pointer-events: none`, and only the line and the button switch it back on — so a click
// on the button hits the button, and a click beside it falls through to the pit.
//
// .mk-bleed escapes the measure: .mk-main carries .mk-shell-inner, so every child is already capped
// at --mk-w with the page gutter applied. The utility cancels that with negative inline margins plus
// matching padding (and overflow-x: clip on .mk-shell to keep the negative margins from producing a
// horizontal scrollbar), which is why the band must stay a direct child of .mk-main.
//
// See the note in Hero.tsx for why the indexer is called here rather than through "@/lib/api".
const INDEXER = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:42069";

// How many bodies end up in the pit. The indexer currently holds NINE coins in total — there are no
// other launchpads yet, so there is no larger pool to draw from — and nine bodies in a 1240px pit
// read as a thin line rather than a heap. The list is therefore cycled up to TARGET, with the size
// jitter in CoinPitStage doing the work of making a repeat not look like a repeat. Drop the cycling
// the moment the index is big enough to fill this on its own.
const FETCH = 40;
const TARGET = 28;

/// FAIL-OPEN: no coins means no pit, and the band renders exactly as it did before — one line and one
/// button. The toy is the one thing on this page that is allowed to disappear without costing the
/// reader anything, so it is also the one thing that never blocks the section from rendering.
async function loadCoins(): Promise<PitCoin[]> {
  try {
    const q = new URLSearchParams({ sort: "marketCap", order: "desc", limit: String(FETCH) });
    const res = await fetch(`${INDEXER}/api/tokens?${q}`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = (await res.json()) as { tokens?: TokenSummary[] };
    const rows = Array.isArray(json.tokens) ? json.tokens : [];
    // No reveal gate out here, same rule as everywhere else on the marketing page.
    const usable = rows.filter((t) => !t.nsfw);
    if (usable.length === 0) return [];
    return Array.from({ length: TARGET }, (_, i) => {
      const t = usable[i % usable.length];
      return {
        // The key has to be unique per BODY, not per coin — the same coin appears several times.
        id: `${t.curve}-${i}`,
        symbol: (t.symbol || "?").slice(0, 4).toUpperCase(),
        src: imgSrc(t.imageUrl),
      };
    });
  } catch {
    return [];
  }
}

export async function CtaBand() {
  const coins = await loadCoins();

  return (
    <section className="mk-cta mk-bleed" aria-labelledby="mk-cta-h">
      {coins.length > 0 && <CoinPitStage coins={coins} className="mk-cta-pit" />}

      <div className="mk-cta-inner">
        <p className="mk-cta-line" id="mk-cta-h">
          Your launchpad is twenty minutes away.
        </p>
        <Link href="/create-launchpad" className="mk-btn mk-btn-invert mk-btn-lg">
          Create your launchpad
        </Link>
      </div>
    </section>
  );
}

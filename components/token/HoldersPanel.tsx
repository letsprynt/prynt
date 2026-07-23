"use client";

import Link from "next/link";
import { avatarStyle } from "@/lib/avatar";
import type { Holder, TokenSummary } from "@/lib/api";
import { IconDrop } from "@/components/icons";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const LIQUIDITY_TOKENS = 206_900_000; // reserved for LP at graduation (held by the curve pre-grad, the pair post-grad)
const TOTAL = 1_000_000_000;

type Row =
  | { kind: "wallet"; address: string; pct: number; isDev: boolean }
  | { kind: "pool"; label: string; pct: number };

// Compact holder distribution for the right rail, pump.fun-style: wallets PLUS the bonding curve / liquidity pool
// as its own entry, so the shares visibly sum to ~100% (the pool holds the rest of the supply, not a person).
export function HoldersPanel({ holders, token, creator }: { holders: Holder[] | null; token?: TokenSummary; creator?: string }) {
  if (holders === null) {
    return (
      <div className="panel hp">
        <div className="hp-head"><h3>Holders</h3></div>
        <div className="muted" style={{ padding: "10px 0" }}>Loading…</div>
      </div>
    );
  }

  // the curve (pre-grad) or pair (post-grad) holds a chunk of supply — show it as its own row
  let poolRow: Row | null = null;
  if (token) {
    if (token.migrated) {
      const poolTok = token.poolTokenWei ? Number(token.poolTokenWei) / 1e18 : 0;
      if (poolTok > 0) poolRow = { kind: "pool", label: "Liquidity pool", pct: (poolTok / TOTAL) * 100 };
    } else {
      const unsold = token.realTokenReserve ? Number(token.realTokenReserve) / 1e18 : 0;
      const curveHeld = unsold + LIQUIDITY_TOKENS; // curve balance = unsold sellable + reserved LP tokens
      poolRow = { kind: "pool", label: "Bonding curve", pct: (curveHeld / TOTAL) * 100 };
    }
  }

  const rows: Row[] = [
    ...holders.map((h): Row => ({ kind: "wallet", address: h.address, pct: h.pctOfSupply, isDev: !!creator && h.address.toLowerCase() === creator.toLowerCase() })),
    ...(poolRow ? [poolRow] : []),
  ].sort((a, b) => b.pct - a.pct);

  const top10 = Math.round(rows.slice(0, 10).reduce((s, r) => s + r.pct, 0) * 10) / 10;
  const max = rows[0]?.pct || 1;

  return (
    <div className="panel hp">
      <div className="hp-head">
        <h3>Holders</h3>
        {holders.length > 0 && <span className="muted">{holders.length} · top 10 {top10}%</span>}
      </div>
      {rows.length === 0 ? (
        <div className="muted" style={{ padding: "10px 0" }}>No holders yet.</div>
      ) : (
        <div className="hp-list">
          {rows.slice(0, 15).map((r, i) => (
            <div key={r.kind === "pool" ? r.label : r.address} className={`hp-row${r.kind === "pool" ? " hp-pool" : ""}`}>
              <span className="hp-rank">{i + 1}</span>
              {r.kind === "pool" ? (
                <span className="hp-addr hp-poollabel"><IconDrop size={12} /> {r.label}</span>
              ) : (
                <Link href={`/profile/${r.address}`} className="hp-addr addr-link">
                  <span className="pp-av" style={avatarStyle(r.address)} />{short(r.address)}{r.isDev && <span className="feed-devtag">DEV</span>}
                </Link>
              )}
              <div className="hp-bar"><div style={{ width: `${Math.max(4, Math.min(100, (r.pct / max) * 100))}%` }} /></div>
              <span className="hp-pct">{r.pct.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

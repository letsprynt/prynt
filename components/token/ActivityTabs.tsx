"use client";

import Link from "next/link";
import { avatarStyle } from "@/lib/avatar";
import { useEffect, useRef, useState } from "react";
import type { Holder, TradeRow } from "@/lib/api";
import { txUrl } from "@/lib/explorer";
import { compactEth, compactTokens, compactUsd, timeAgo } from "../board/TokenCard";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// Combined Trades / Holders panel with a tab toggle. Holders show each wallet's holding value + live PnL.
export function ActivityTabs({
  trades,
  holders,
  symbol,
  creator,
  usd,
}: {
  trades: TradeRow[] | null;
  holders: Holder[] | null;
  symbol?: string;
  creator?: string;
  usd?: number | null;
}) {
  const [tab, setTab] = useState<"trades" | "holders">("trades");
  const [tradeSort, setTradeSort] = useState<"recent" | "oldest" | "largest">("recent");
  const [sideFilter, setSideFilter] = useState<"all" | "buy" | "sell">("all");

  // flash the newest trade row
  const [flashId, setFlashId] = useState("");
  const prevTop = useRef("");
  useEffect(() => {
    const top = trades?.[0]?.id;
    if (!top) return;
    const changed = prevTop.current && top !== prevTop.current;
    prevTop.current = top; // ALWAYS track the current top — otherwise a stale ref re-flashes the same latest
    if (changed) {         // row on every trades-prop refresh (the "endless blink even 10 min after the trade")
      setFlashId(top);
      const id = setTimeout(() => setFlashId(""), 1000);
      return () => clearTimeout(id);
    }
  }, [trades]);

  const isDev = (a: string) => !!creator && a.toLowerCase() === creator.toLowerCase();
  const top10 = holders ? Math.round(holders.slice(0, 10).reduce((s, h) => s + h.pctOfSupply, 0) * 10) / 10 : 0;

  // client-side sort/filter over the loaded trades (API delivers them newest-first)
  const cmpSize = (a: TradeRow, b: TradeRow) => { const d = BigInt(b.ethWei) - BigInt(a.ethWei); return d > 0n ? 1 : d < 0n ? -1 : 0; };
  const shownTrades =
    trades == null
      ? null
      : (() => {
          const f = sideFilter === "all" ? trades : trades.filter((t) => (sideFilter === "buy" ? t.isBuy : !t.isBuy));
          if (tradeSort === "largest") return [...f].sort(cmpSize);
          if (tradeSort === "oldest") return [...f].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
          return f; // recent: API order (newest first)
        })();

  return (
    <div className="panel activity-panel">
      <div className="activity-tabs">
        <button className={tab === "trades" ? "active" : ""} onClick={() => setTab("trades")}>Live trades</button>
        <button className={tab === "holders" ? "active" : ""} onClick={() => setTab("holders")}>
          Holders{holders ? <span className="muted"> · {holders.length}</span> : null}
        </button>
        <span className="activity-meta muted">{tab === "holders" && holders && holders.length > 0 ? `top 10 · ${top10}%` : ""}</span>
      </div>

      {tab === "trades" ? (
        shownTrades === null ? (
          <div className="feed-list">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="feed-row skeleton" style={{ height: 30 }} />)}</div>
        ) : (
          <>
            <div className="feed-controls">
              <div className="feed-seg">
                <button className={tradeSort === "recent" ? "active" : ""} onClick={() => setTradeSort("recent")}>Recent</button>
                <button className={tradeSort === "oldest" ? "active" : ""} onClick={() => setTradeSort("oldest")}>Oldest</button>
                <button className={tradeSort === "largest" ? "active" : ""} onClick={() => setTradeSort("largest")}>Largest</button>
              </div>
              <div className="feed-seg">
                <button className={sideFilter === "all" ? "active" : ""} onClick={() => setSideFilter("all")}>All</button>
                <button className={sideFilter === "buy" ? "active buy" : ""} onClick={() => setSideFilter("buy")}>Buys</button>
                <button className={sideFilter === "sell" ? "active sell" : ""} onClick={() => setSideFilter("sell")}>Sells</button>
              </div>
            </div>
            {shownTrades.length === 0 ? (
              <div className="muted" style={{ padding: "16px 0" }}>
                {sideFilter === "buy" ? "No buys yet." : sideFilter === "sell" ? "No sells yet." : "No trades yet — be the first to trade."}
              </div>
            ) : (
              <div className="feed-list">
                {shownTrades.map((t) => {
                  const dev = isDev(t.trader);
                  const tx = txUrl(t.txHash);
                  return (
                    <div key={t.id} className={`feed-row ${t.isBuy ? "buy" : "sell"}${t.id === flashId ? " feed-new" : ""}`}>
                      <span className="feed-side">{t.isBuy ? "BUY" : "SELL"}</span>
                      <Link href={`/profile/${t.trader}`} className="feed-addr addr-link">
                        <span className="pp-av" style={avatarStyle(t.trader)} />{short(t.trader)}{dev && <span className="feed-devtag" title="Dev trade">DEV</span>}
                      </Link>
                      <span className="feed-amt">{compactEth(String(Number(t.ethWei) / 1e18))} ETH</span>
                      <span className="feed-tok muted">{compactTokens(t.tokenWei)} {symbol ?? ""}</span>
                      {tx ? (
                        <a href={tx} target="_blank" rel="noopener noreferrer" className="feed-time muted addr-link" title="View transaction">{timeAgo(t.timestamp)}</a>
                      ) : (
                        <span className="feed-time muted">{timeAgo(t.timestamp)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )
      ) : holders === null ? (
        <div className="muted" style={{ padding: "12px 0" }}>Loading…</div>
      ) : holders.length === 0 ? (
        <div className="muted" style={{ padding: "12px 0" }}>No holders yet.</div>
      ) : (
        <div className="hx-table">
          <div className="hx-head">
            <span>Trader</span>
            <span className="hx-num">Bought</span>
            <span className="hx-num">Sold</span>
            <span className="hx-num">PNL</span>
            <span className="hx-num">Unreal.</span>
            <span className="hx-num">Balance</span>
          </div>
          {holders.slice(0, 50).map((h, i) => {
            const dev = isDev(h.address);
            const eth = (v?: string | null) => (v != null && Number(v) > 0 ? compactEth(v) : "—");
            const pnl = h.pnlEth == null ? null : `${Number(h.pnlEth) >= 0 ? "+" : ""}${compactEth(h.pnlEth)}`;
            return (
              <div key={h.address} className="hx-row">
                <Link href={`/profile/${h.address}`} className="hx-addr addr-link">
                  <span className="hx-rank">{i + 1}</span>{short(h.address)}{dev && <span className="feed-dev">DEV</span>}
                </Link>
                <span className="hx-num">{eth(h.costEth)}</span>
                <span className="hx-num">{eth(h.soldEth)}</span>
                <span className={`hx-num hx-pnl ${pnl == null ? "muted" : h.pnlUp ? "up" : "down"}`}>{pnl ?? "—"}</span>
                <span className="hx-num">{eth(h.valueEth)}</span>
                <span className="hx-num" title={`${h.pctOfSupply.toFixed(2)}% of supply`}>{compactTokens(h.balance)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

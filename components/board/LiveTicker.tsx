"use client";

import { useEffect, useRef, useState } from "react";
import { avatarStyle } from "@/lib/avatar";
import Link from "next/link";
import { formatEther } from "viem";
import { fetchRecentTrades, useEthUsd, useTokenStream, type TradeEvent } from "@/lib/api";
import { compactEth, compactUsd } from "@/components/board/TokenCard";
import { TokenImage } from "@/components/TokenImage";
import { shortAddr } from "@/lib/format";

const MAX = 40; // rolling buffer cap

// Thin "degen" ticker: a continuous marquee of live buys/sells. Seeded from /api/trades, then fed by the SSE
// trade stream (each trade carries the token's name/symbol/image). Pauses on hover; hides until the first trade.
export function LiveTicker() {
  const [items, setItems] = useState<TradeEvent[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const eth = useEthUsd();

  useEffect(() => {
    let alive = true;
    fetchRecentTrades(30)
      .then((tr) => {
        if (!alive) return;
        const fresh = tr.filter((t) => !seen.current.has(t.id));
        fresh.forEach((t) => seen.current.add(t.id));
        setItems(fresh.slice(0, MAX));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useTokenStream({
    onTrade: (t) => {
      if (seen.current.has(t.id)) return;
      seen.current.add(t.id);
      setItems((prev) => [t, ...prev].slice(0, MAX));
    },
  });

  if (items.length === 0) return null;

  const loop = [...items, ...items]; // duplicate => seamless -50% loop
  const dur = Math.max(18, items.length * 3); // ~constant speed (~3s per item)

  return (
    <div className="ticker" aria-label="live trades">
      <div className="ticker-vp">
        <div className="ticker-track" style={{ animationDuration: `${dur}s` }}>
          {loop.map((t, i) => (
            <TickerItem key={`${t.id}-${i}`} t={t} usd={eth.usd} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TickerItem({ t, usd }: { t: TradeEvent; usd: number | null }) {
  const ethAmt = formatEther(BigInt(t.ethWei));
  const usdAmt = usd != null ? Number(ethAmt) * usd : null;
  const sym = t.symbol ?? shortAddr(t.curve);
  return (
    <Link href={`/token/${t.curve}`} className="ticker-item">
      <span className="pp-av" style={avatarStyle(t.trader)} />
      <span className="ticker-who">{shortAddr(t.trader)}</span>
      <span className={t.isBuy ? "ticker-buy" : "ticker-sell"}>{t.isBuy ? "bought" : "sold"}</span>
      <span className="ticker-amt">{usdAmt != null ? compactUsd(usdAmt) : `${compactEth(ethAmt)} ETH`}</span>
      <span className="ticker-of muted">of</span>
      <TokenImage src={t.imageUrl} alt="" seed={t.curve} label={sym} nsfw={t.nsfw} className="ticker-media" />
      <span className="ticker-sym">{sym}</span>
    </Link>
  );
}

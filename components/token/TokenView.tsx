"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { fetchTokenDetail, useEthUsd, useTokenStream, type TokenDetail, type TradeEvent } from "@/lib/api";
import { track } from "@/lib/analytics";
import { IconAlert } from "@/components/icons";
import { TradePanel } from "../TradePanel";
import { PositionPanel } from "./PositionPanel";
import { CoinChartPanel } from "./CoinChartPanel";
import { ActivityTabs } from "./ActivityTabs";
import { HoldersPanel } from "./HoldersPanel";

export function TokenView({ curve }: { curve: Address }) {
  const [detail, setDetail] = useState<TokenDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [liveTrade, setLiveTrade] = useState<TradeEvent | null>(null);
  const eth = useEthUsd();

  const load = useCallback(async () => {
    try {
      setDetail(await fetchTokenDetail(curve));
      setNotFound(false);
    } catch (e) {
      // a real 404 → show a not-found panel instead of a fake "Token $—" shell; keep polling so a JUST-created
      // coin (not indexed yet) recovers on its own. Other errors keep the last good detail.
      if (String((e as Error).message).includes("404")) setNotFound(true);
    }
  }, [curve]);

  useEffect(() => {
    load();
    // keep detail fresh even with no curve trades (graduation flip, holders changing via DEX transfers).
    // While a coin is graduating (sold out, not yet migrated) poll fast so the whole page flips the instant it lands.
    const graduating = !!detail?.token.complete && !detail?.token.migrated;
    const id = setInterval(load, graduating ? 1500 : 5000);
    return () => clearInterval(id);
  }, [load, detail?.token.complete, detail?.token.migrated]);

  useEffect(() => {
    track("token_view", { curve });
  }, [curve]);

  // One SSE subscription drives everything: push the trade to the chart (smooth incremental update) and
  // debounce-refetch the detail so the feed + holders + stats stay live without hammering the API.
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useTokenStream({
    onTrade: (tr) => {
      if (tr.curve.toLowerCase() !== curve.toLowerCase()) return;
      setLiveTrade(tr);
      clearTimeout(tRef.current);
      tRef.current = setTimeout(load, 700);
    },
  });

  if (notFound && !detail) {
    return (
      <div className="board-state" style={{ marginTop: 40 }}>
        <div className="state-ico"><IconAlert size={28} /></div>
        <p>This token doesn’t exist — or hasn’t been indexed yet.</p>
        <p className="muted">If you just created it, give it a few seconds. Otherwise the address may be wrong.</p>
        <Link href="/"><button>Browse tokens</button></Link>
      </div>
    );
  }

  return (
    <div className="token-wrap">
      <div className="token-page">
        <div className="token-main">
          <CoinChartPanel token={detail?.token} curve={curve} usd={eth.usd} liveTrade={liveTrade} />
          <ActivityTabs trades={detail?.recentTrades ?? null} holders={detail?.holders ?? null} symbol={detail?.token.symbol} creator={detail?.token.creator} usd={eth.usd} />
        </div>
        <div className="token-side">
          <PositionPanel curve={curve} symbol={detail?.token.symbol} />
          <TradePanel curve={curve} usd={eth.usd} />
          <HoldersPanel holders={detail?.holders ?? null} token={detail?.token} creator={detail?.token.creator} />
        </div>
      </div>
    </div>
  );
}

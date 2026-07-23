"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
  ColorType,
  CrosshairMode,
  createChart,
} from "lightweight-charts";
import { useReadContract } from "wagmi";
import { type Address, zeroAddress } from "viem";
import { fetchCandles, fetchDevTrades, type Candle, type DevTrade, type TradeEvent } from "@/lib/api";
import { UNISWAP_ROUTER, WETH, uniswapConfigured, uniswapRouterAbi } from "@/lib/uniswap";
import { compactUsd } from "../board/TokenCard";

const INTERVALS: { key: string; label: string; secs: number }[] = [
  { key: "1m", label: "1m", secs: 60 },
  { key: "5m", label: "5m", secs: 300 },
  { key: "1h", label: "1h", secs: 3600 },
  { key: "1d", label: "1d", secs: 86400 },
];

const UP = "#1B7A4E";
const DOWN = "#C0392B";

// The chart plots MARKET CAP (like pump.fun), not raw per-token price. Supply is exactly 1e9, so
// marketCapEth = priceEth × 1e9. We then × ethUsd to show it in USD ($5.8K …); ETH fallback if the feed is down.
const TOTAL_SUPPLY = 1e9;
const mcapEthFromPriceEth = (priceEthStr: string) => Number(priceEthStr) * TOTAL_SUPPLY;
const mcapEthFromWei = (wei: string) => Number(wei) / 1e18;

type Bucket = { buyEth: number; sellEth: number; buys: number; sells: number };
type Tip = { x: number; y: number; lines: string[]; sold: boolean };

export function PriceChart({ curve, liveTrade, usd, migrated, token, variant }: { curve: string; liveTrade: TradeEvent | null; usd?: number | null; migrated?: boolean; token?: string; variant?: "embedded" }) {
  const [interval, setInterval] = useState("1m");
  const [empty, setEmpty] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastRef = useRef<CandlestickData | null>(null);
  // dev-trade markers: raw trades + a per-bucket aggregate the crosshair tooltip reads.
  const devTradesRef = useRef<DevTrade[]>([]);
  const bucketMapRef = useRef<Map<number, Bucket>>(new Map());
  const intervalRef = useRef(interval);
  intervalRef.current = interval;
  // current scale (×ethUsd) + USD-mode, read live by the axis formatter without recreating the series.
  const scaleRef = useRef(1);
  const usdModeRef = useRef(false);
  scaleRef.current = usd ?? 1;
  usdModeRef.current = usd != null;

  // After graduation there are no more curve trades, so the chart would freeze. Poll the Uniswap pool spot price
  // (ETH out for 1 whole token) and keep the chart live on the DEX price.
  const { data: poolAmounts } = useReadContract({
    address: UNISWAP_ROUTER,
    abi: uniswapRouterAbi,
    functionName: "getAmountsOut",
    args: [10n ** 18n, [(token ?? zeroAddress) as Address, WETH]],
    query: { enabled: !!migrated && uniswapConfigured && !!token, refetchInterval: 3000 },
  });

  // Mark each creator trade on the chart: a green "DEV" circle below the bar for a buy, a red one above for a
  // sell. Multiple trades in the same bar stack (so 2 dev sells show as two red dots above each other). The
  // per-bucket aggregate is also kept for the hover tooltip.
  const applyMarkers = useCallback(() => {
    const series = seriesRef.current;
    if (!series) return;
    const secs = INTERVALS.find((i) => i.key === intervalRef.current)!.secs;
    const map = new Map<number, Bucket>();
    const markers: SeriesMarker<Time>[] = [];
    const labeled = new Set<string>(); // show the "DEV" label once per bar+side; the rest stack as plain dots
    // ONE marker per dev trade (time-sorted) → multiple trades in the same bar stack above/below each other.
    const sorted = [...devTradesRef.current].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    for (const d of sorted) {
      const b = Math.floor(Number(d.timestamp) / secs) * secs;
      const e = map.get(b) ?? { buyEth: 0, sellEth: 0, buys: 0, sells: 0 };
      const eth = Number(d.ethWei) / 1e18;
      if (d.isBuy) {
        e.buyEth += eth;
        e.buys++;
      } else {
        e.sellEth += eth;
        e.sells++;
      }
      map.set(b, e);
      const key = `${b}-${d.isBuy ? "b" : "s"}`;
      const first = !labeled.has(key);
      labeled.add(key);
      markers.push({
        time: b as Time,
        position: d.isBuy ? "belowBar" : "aboveBar", // buys below (green), sells above (red)
        color: d.isBuy ? UP : DOWN,
        shape: "circle",
        text: first ? "DEV" : "",
        size: 1.1,
      });
    }
    bucketMapRef.current = map;
    series.setMarkers(markers);
  }, []);

  // build the chart once
  useEffect(() => {
    if (!wrapRef.current) return;
    const chart = createChart(wrapRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#6E6E73", fontSize: 11 },
      grid: { vertLines: { color: "#ECECEE" }, horzLines: { color: "#ECECEE" } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#ECECEE", barSpacing: 14, minBarSpacing: 4, rightOffset: 5 },
      rightPriceScale: { borderColor: "#ECECEE" },
    });
    const series = chart.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceFormat: {
        type: "custom",
        minMove: 0.0001,
        formatter: (v: number) =>
          usdModeRef.current ? compactUsd(v) ?? `$${v.toFixed(2)}` : `${v >= 1 ? v.toFixed(3) : v.toFixed(5)} Ξ`,
      },
    });
    chartRef.current = chart;
    seriesRef.current = series;

    // hover tooltip for dev-trade markers
    chart.subscribeCrosshairMove((param) => {
      const t = param.time as number | undefined;
      const v = t != null ? bucketMapRef.current.get(t) : undefined;
      if (!v || !param.point) {
        setTip(null);
        return;
      }
      const lines: string[] = [];
      if (v.buys) lines.push(`Dev bought ${v.buyEth.toFixed(3)} ETH${v.buys > 1 ? ` · ${v.buys}×` : ""}`);
      if (v.sells) lines.push(`Dev sold ${v.sellEth.toFixed(3)} ETH${v.sells > 1 ? ` · ${v.sells}×` : ""}`);
      // clamp x so the centered tooltip never overflows the panel edge (it lives inside overflow:hidden when embedded)
      const wrapW = wrapRef.current?.clientWidth ?? 0;
      const x = wrapW ? Math.max(78, Math.min(param.point.x, wrapW - 78)) : param.point.x;
      setTip({ x, y: param.point.y, lines, sold: v.sellEth > v.buyEth });
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // fetch the creator's trades once per token → markers
  useEffect(() => {
    let alive = true;
    devTradesRef.current = [];
    bucketMapRef.current = new Map();
    fetchDevTrades(curve)
      .then((d) => {
        if (!alive) return;
        devTradesRef.current = d;
        applyMarkers();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [curve, applyMarkers]);

  // load candle series whenever the interval (or USD scale) changes
  useEffect(() => {
    let alive = true;
    const scale = usd ?? 1;
    (async () => {
      try {
        const candles: Candle[] = await fetchCandles(curve, interval);
        if (!alive || !seriesRef.current) return;
        const data: CandlestickData[] = candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: mcapEthFromPriceEth(c.open) * scale,
          high: mcapEthFromPriceEth(c.high) * scale,
          low: mcapEthFromPriceEth(c.low) * scale,
          close: mcapEthFromPriceEth(c.close) * scale,
        }));
        seriesRef.current.setData(data);
        lastRef.current = data[data.length - 1] ?? null;
        setEmpty(data.length === 0);
        applyMarkers(); // re-bucket markers for this interval, after the bars exist
        // keep candles a fixed (thin) width instead of fitContent stretching a few bars fat across the panel
        chartRef.current?.timeScale().scrollToRealTime();
      } catch {
        setEmpty(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [curve, interval, usd, applyMarkers]);

  // apply a streamed trade to the live (current-bucket) candle
  useEffect(() => {
    if (!liveTrade || !seriesRef.current) return;
    if (liveTrade.curve.toLowerCase() !== curve.toLowerCase()) return;

    const secs = INTERVALS.find((i) => i.key === interval)!.secs;
    const bucket = (Math.floor(Number(liveTrade.timestamp) / secs) * secs) as UTCTimestamp;
    const val = mcapEthFromWei(liveTrade.marketCapWei) * (usd ?? 1); // exact mcap from the trade
    const last = lastRef.current;

    let candle: CandlestickData;
    if (!last || (last.time as number) < (bucket as number)) {
      candle = { time: bucket, open: last ? last.close : val, high: val, low: val, close: val };
    } else if ((last.time as number) === (bucket as number)) {
      candle = { time: bucket, open: last.open, high: Math.max(last.high, val), low: Math.min(last.low, val), close: val };
    } else {
      return; // out-of-order; ignore
    }
    seriesRef.current.update(candle);
    lastRef.current = candle;
    setEmpty(false);
  }, [liveTrade, curve, interval, usd]);

  // graduated: drive the live candle from the Uniswap pool spot price (no more curve trades arrive)
  useEffect(() => {
    if (!migrated || !seriesRef.current) return;
    const out = poolAmounts?.[1];
    if (out === undefined || out === 0n) return;
    const priceEth = Number(out) / 1e18; // ETH per 1 whole token (≈ spot; 0.3% fee is a constant offset)
    const val = priceEth * TOTAL_SUPPLY * (usd ?? 1);
    const secs = INTERVALS.find((i) => i.key === interval)!.secs;
    const bucket = (Math.floor(Date.now() / 1000 / secs) * secs) as UTCTimestamp;
    const last = lastRef.current;
    let candle: CandlestickData;
    if (!last || (last.time as number) < (bucket as number)) {
      candle = { time: bucket, open: last ? last.close : val, high: val, low: val, close: val };
    } else if ((last.time as number) === (bucket as number)) {
      candle = { time: bucket, open: last.open, high: Math.max(last.high, val), low: Math.min(last.low, val), close: val };
    } else {
      return;
    }
    seriesRef.current.update(candle);
    lastRef.current = candle;
    setEmpty(false);
  }, [poolAmounts, migrated, interval, usd]);

  const head = (
    <div className={variant === "embedded" ? "ci-chart-head" : "chart-head"}>
      <h3>Market cap <span className="muted">· {usd != null ? "USD" : "ETH"}{migrated ? " · Uniswap" : ""}</span></h3>
      <div className="chart-intervals">
        {INTERVALS.map((i) => (
          <button key={i.key} className={interval === i.key ? "active" : ""} onClick={() => setInterval(i.key)}>
            {i.label}
          </button>
        ))}
      </div>
    </div>
  );
  const body = (
    <div className={`chart-canvas-wrap${variant === "embedded" ? " ci-chart-canvas" : ""}`}>
      <div className="chart-wrap" ref={wrapRef} />
      {tip && tip.lines.length > 0 && (
        <div className="chart-tip" style={{ left: tip.x, top: tip.y, borderColor: tip.sold ? DOWN : UP }}>
          <span className="chart-tip-dev" style={{ color: tip.sold ? DOWN : UP }}>● DEV</span>
          {tip.lines.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
      {empty && <div className="chart-empty">No trades yet — the chart starts on the first trade.</div>}
    </div>
  );

  // Embedded in the CoinChartPanel (no own panel chrome — head pairs flush with the strip above + chart below).
  if (variant === "embedded") return <>{head}{body}</>;
  return <div className="panel chart-panel">{head}{body}</div>;
}

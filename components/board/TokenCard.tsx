"use client";

import Link from "next/link";
import { avatarStyle } from "@/lib/avatar";
import { useEffect, useRef, useState } from "react";
import type { TokenSummary } from "@/lib/api";
import { TokenImage } from "@/components/TokenImage";
import { IconCrown } from "@/components/icons";

export function timeAgo(unix: string) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - Number(unix));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
export function compactEth(n: string) {
  const x = Number(n);
  if (!isFinite(x)) return n;
  if (x === 0) return "0";
  // sign-aware: thresholds use the magnitude so negatives (e.g. PnL −0.00199) never fall into toExponential
  const a = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (a < 1e-6) return sign + a.toExponential(2);
  if (a < 1) return sign + a.toPrecision(3);
  return sign + a.toLocaleString(undefined, { maximumSignificantDigits: 4 });
}
export function compactUsd(v: number | null | undefined): string | null {
  if (v == null || !isFinite(v)) return null;
  if (v === 0) return "$0.00";
  // sign-aware + no scientific notation (was showing "$0.00e+0" for 0 and tiny values)
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(2)}k`;
  if (a >= 0.01) return `${sign}$${a.toFixed(2)}`;
  return `${sign}<$0.01`;
}

/// Compact a token AMOUNT given in wei (18 decimals). B/M/k suffixes for big numbers, thousands-separated for
/// whole counts, and fractional precision for sub-1-token dust (so a 0.5-token buy isn't shown as "0").
export function compactTokens(wei: string): string {
  const x = Number(wei) / 1e18;
  if (!isFinite(x) || x === 0) return "0";
  const a = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)}k`;
  if (a >= 1) return `${sign}${Math.round(a).toLocaleString()}`;
  return `${sign}${a.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`; // dust: show fraction, trim trailing zeros
}

export function TokenCard({
  t,
  isNew,
  ethUsd,
  isKing,
}: {
  t: TokenSummary;
  isNew?: boolean;
  ethUsd?: number | null;
  isKing?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, t.bondingProgressPct));

  // brief flash whenever the live market cap changes (streamed trade)
  const [flash, setFlash] = useState(false);
  const prev = useRef(t.marketCapWei);
  useEffect(() => {
    if (prev.current !== t.marketCapWei) {
      prev.current = t.marketCapWei;
      setFlash(true);
      const id = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(id);
    }
  }, [t.marketCapWei]);

  return (
    <Link href={`/token/${t.curve}`} className={`tcard${isNew ? " tcard-new" : ""}${isKing ? " tcard-king" : ""}`}>
      <div className="tcard-img">
        <TokenImage src={t.imageUrl} alt={t.symbol} seed={t.symbol} label={t.symbol} nsfw={t.nsfw} className="tcard-media" />
        <div className="tcard-badges">
          {isKing && <span className="badge-king"><IconCrown size={11} /> KING</span>}
          {t.readyToGraduate && <span className="badge-grad">ready</span>}
        </div>
      </div>

      <div className="tcard-body">
        <div className="tcard-id">
          <span className="tname" title={t.name}>{t.name}</span>
          <span className="tticker">${t.symbol}</span>
        </div>

        <div className={`tmcap${flash ? " flash" : ""}`}>
          <span className="tmcap-main">{ethUsd != null ? compactUsd(Number(t.marketCapEth) * ethUsd) : `${compactEth(t.marketCapEth)} ETH`}</span>
          <span className="tmcap-label">MC</span>
        </div>

        <div className="tcard-by">
          <span className="tcard-blockie" style={avatarStyle(t.creator)} />
          <span className="tcard-by-addr">{t.creator.slice(0, 6)}…{t.creator.slice(-4)}</span>
          <span className="tcard-by-age">{timeAgo(t.createdAt)} ago</span>
        </div>

        <div className="tprogress"><div style={{ width: `${pct}%` }} /></div>
      </div>
    </Link>
  );
}

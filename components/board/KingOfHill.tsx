"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { TokenSummary } from "@/lib/api";
import { compactEth, compactUsd } from "./TokenCard";
import { TokenImage } from "@/components/TokenImage";
import { IconFlame } from "@/components/icons";

// King-of-the-Hill banner: the coin closest to graduating. A meme-art backdrop (public/koth-bg.jpg) fills the
// banner; the crowned coin's info is overlaid on the dark right side. The board owns the live `king` state.
export function KingOfHill({ king, ethUsd }: { king: TokenSummary | null; ethUsd?: number | null }) {
  const [swap, setSwap] = useState(false);
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (!king) {
      prev.current = null;
      return;
    }
    if (prev.current && prev.current !== king.curve) {
      setSwap(true);
      prev.current = king.curve;
      const id = setTimeout(() => setSwap(false), 1700);
      return () => clearTimeout(id);
    }
    prev.current = king.curve;
  }, [king?.curve, king]);

  if (!king) return null;

  const pct = king.bondingProgressPct ?? Math.round((king.bondingProgress ?? 0) * 1000) / 10;
  const mcUsd = king.marketCapUsd ?? (ethUsd != null ? Number(king.marketCapEth) * ethUsd : null);
  const ready = king.complete && !king.migrated;

  return (
    <Link href={`/token/${king.curve}`} className={`koth${swap ? " koth-swap" : ""}`}>
      <div className="koth-overlay">
        <div className="koth-label"><IconFlame size={12} /> King of the Hill</div>
        <div className="koth-name">
          <TokenImage src={king.imageUrl} alt={king.symbol} seed={king.symbol} label={king.symbol} nsfw={king.nsfw} className="koth-av" />
          <span>{king.name} <span className="muted">${king.symbol}</span></span>
        </div>
        <div className="koth-mc-val">{mcUsd != null ? compactUsd(mcUsd) : `${compactEth(king.marketCapEth)} ETH`}</div>
        <div className="koth-bar"><div style={{ width: `${Math.min(pct, 100)}%` }} /></div>
        <div className="koth-bar-meta">
          <span>{ready ? "Ready to graduate 🎓" : `${pct.toFixed(1)}% to graduation`}</span>
          <span className="muted">{king.holderCount} holders</span>
        </div>
      </div>
    </Link>
  );
}

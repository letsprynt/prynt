"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import { fetchPosition, type Position } from "@/lib/api";
import { compactEth, compactTokens, compactUsd } from "../board/TokenCard";

// Connected wallet's position in this token: holding, value, and realized+unrealized PnL.
// Read-only/display — fetched from the indexer, never touches the trade path.
export function PositionPanel({ curve, symbol }: { curve: Address; symbol?: string }) {
  const { address, isConnected } = useAccount();
  const [pos, setPos] = useState<Position | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    try {
      setPos(await fetchPosition(curve, address));
    } catch {
      /* keep last good position */
    }
  }, [curve, address]);

  useEffect(() => {
    setPos(null);
    if (!isConnected) return;
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load, isConnected]);

  if (!isConnected || !pos || !pos.hasPosition) return null;

  const pnlNum = Number(pos.pnlEth);
  const flat = pnlNum === 0;
  const pnlAbs = compactEth(String(Math.abs(pnlNum)));
  const sign = flat ? "" : pos.pnlUp ? "+" : "−";
  const pnlClass = flat ? "" : pos.pnlUp ? "up" : "down";

  return (
    <div className="panel pos-panel">
      <h3>Your position</h3>
      <div className="pos-grid">
        <div className="pos-cell">
          <span className="muted">Holding</span>
          <strong>{compactTokens(pos.balance)}{symbol ? ` ${symbol}` : ""}</strong>
        </div>
        <div className="pos-cell">
          <span className="muted">Value</span>
          <strong>{pos.valueUsd != null ? compactUsd(pos.valueUsd) : `${compactEth(pos.valueEth)} ETH`}</strong>
        </div>
        <div className="pos-cell">
          <span className="muted">PnL</span>
          <strong className={pnlClass}>
            {sign}{pnlAbs} ETH{pos.pnlPct != null ? ` (${sign}${Math.abs(pos.pnlPct).toFixed(1)}%)` : ""}
          </strong>
        </div>
      </div>
      <div className="note">
        Bought {compactEth(pos.boughtEth)} · sold {compactEth(pos.soldEth)} ETH over {pos.trades} trade{pos.trades === 1 ? "" : "s"}.
      </div>
    </div>
  );
}

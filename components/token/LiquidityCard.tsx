"use client";

import { useReadContracts } from "wagmi";
import { type Address, formatEther, zeroAddress } from "viem";
import type { TokenSummary } from "@/lib/api";
import { WETH, uniswapConfigured, uniswapPairAbi } from "@/lib/uniswap";
import { addressUrl } from "@/lib/explorer";
import { compactEth, compactTokens, compactUsd } from "../board/TokenCard";
import { IconDrop, IconLock } from "@/components/icons";

const DEAD = "0x000000000000000000000000000000000000dEaD" as Address;

// Pump.fun-style liquidity view, shown from the coin's first moment:
//  - on the bonding curve: how much ETH currently backs it + progress to graduation + that LP burns on graduation.
//  - after graduation: the live Uniswap pool liquidity + PROOF that 100% of the LP is burned (locked forever).
export function LiquidityCard({ token, usd }: { token?: TokenSummary; usd?: number | null }) {
  const migrated = !!token?.migrated;
  const pair = (token?.pair ?? undefined) as Address | undefined;

  const { data } = useReadContracts({
    contracts: [
      { address: pair ?? zeroAddress, abi: uniswapPairAbi, functionName: "getReserves" },
      { address: pair ?? zeroAddress, abi: uniswapPairAbi, functionName: "totalSupply" },
      { address: pair ?? zeroAddress, abi: uniswapPairAbi, functionName: "balanceOf", args: [DEAD] },
    ],
    query: { enabled: migrated && uniswapConfigured && !!pair, refetchInterval: 15000 },
  });

  if (!token) return null;
  const sym = token.symbol;
  const usdTag = (eth: number) => (usd != null ? <span className="muted"> · {compactUsd(eth * usd)}</span> : null);

  // ---- POST-GRADUATION: live pool + LP-burn proof ----
  if (migrated) {
    const reserves = data?.[0]?.result as readonly [bigint, bigint, number] | undefined;
    const totalLp = data?.[1]?.result as bigint | undefined;
    const burnedLp = data?.[2]?.result as bigint | undefined;

    let pooledEth: number | null = null;
    let pooledTokWei: bigint | null = null;
    if (reserves && token.token) {
      const tokenIsToken0 = token.token.toLowerCase() < WETH.toLowerCase();
      pooledEth = Number(formatEther(tokenIsToken0 ? reserves[1] : reserves[0]));
      pooledTokWei = tokenIsToken0 ? reserves[0] : reserves[1];
    }
    const lockedPct = totalLp && totalLp > 0n && burnedLp != null ? Number((burnedLp * 10000n) / totalLp) / 100 : null;
    const lockedLabel = lockedPct == null ? "100%" : `${lockedPct >= 99.9 ? 100 : lockedPct}%`;
    // headline = TVL (both sides) so it matches the "Liquidity" stat in the header (= 2 × the ETH side)
    const tvl = token.liquidityEth != null ? Number(token.liquidityEth) : pooledEth != null ? pooledEth * 2 : null;

    return (
      <div className="panel liq-card">
        <div className="liq-head"><IconDrop size={15} /> Liquidity <span className="muted" style={{ fontSize: 11, fontWeight: 600 }}>· Uniswap V2</span></div>
        <div className="liq-row">
          <span className="muted">Total value locked</span>
          <span className="liq-val">{tvl != null ? <>{compactEth(String(tvl))} ETH{usdTag(tvl)}</> : "—"}</span>
        </div>
        {pooledEth != null && (
          <div className="liq-row"><span className="muted">Pooled ETH</span><span className="liq-val">{compactEth(String(pooledEth))}</span></div>
        )}
        {pooledTokWei != null && (
          <div className="liq-row"><span className="muted">Pooled {sym}</span><span className="liq-val">{compactTokens(String(pooledTokWei))}</span></div>
        )}
        <div className="liq-lock">
          <span className="liq-lock-badge"><IconLock size={13} /> {lockedLabel} of LP burned — locked forever</span>
          <span className="muted liq-lock-sub">Sent to 0x…dEaD at graduation. Nobody — not even the creator — can ever pull it.</span>
        </div>
        {pair && addressUrl(pair) && <a className="liq-link" href={addressUrl(pair)!} target="_blank" rel="noopener noreferrer">View pool ↗</a>}
      </div>
    );
  }

  // ---- PRE-GRADUATION: virtual (curve) liquidity + what happens at graduation ----
  const vLiq = token.liquidityEth ? Number(token.liquidityEth) : 0;
  const toGrad = token.ethToGraduateEth != null ? Number(token.ethToGraduateEth) : null;
  const pct = Math.max(0, Math.min(100, token.bondingProgressPct ?? 0));

  return (
    <div className="panel liq-card">
      <div className="liq-head"><IconDrop size={15} /> Liquidity</div>
      <div className="liq-row">
        <span className="muted">Virtual liquidity</span>
        <span className="liq-val">{compactEth(String(vLiq))} ETH{usdTag(vLiq)}</span>
      </div>
      <div className="liq-bar"><div style={{ width: `${pct}%` }} /></div>
      <div className="liq-row">
        <span className="muted">{pct.toFixed(1)}% to graduation</span>
        {toGrad != null && toGrad > 0 && <span className="liq-val">~{compactEth(String(toGrad))} ETH left</span>}
      </div>
      <div className="liq-lock">
        <span className="liq-lock-badge pending"><IconLock size={13} /> LP burns on graduation</span>
        <span className="muted liq-lock-sub">When the curve fills, all liquidity seeds a Uniswap pool and 100% of the LP is burned to 0x…dEaD — permanently locked.</span>
      </div>
    </div>
  );
}

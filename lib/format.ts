import { formatEther } from "viem";
import { getBlock } from "wagmi/actions";
import type { Config } from "wagmi";

/// Format a wei value as a trimmed ETH string with `dp` decimals.
export function fmtEth(wei: bigint | undefined, dp = 5): string {
  if (wei === undefined) return "–";
  const s = formatEther(wei);
  const n = Number(s);
  if (n === 0) return "0";
  if (n < 10 ** -dp) return `<${10 ** -dp}`;
  return n.toLocaleString(undefined, { maximumFractionDigits: dp });
}

/// Format an 18-decimal token amount with thousands separators. Sub-1-token amounts keep up to 4 significant
/// fractional digits so a small buy isn't shown as "0" (e.g. 0.5-token quote must not read "≈ 0 TOKEN").
export function fmtTokens(amount: bigint | undefined, dp = 2): string {
  if (amount === undefined) return "–";
  const ONE = 10n ** 18n;
  if (amount < ONE && amount > 0n) {
    const frac = Number(amount) / 1e18;
    return frac.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }
  return (amount / ONE).toLocaleString();
}

/// Convert a 1e18-scaled fraction (e.g. bondingProgress) to a percentage number with 2dp.
export function pctFrom1e18(x: bigint | undefined): number {
  if (x === undefined) return 0;
  return Number((x * 10000n) / 10n ** 18n) / 100;
}

export function shortAddr(a?: string): string {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/// A trade deadline `secs` seconds from now, as a uint256-friendly bigint.
export function deadlineFromNow(secs = 600): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + secs);
}

/// Deadline based on the CHAIN's latest block timestamp (+secs) — immune to a wrong/slow client clock, which
/// otherwise makes trades revert with Expired(). Falls back to the local clock if the read fails.
export async function chainDeadline(config: Config, secs = 600): Promise<bigint> {
  try {
    const blk = await getBlock(config);
    return blk.timestamp + BigInt(secs);
  } catch {
    return deadlineFromNow(secs);
  }
}

/// Apply `bps` basis points of negative slippage to an amount (for minOut bounds).
export function applySlippage(amount: bigint, bps = 100): bigint {
  const out = (amount * BigInt(10000 - bps)) / 10000n;
  // Never silently drop minOut to 0 on a dust-sized quote — that would remove all slippage protection.
  return out === 0n && amount > 0n ? 1n : out;
}

"use client";

/// DEV-ONLY visual harness for the profile EarningsCard (all three states, mock data — no wallet needed).
/// Excluded from production: guarded by NODE_ENV, never linked from the app.

import { notFound } from "next/navigation";
import { EarningsCardView } from "@/components/profile/EarningsCard";
import { useMounted } from "@/lib/useMounted";
import type { CreatorEarnings } from "@/lib/api";

const DAY = 86_400;
const today = Math.floor(Date.now() / 1000 / DAY) * DAY;

// A plausible month: quiet start, viral middle spike, steady tail.
const daily = [22, 19, 15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  .map((back, i) => ({
    day: today - back * DAY,
    earnedWei: String(BigInt([3, 5, 2, 9, 14, 48, 120, 260, 175, 96, 60, 44, 71, 38, 52][i]) * 10n ** 15n),
  }));

const mock: CreatorEarnings = {
  totalEarnedWei: String(1_243n * 10n ** 15n),
  totalClaimedWei: String(816n * 10n ** 15n),
  perToken: [
    { token: "0x01", curve: "0xc1", symbol: "NOXA", name: "Noxa", imageUrl: null, earnedWei: String(872n * 10n ** 15n), lastAt: today - 3600 },
    { token: "0x02", curve: "0xc2", symbol: "GLOOM", name: "Gloomcore", imageUrl: null, earnedWei: String(305n * 10n ** 15n), lastAt: today - 5 * DAY },
    { token: "0x03", curve: null, symbol: "DUST", name: "Dust Bunny", imageUrl: null, earnedWei: String(66n * 10n ** 15n), lastAt: today - 12 * DAY },
  ],
  claims: [
    { txHash: "0xaaa1", to: "0x2222222222222222222222222222222222222222", amountWei: String(500n * 10n ** 15n), timestamp: today - 2 * DAY },
    { txHash: "0xaaa2", to: "0x1111111111111111111111111111111111111111", amountWei: String(316n * 10n ** 15n), timestamp: today - 9 * DAY },
  ],
  daily,
};

const noop = () => {};
const base = {
  usd: null as string | null,
  submitting: false,
  justClaimed: false,
  wrongNetwork: false,
  toOpen: false,
  toAddr: "",
  onClaim: noop,
  onClaimTo: noop,
  onToggleTo: noop,
  onToAddrChange: noop,
  onSwitchNetwork: noop,
};

export default function EarningsPreview() {
  // client-only render: the Date.now()-based mock would otherwise hydration-mismatch the SSR pass
  const mounted = useMounted();
  if (process.env.NODE_ENV === "production") notFound();
  if (!mounted) return null;
  return (
    <div style={{ maxWidth: 620, margin: "40px auto", display: "flex", flexDirection: "column", gap: 24, padding: "0 16px" }}>
      <h1 style={{ fontSize: 15 }}>EarningsCard preview (dev only)</h1>
      <EarningsCardView {...base} loading={false} claimable={427n * 10n ** 15n} usd="$1.2K" earnings={mock} />
      <EarningsCardView {...base} loading={false} claimable={0n} earnings={{ totalEarnedWei: "0", totalClaimedWei: "0", perToken: [], claims: [], daily: [] }} />
      <EarningsCardView {...base} loading={true} claimable={undefined} earnings={null} />
    </div>
  );
}

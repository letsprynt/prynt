"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Address, formatEther, isAddress } from "viem";
import { useAccount, useConfig, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { activeChain } from "@/lib/wagmi";
import { FEE_MANAGER_ADDRESS, feeManagerAbi, feeManagerConfigured } from "@/lib/contracts";
import { fetchCreatorEarnings, safeBig, useEthUsd, type CreatorEarnings, type CreatorFeeDay } from "@/lib/api";
import { fmtEth, shortAddr } from "@/lib/format";
import { txUrl } from "@/lib/explorer";
import { compactUsd, timeAgo } from "@/components/board/TokenCard";
import { TokenImage } from "@/components/TokenImage";
import { useMounted } from "@/lib/useMounted";
import { shortTxError, useToast } from "@/lib/toast";

const DAY = 86_400;

/// "Earned — last 30 days" mini column chart. One series (no legend — the title names it); sparse
/// `daily` buckets fill a fixed 30-slot window. Bars: rounded data-end, square baseline, surface gaps;
/// each slot carries a full-height hit target with an HTML tooltip (hover + keyboard focus).
function EarnSparkbars({ daily }: { daily: CreatorFeeDay[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const { slots, maxWei, windowTotal } = useMemo(() => {
    // Anchor the window to the newest data day, not just the client clock — a skewed/stale client clock
    // would otherwise silently drop the indexer's newest (or oldest) bucket at a UTC-midnight edge.
    const clientToday = Math.floor(Date.now() / 1000 / DAY) * DAY;
    const today = Math.max(clientToday, ...daily.map((d) => d.day));
    const byDay = new Map(daily.map((d) => [d.day, safeBig(d.earnedWei)]));
    const s = Array.from({ length: 30 }, (_, i) => {
      const day = today - (29 - i) * DAY;
      return { day, wei: byDay.get(day) ?? 0n };
    });
    const max = s.reduce((m, d) => (d.wei > m ? d.wei : m), 0n);
    const total = s.reduce((t, d) => t + d.wei, 0n);
    return { slots: s, maxWei: max, windowTotal: total };
  }, [daily]);

  if (maxWei === 0n) return null;

  const maxEth = Number(formatEther(maxWei));
  const hovered = hover !== null ? slots[hover] : null;

  return (
    <div className="earn-chart earn-sec">
      <div className="earn-chart-head">
        <span className="earn-chart-title">Earned · last 30 days</span>
        <span className="earn-chart-total">{fmtEth(windowTotal)} ETH</span>
      </div>
      <div className="earn-chart-plot">
        {/* 30 columns; each is its own full-height hit target (bigger than the mark), keyboard-reachable.
            Bars are divs so the 4px data-end radius stays uniform at any card width. */}
        <div className="earn-chart-cols" onPointerLeave={() => setHover(null)}>
          {slots.map((s, i) => (
            <button
              key={s.day}
              type="button"
              className="earn-chart-col"
              tabIndex={s.wei > 0n ? 0 : -1}
              aria-label={`${new Date(s.day * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${fmtEth(s.wei)} ETH`}
              onPointerEnter={() => { if (s.wei > 0n) setHover(i); else setHover(null); }}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              {s.wei > 0n && (
                <span
                  className={`earn-chart-bar${hover === i ? " hovered" : ""}`}
                  style={{ height: `${Math.max(4, (Number(formatEther(s.wei)) / maxEth) * 100)}%` }}
                />
              )}
            </button>
          ))}
        </div>
        {hovered && hovered.wei > 0n && (
          // clamp so edge-slot tooltips stay inside the card's overflow:hidden box
          <div className="earn-chart-tip" style={{ left: `${Math.min(91, Math.max(9, ((hover! + 0.5) / 30) * 100))}%` }} role="status">
            <strong>{fmtEth(hovered.wei)} ETH</strong>
            <span>{new Date(hovered.day * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export type EarningsView = {
  loading: boolean;
  claimable: bigint | undefined;
  usd: string | null; // "≈ $x" source value, already compacted
  earnings: CreatorEarnings | null;
  submitting: boolean;
  justClaimed: boolean;
  wrongNetwork: boolean;
  toOpen: boolean;
  toAddr: string;
  onClaim: () => void;
  onClaimTo: () => void;
  onToggleTo: () => void;
  onToAddrChange: (v: string) => void;
  onSwitchNetwork: () => void;
};

/// Pure presentation — everything on-screen comes in as props (also rendered by /dev/earnings-preview).
export function EarningsCardView(v: EarningsView) {
  const earned = v.earnings ? safeBig(v.earnings.totalEarnedWei) : 0n;
  const claimed = v.earnings ? safeBig(v.earnings.totalClaimedWei) : 0n;
  const hasHistory = v.earnings !== null && (earned > 0n || claimed > 0n);
  const isEmpty = !v.loading && (v.claimable ?? 0n) === 0n && v.earnings !== null && !hasHistory;

  return (
    <div className="panel earn-card">
      <div className="earn-head">
        <span className="ref-label">Creator earnings</span>
        <span className="ref-sub muted">You earn 0.5% of every trade on your coins — bonding curve and DEX. Paid in ETH, claim any time.</span>
      </div>

      <div className="earn-hero">
        <div className="earn-claimable">
          <span className="earn-claimable-sub muted">Claimable now</span>
          {v.loading ? (
            <span className="earn-claimable-val earn-skeleton" aria-hidden="true" />
          ) : (
            <span className={`earn-claimable-val${v.justClaimed ? " claimed-pulse" : ""}`}>
              {fmtEth(v.claimable)} <span className="earn-claimable-unit">ETH</span>
            </span>
          )}
          <span className="earn-claimable-usd">{v.usd && v.claimable !== undefined && v.claimable > 0n ? `≈ ${v.usd}` : " "}</span>
        </div>
        {v.wrongNetwork ? (
          <button className="switch-btn" onClick={v.onSwitchNetwork}>Switch to {activeChain.name}</button>
        ) : (
          <div className="earn-actions">
            <button
              className={`earn-claim-btn${v.justClaimed ? " success" : ""}`}
              onClick={v.onClaim}
              disabled={v.submitting || !v.claimable}
            >
              {v.justClaimed ? "Claimed ✓" : v.submitting ? "Submitting…" : v.loading ? "Claim" : v.claimable && v.claimable > 0n ? `Claim ${fmtEth(v.claimable)} ETH` : "Nothing to claim yet"}
            </button>
            <button className="earn-alt-toggle" onClick={v.onToggleTo}>
              {v.toOpen ? "Claim to my wallet instead" : "Claim to another address"}
            </button>
          </div>
        )}
      </div>

      {v.toOpen && !v.wrongNetwork && (
        <div className="earn-to-row">
          <input value={v.toAddr} onChange={(e) => v.onToAddrChange(e.target.value.trim())} placeholder="0x… destination address" />
          <button className="secondary" onClick={v.onClaimTo} disabled={v.submitting || !v.claimable || !isAddress(v.toAddr)}>Claim to</button>
        </div>
      )}

      {isEmpty && (
        <div className="earn-empty earn-sec">
          <span className="earn-empty-spark" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" fill="currentColor" /></svg>
          </span>
          <div>
            <strong>No creator fees yet.</strong>
            <span className="muted"> Launch a coin and every bonding-curve trade on it pays you 0.5% — the fees land here.</span>
          </div>
        </div>
      )}

      {hasHistory && (
        <div className="earn-stats earn-sec">
          <div className="earn-stat">
            <span className="earn-stat-val">{fmtEth(earned)} ETH</span>
            <span className="earn-stat-label muted">Lifetime earned</span>
          </div>
          <div className="earn-stat">
            <span className="earn-stat-val">{fmtEth(claimed)} ETH</span>
            <span className="earn-stat-label muted">Claimed</span>
          </div>
          <div className="earn-stat">
            <span className="earn-stat-val">{v.earnings!.perToken.length}</span>
            <span className="earn-stat-label muted">{v.earnings!.perToken.length === 1 ? "Coin earning" : "Coins earning"}</span>
          </div>
        </div>
      )}

      {v.earnings?.daily && v.earnings.daily.length > 0 && <EarnSparkbars daily={v.earnings.daily} />}

      {v.earnings && v.earnings.perToken.length > 0 && (
        <div className="earn-list earn-sec">
          <span className="ref-label">By coin</span>
          {v.earnings.perToken.map((p) => {
            const sym = p.symbol ?? shortAddr(p.token); // null when the indexer doesn't know the token
            const body = (
              <>
                <TokenImage src={p.imageUrl} alt={sym} seed={sym} label={sym} className="earn-row-img" />
                <span className="earn-row-id"><strong>{p.name ?? shortAddr(p.token)}</strong> <span className="muted">${sym}</span></span>
                <span className="earn-row-val">{fmtEth(safeBig(p.earnedWei))} ETH</span>
                <span className="muted earn-row-age">{timeAgo(String(p.lastAt))} ago</span>
              </>
            );
            return p.curve ? (
              <Link key={p.token} href={`/token/${p.curve}`} className="earn-row earn-row-link">{body}</Link>
            ) : (
              <div key={p.token} className="earn-row">{body}</div>
            );
          })}
        </div>
      )}

      {v.earnings && v.earnings.claims.length > 0 && (
        <div className="earn-list earn-sec">
          <span className="ref-label">Recent claims</span>
          {v.earnings.claims.slice(0, 5).map((c, i) => (
            <div key={`${c.txHash}-${i}`} className="earn-row">
              <span className="earn-row-id"><span className="muted">to </span>{shortAddr(c.to)}</span>
              <span className="earn-row-val">{fmtEth(safeBig(c.amountWei))} ETH</span>
              <span className="muted earn-row-age">{timeAgo(String(c.timestamp))} ago</span>
              {txUrl(c.txHash) && (
                <a className="muted earn-row-tx" href={txUrl(c.txHash)!} target="_blank" rel="noopener noreferrer" title="View on explorer">↗</a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Shown only on your OWN profile: your 0.5% creator-fee share (half of the 1% bonding-curve trade fee),
// accrued in ETH inside the FeeManager and claimable any time. The claimable balance is read straight from
// the contract; the lifetime/per-coin/daily breakdown comes from the indexer and degrades gracefully when
// the deployed indexer doesn't serve /api/creator/:address/earnings yet.
export function EarningsCard({ address }: { address: string }) {
  const { address: connected, chainId } = useAccount();
  const mounted = useMounted();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const config = useConfig();
  const toast = useToast();
  const eth = useEthUsd();
  const [submitting, setSubmitting] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [toAddr, setToAddr] = useState("");
  const [earnings, setEarnings] = useState<CreatorEarnings | null>(null);
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false; // StrictMode remounts after running cleanup — reset or the flag sticks in dev
    return () => { unmounted.current = true; };
  }, []);

  const isOwn = mounted && !!connected && connected.toLowerCase() === address.toLowerCase();
  const wrongNetwork = isOwn && chainId !== activeChain.id;

  const { data: claimable, refetch: refetchClaimable } = useReadContract({
    address: FEE_MANAGER_ADDRESS,
    abi: feeManagerAbi,
    functionName: "claimable",
    args: [address as Address],
    query: { enabled: feeManagerConfigured && isOwn, refetchInterval: 5000 },
  });

  useEffect(() => {
    if (!feeManagerConfigured || !isOwn) return;
    let alive = true;
    fetchCreatorEarnings(address)
      .then((d) => { if (alive) setEarnings(d); })
      .catch(() => { /* old indexer without the endpoint — the on-chain claimable/claim above still works */ });
    return () => { alive = false; };
  }, [address, isOwn]);

  if (!feeManagerConfigured || !isOwn) return null;

  // Shared tx lifecycle → toasts: confirm-in-wallet → submitted → success / reverted / rejected.
  async function run(label: string, request: any, successMsg: string, onDone?: () => void) {
    setSubmitting(true);
    const id = toast.loading(`${label}: confirm in your wallet…`);
    try {
      const txHash = await writeContractAsync(request);
      toast.update(id, "loading", `${label}: submitted, waiting for confirmation…`);
      const rec = await waitForTransactionReceipt(config, { hash: txHash });
      if (rec.status === "reverted") {
        toast.update(id, "error", `${label} reverted on-chain`);
      } else {
        toast.update(id, "success", successMsg);
        onDone?.();
      }
    } catch (e) {
      toast.update(id, "error", `${label}: ${shortTxError(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  function afterClaim() {
    refetchClaimable();
    setJustClaimed(true);
    setTimeout(() => { if (!unmounted.current) setJustClaimed(false); }, 2600);
    // The indexer needs a beat to ingest the Claimed event before the history refresh sees it.
    setTimeout(() => {
      if (unmounted.current) return;
      fetchCreatorEarnings(address)
        .then((d) => { if (!unmounted.current) setEarnings(d); })
        .catch(() => { /* indexer may not serve the endpoint yet */ });
    }, 3000);
  }

  const fm = { address: FEE_MANAGER_ADDRESS, abi: feeManagerAbi, chainId: activeChain.id } as const;
  function claim() {
    // claim() reverts NothingToClaim at 0 balance — the button is disabled then, this is just a belt-and-braces guard
    if (!claimable || claimable === 0n) return;
    run("Claim", { ...fm, functionName: "claim" }, "Creator fees claimed 🎉", afterClaim);
  }
  function claimToOther() {
    if (!claimable || claimable === 0n || !isAddress(toAddr)) return;
    run("Claim", { ...fm, functionName: "claimTo", args: [toAddr as Address] }, `Creator fees sent to ${shortAddr(toAddr)}`, () => { setToOpen(false); setToAddr(""); afterClaim(); });
  }

  const usd = eth.usd != null && claimable !== undefined ? compactUsd(Number(formatEther(claimable)) * eth.usd) : null;

  return (
    <EarningsCardView
      loading={claimable === undefined}
      claimable={claimable}
      usd={usd}
      earnings={earnings}
      submitting={submitting}
      justClaimed={justClaimed}
      wrongNetwork={wrongNetwork}
      toOpen={toOpen}
      toAddr={toAddr}
      onClaim={claim}
      onClaimTo={claimToOther}
      onToggleTo={() => setToOpen((x) => !x)}
      onToAddrChange={setToAddr}
      onSwitchNetwork={() => switchChain({ chainId: activeChain.id })}
    />
  );
}

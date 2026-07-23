"use client";

import { useState } from "react";
import { type Address, formatEther, maxUint256, parseEther, zeroAddress } from "viem";
import { useAccount, useBalance, useConfig, useReadContract, useReadContracts, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { activeChain } from "@/lib/wagmi";
import { UNISWAP_ROUTER, WETH, dexTaxProbeAbi, uniswapConfigured, uniswapRouterAbi } from "@/lib/uniswap";
import { launchTokenAbi } from "@/lib/contracts";
import { applySlippage, chainDeadline, fmtEth, fmtTokens } from "@/lib/format";
import { compactUsd } from "./board/TokenCard";
import { IconSliders } from "@/components/icons";
import { track } from "@/lib/analytics";
import { playBuy, playSell } from "@/lib/sound";
import { shortTxError, useToast } from "@/lib/toast";

function safeParse(v: string): bigint | undefined {
  try {
    return v.trim() ? parseEther(v.trim()) : undefined;
  } catch {
    return undefined;
  }
}
const BUY_CHIPS = ["0.05", "0.1", "0.5"];
const SLIPPAGES = [50, 100, 200, 500];

/// Post-graduation trading — swaps ETH↔token directly against the token's Uniswap V2 pool, in-app (no leaving the site).
export function DexSwapPanel({ token, symbol, usd }: { token?: Address; symbol: string; usd?: number | null }) {
  const { address: user, chainId } = useAccount(); // wallet's real chain (not the config-pinned useChainId)
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [buyInput, setBuyInput] = useState("");
  const [sellInput, setSellInput] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [gearOpen, setGearOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const t = token ?? zeroAddress;
  const { data: ts, refetch } = useReadContracts({
    contracts: [
      { address: t, abi: launchTokenAbi, functionName: "balanceOf", args: [user ?? zeroAddress] },
      { address: t, abi: launchTokenAbi, functionName: "allowance", args: [user ?? zeroAddress, UNISWAP_ROUTER] },
    ],
    query: { enabled: !!token && !!user, refetchInterval: 3000 },
  });
  const balance = ts?.[0]?.result as bigint | undefined;
  const allowance = ts?.[1]?.result as bigint | undefined;
  const { data: ethBal } = useBalance({ address: user, query: { enabled: !!user } });

  const ethWei = safeParse(buyInput);
  const sellWei = safeParse(sellInput);

  // V2 (dexTax) coins levy a hard-coded 1% on pair trades (0.5% creator / 0.5% protocol). The probe reverts
  // on V1 tokens -> undefined -> false, so old coins keep the exact pre-tax behavior.
  const { data: dexTaxProbe, isFetched: probeReady } = useReadContract({
    address: t,
    abi: dexTaxProbeAbi,
    functionName: "dexTaxActive",
    query: { enabled: !!token, staleTime: 60_000, retry: false },
  });
  const dexTax = dexTaxProbe === true; // V1 tokens revert -> undefined -> false (probeReady still flips true)

  const { data: buyAmounts } = useReadContract({
    address: UNISWAP_ROUTER,
    abi: uniswapRouterAbi,
    functionName: "getAmountsOut",
    args: [ethWei ?? 0n, [WETH, t]],
    query: { enabled: uniswapConfigured && !!token && !!ethWei && ethWei > 0n },
  });
  // Buys deliver the pool output minus the 1% tax; quote (and the slippage floor) reflect what lands.
  const buyOutRaw = buyAmounts?.[1];
  const buyOut = buyOutRaw !== undefined ? (dexTax ? buyOutRaw - buyOutRaw / 100n : buyOutRaw) : undefined;
  // Sells: the pair only receives 99% of what leaves the wallet — quote off the post-tax inflow.
  const sellInWei = sellWei !== undefined ? (dexTax ? sellWei - sellWei / 100n : sellWei) : undefined;
  const { data: sellAmounts } = useReadContract({
    address: UNISWAP_ROUTER,
    abi: uniswapRouterAbi,
    functionName: "getAmountsOut",
    args: [sellInWei ?? 0n, [t, WETH]],
    query: { enabled: uniswapConfigured && !!token && !!sellInWei && sellInWei > 0n },
  });
  const sellOut = sellAmounts?.[1];

  const { writeContractAsync } = useWriteContract();
  const { switchChain } = useSwitchChain();
  // chainId is sourced from useAccount() above — the wallet's real chain, so wrongNetwork is accurate.
  const config = useConfig();
  const toast = useToast();
  const busy = submitting;
  const connected = !!user;
  const wrongNetwork = connected && chainId !== activeChain.id;
  const needsApproval = allowance !== undefined && sellWei !== undefined && allowance < sellWei;
  const slipPct = (slippageBps / 100).toString();
  const GAS_RESERVE = parseEther("0.0002"); // small L2 gas headroom for Max buy (Robinhood Chain gas is cheap)
  const maxBuyWei = ethBal ? (ethBal.value > GAS_RESERVE ? ethBal.value - GAS_RESERVE : 0n) : 0n;
  const insufficientBuy = ethWei !== undefined && ethBal !== undefined && ethWei > ethBal.value;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function run(label: string, request: any, successMsg: string, onDone?: () => void) {
    setSubmitting(true);
    const id = toast.loading(`${label}: confirm in your wallet…`);
    try {
      const hash = await writeContractAsync(request);
      toast.update(id, "loading", `${label}: submitted, waiting for confirmation…`);
      const rec = await waitForTransactionReceipt(config, { hash });
      if (rec.status === "reverted") toast.update(id, "error", `${label} reverted on-chain`);
      else {
        toast.update(id, "success", successMsg);
        onDone?.();
      }
    } catch (e) {
      toast.update(id, "error", `${label}: ${shortTxError(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function buy() {
    if (!ethWei || buyOut === undefined || !user) return;
    track("buy_click", { symbol, dex: true });
    const deadline = await chainDeadline(config);
    run(
      "Buy",
      {
        address: UNISWAP_ROUTER,
        abi: uniswapRouterAbi,
        chainId: activeChain.id,
        // The supporting variant checks min-received on the ACTUAL balance delta, so the 1% tax can't trip it.
        functionName: dexTax ? "swapExactETHForTokensSupportingFeeOnTransferTokens" : "swapExactETHForTokens",
        args: [applySlippage(buyOut, slippageBps), [WETH, t], user, deadline],
        value: ethWei,
      },
      `Bought ${symbol} 🎉`,
      () => { setBuyInput(""); track("buy_success", { symbol, dex: true }); playBuy(); refetch(); },
    );
  }
  function approve() {
    if (!token) return;
    run("Approve", { address: t, abi: launchTokenAbi, chainId: activeChain.id, functionName: "approve", args: [UNISWAP_ROUTER, maxUint256] }, `${symbol} approved — you can sell now`, () => refetch());
  }
  async function sell() {
    if (!sellWei || sellOut === undefined || !user) return;
    track("sell_click", { symbol, dex: true });
    const deadline = await chainDeadline(config);
    run(
      "Sell",
      {
        address: UNISWAP_ROUTER,
        abi: uniswapRouterAbi,
        chainId: activeChain.id,
        // A taxed sell delivers only 99% to the pair — the plain function fails the K-check; supporting works.
        functionName: dexTax ? "swapExactTokensForETHSupportingFeeOnTransferTokens" : "swapExactTokensForETH",
        args: [sellWei, applySlippage(sellOut, slippageBps), [t, WETH], user, deadline],
      },
      `Sold ${symbol}`,
      () => { setSellInput(""); track("sell_success", { symbol, dex: true }); playSell(); refetch(); },
    );
  }
  const setSellPct = (p: number) => balance && setSellInput(formatEther((balance * BigInt(p)) / 100n));

  if (!uniswapConfigured) {
    return <div className="panel"><p className="muted">{symbol} has graduated — trading has moved to the DEX pool.</p></div>;
  }

  return (
    <div className="panel trade-panel">
      <div className="trade-tabs">
        <button className={`tt-buy${tab === "buy" ? " active" : ""}`} onClick={() => setTab("buy")}>Buy</button>
        <button className={`tt-sell${tab === "sell" ? " active" : ""}`} onClick={() => setTab("sell")}>Sell</button>
        <button className="gear" onClick={() => setGearOpen((v) => !v)} title="Slippage settings"><IconSliders size={16} /></button>
      </div>
      <div className="dex-tag">
        {dexTax ? "⚡ Graduated · 1% fee on every swap — 0.5% to the creator" : "⚡ Graduated · swapping on Uniswap V2"}
      </div>

      {gearOpen && (
        <div className="slippage-box">
          <span className="muted">Max slippage</span>
          <div className="slip-chips">
            {SLIPPAGES.map((bp) => (
              <button key={bp} className={`pill${slippageBps === bp ? " active" : ""}`} onClick={() => setSlippageBps(bp)}>{bp / 100}%</button>
            ))}
          </div>
        </div>
      )}

      {tab === "buy" ? (
        <>
          <div className="input-row">
            <label>Spend (ETH)</label>
            {ethBal && <span className="muted" style={{ fontSize: 12 }}>Bal {Number(formatEther(ethBal.value)).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>}
          </div>
          <input value={buyInput} onChange={(e) => setBuyInput(e.target.value)} placeholder="0.1" inputMode="decimal" />
          <div className="chips">
            {BUY_CHIPS.map((a) => <button key={a} className="chip-amt" onClick={() => setBuyInput(a)}>{a}</button>)}
            {ethBal && maxBuyWei > 0n && <button className="chip-amt" onClick={() => setBuyInput(formatEther(maxBuyWei))}>Max</button>}
          </div>
          <div className="trade-quote">
            <span className="tq-label">You receive</span>
            <span className="tq-out">≈ {buyOut !== undefined ? fmtTokens(buyOut) : "–"} {symbol}</span>
            {usd != null && ethWei ? <span className="tq-usd">≈ {compactUsd(Number(formatEther(ethWei)) * usd)}</span> : null}
            <div className="tq-sub">Routed through Uniswap V2 · min received at {slipPct}% slippage</div>
          </div>
          {wrongNetwork ? (
            <button className="switch-btn trade-cta" onClick={() => switchChain({ chainId: activeChain.id })}>Switch to {activeChain.name}</button>
          ) : (
            <button className="green trade-cta" onClick={buy} disabled={busy || !connected || !probeReady || !ethWei || buyOut === undefined || buyOut === 0n || insufficientBuy}>
              {busy ? "Submitting…" : insufficientBuy ? "Insufficient ETH" : `Buy ${symbol}`}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="input-row">
            <label>Sell ({symbol})</label>
            <span className="muted" style={{ fontSize: 12 }}>Bal {fmtTokens(balance)}</span>
          </div>
          <input value={sellInput} onChange={(e) => setSellInput(e.target.value)} placeholder="1000" inputMode="decimal" />
          <div className="chips">
            {[25, 50, 100].map((p) => <button key={p} className="chip-amt" onClick={() => setSellPct(p)}>{p === 100 ? "Max" : `${p}%`}</button>)}
          </div>
          <div className="trade-quote">
            <span className="tq-label">You receive</span>
            <span className="tq-out">≈ {sellOut !== undefined ? fmtEth(sellOut) : "–"} ETH</span>
            {usd != null && sellOut !== undefined ? <span className="tq-usd">≈ {compactUsd(Number(formatEther(sellOut)) * usd)}</span> : null}
            <div className="tq-sub">Routed through Uniswap V2 · min received at {slipPct}% slippage</div>
          </div>
          {wrongNetwork ? (
            <button className="switch-btn trade-cta" onClick={() => switchChain({ chainId: activeChain.id })}>Switch to {activeChain.name}</button>
          ) : needsApproval ? (
            <>
              <button className="trade-cta" onClick={approve} disabled={busy || !connected}>{busy ? "Approving…" : `Approve ${symbol} (one-time)`}</button>
              <div className="note">One-time approval for Uniswap — after it confirms, selling is a single click.</div>
            </>
          ) : (
            <button className="red trade-cta" onClick={sell} disabled={busy || !connected || !probeReady || !sellWei || sellOut === undefined || sellOut === 0n}>
              {busy ? "Submitting…" : `Sell ${symbol}`}
            </button>
          )}
        </>
      )}

      {!connected && <div className="note">Connect a wallet to trade.</div>}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { type Address, formatEther, maxUint256, parseEther, parseSignature, zeroAddress } from "viem";
import { useAccount, useBalance, useConfig, useReadContract, useReadContracts, useSignTypedData, useSwitchChain, useWriteContract } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { activeChain } from "@/lib/wagmi";
import { FACTORY_ADDRESS, bondingCurveAbi, factoryAbi, launchTokenAbi } from "@/lib/contracts";
import { applySlippage, chainDeadline, fmtEth, fmtTokens } from "@/lib/format";
import { compactUsd } from "./board/TokenCard";
import { DexSwapPanel } from "./DexSwapPanel";
import { IconSliders } from "@/components/icons";
import { track } from "@/lib/analytics";
import { playBuy, playGraduate, playSell } from "@/lib/sound";
import { shortTxError, useToast } from "@/lib/toast";
import { useLaunchpad } from "@/lib/launchpad-context";

function safeParse(v: string): bigint | undefined {
  try {
    return v.trim() ? parseEther(v.trim()) : undefined;
  } catch {
    return undefined;
  }
}

const BUY_CHIPS = ["0.05", "0.1", "0.5"];
const SLIPPAGES = [50, 100, 200, 500]; // bps

export function TradePanel({ curve, usd }: { curve: Address; usd?: number | null }) {
  const cfg = useLaunchpad();
  // Same sentence in four places (three toasts + the migrated-panel note) — build it once from the tenant brand.
  const unverifiedMsg = `Unverified token — not registered with the ${cfg.name}${cfg.tld} factory; trading disabled for safety.`;
  const { address: user, chainId } = useAccount(); // chainId = the WALLET's real chain (not the config-pinned one)
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [buyInput, setBuyInput] = useState("");
  const [sellInput, setSellInput] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [gearOpen, setGearOpen] = useState(false);

  const curveC = { address: curve, abi: bondingCurveAbi } as const;
  const { data: cs, refetch: refetchCs } = useReadContracts({
    contracts: [
      { ...curveC, functionName: "token" },
      { ...curveC, functionName: "complete" },
      { ...curveC, functionName: "migrated" },
    ],
    query: { refetchInterval: 3000 },
  });
  const token = cs?.[0]?.result as Address | undefined;
  const complete = cs?.[1]?.result as boolean | undefined;
  const migrated = cs?.[2]?.result as boolean | undefined;

  // SECURITY: the curve address arrives from the (off-chain) indexer; verify it was actually registered by the
  // pinned on-chain factory before allowing any trade, so a compromised/malicious indexer can't point users at an
  // attacker contract. Fail-OPEN while the read is pending/failed (availability); fail-CLOSED on a real mismatch.
  const { data: registeredCurve } = useReadContract({
    address: FACTORY_ADDRESS, abi: factoryAbi, functionName: "curveOf", args: [token ?? zeroAddress],
    query: { enabled: !!token },
  });
  const curveMismatch =
    !!token && registeredCurve !== undefined && (registeredCurve as Address).toLowerCase() !== curve.toLowerCase();

  const tokenC = { address: token ?? zeroAddress, abi: launchTokenAbi } as const;
  const { data: ts } = useReadContracts({
    contracts: [
      { ...tokenC, functionName: "symbol" },
      { ...tokenC, functionName: "balanceOf", args: [user ?? zeroAddress] },
      { ...tokenC, functionName: "allowance", args: [user ?? zeroAddress, curve] },
      { ...tokenC, functionName: "name" },
      { ...tokenC, functionName: "DOMAIN_SEPARATOR" }, // feature-detect: reverts on pre-permit tokens
    ],
    query: { enabled: !!token, refetchInterval: 3000 },
  });
  const symbol = (ts?.[0]?.result as string | undefined) ?? "TOKEN";
  const balance = ts?.[1]?.result as bigint | undefined;
  const allowance = ts?.[2]?.result as bigint | undefined;
  const tokenName = ts?.[3]?.result as string | undefined;
  // 1-click sell via EIP-2612 permit. Assume supported unless the DOMAIN_SEPARATOR read EXPLICITLY reverted (a
  // pre-permit token) — so a flaky/slow RPC that leaves the read pending doesn't spuriously downgrade every sell to
  // the approve+sell two-step. Still gated on `tokenName` (needed to build the permit's EIP-712 domain).
  const permitSupported = ts?.[4]?.status !== "failure" && !!tokenName;

  const { data: ethBal } = useBalance({ address: user, query: { enabled: !!user } });

  const tradingClosed = complete || migrated;
  const ethWei = safeParse(buyInput);
  const sellWei = safeParse(sellInput);

  const { data: buyQuote } = useReadContract({
    ...curveC,
    functionName: "quoteBuy",
    args: [ethWei ?? 0n],
    query: { enabled: !!ethWei && ethWei > 0n && !tradingClosed },
  });
  const { data: sellQuote } = useReadContract({
    ...curveC,
    functionName: "quoteSell",
    args: [sellWei ?? 0n],
    query: { enabled: !!sellWei && sellWei > 0n && !tradingClosed },
  });

  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const { switchChain } = useSwitchChain();
  // chainId is sourced from useAccount() above — the wallet's real chain, so wrongNetwork is accurate.
  const config = useConfig();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting;
  const connected = !!user;
  const wrongNetwork = connected && chainId !== activeChain.id;
  const needsApproval = allowance !== undefined && sellWei !== undefined && allowance < sellWei;
  const slipPct = (slippageBps / 100).toString();

  // Max buy leaves gas headroom (spending the whole balance guarantees an out-of-gas revert). L2-sized: Robinhood
  // Chain gas is cheap (Arbitrum Orbit), so a small reserve is plenty — a large one just strands the user's ETH.
  const GAS_RESERVE = parseEther("0.0002");
  const maxBuyWei = ethBal ? (ethBal.value > GAS_RESERVE ? ethBal.value - GAS_RESERVE : 0n) : 0n;
  const insufficientBuy = ethWei !== undefined && ethBal !== undefined && ethWei > ethBal.value;

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

  async function buy() {
    if (curveMismatch) return void toast.error(unverifiedMsg);
    if (!ethWei || !buyQuote) return;
    track("buy_click", { symbol });
    const deadline = await chainDeadline(config);
    run(
      "Buy",
      { ...curveC, chainId: activeChain.id, functionName: "buy", args: [applySlippage(buyQuote[0], slippageBps), deadline], value: ethWei },
      `Bought ${symbol} 🎉`,
      () => { setBuyInput(""); track("buy_success", { symbol }); playBuy(); },
    );
  }
  function approve() {
    if (!token) return;
    run("Approve", { address: token, abi: launchTokenAbi, chainId: activeChain.id, functionName: "approve", args: [curve, maxUint256] }, `${symbol} approved — you can sell now`);
  }
  async function sell() {
    if (curveMismatch) return void toast.error(unverifiedMsg);
    if (!sellWei || !sellQuote) return;
    track("sell_click", { symbol });
    const deadline = await chainDeadline(config);
    run(
      "Sell",
      { ...curveC, chainId: activeChain.id, functionName: "sell", args: [sellWei, applySlippage(sellQuote[0], slippageBps), deadline] },
      `Sold ${symbol}`,
      () => { setSellInput(""); track("sell_success", { symbol }); playSell(); },
    );
  }

  // 1-click sell: sign an EIP-2612 permit (gasless) + sellWithPermit in a single transaction. No separate approve.
  async function sellPermit() {
    if (curveMismatch) return void toast.error(unverifiedMsg);
    if (!sellWei || !sellQuote || !user || !token || !tokenName) return;
    track("sell_click", { symbol, permit: true });
    setSubmitting(true);
    const id = toast.loading("Sell: sign the approval (no gas)…");
    try {
      const deadline = await chainDeadline(config);
      const nonce = (await readContract(config, { address: token, abi: launchTokenAbi, functionName: "nonces", args: [user] })) as bigint;
      const sig = await signTypedDataAsync({
        domain: { name: tokenName, version: "1", chainId, verifyingContract: token },
        types: {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "Permit",
        message: { owner: user, spender: curve, value: sellWei, nonce, deadline },
      });
      const { r, s, yParity } = parseSignature(sig);
      const v = yParity + 27; // 27/28; parseSignature handles the 65-byte sigs wallets produce (no compact EIP-2098 path here)
      toast.update(id, "loading", "Sell: confirm in your wallet…");
      const txHash = await writeContractAsync({
        ...curveC,
        chainId: activeChain.id,
        functionName: "sellWithPermit",
        args: [sellWei, applySlippage(sellQuote[0], slippageBps), deadline, v, r, s],
      });
      toast.update(id, "loading", "Sell: submitted, waiting for confirmation…");
      const rec = await waitForTransactionReceipt(config, { hash: txHash });
      if (rec.status === "reverted") toast.update(id, "error", "Sell reverted on-chain");
      else { toast.update(id, "success", `Sold ${symbol}`); setSellInput(""); track("sell_success", { symbol, permit: true }); playSell(); }
    } catch (e) {
      toast.update(id, "error", `Sell: ${shortTxError(e)}`);
    } finally {
      setSubmitting(false);
    }
  }
  // Graduation needs no user signature — a keeper migrates sold-out curves automatically (script/keeper.sh).
  // While we wait, poll fast so the panel flips to the tradeable graduated view the instant it lands.
  useEffect(() => {
    if (!complete || migrated) return;
    const id = window.setInterval(() => refetchCs(), 1200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, migrated]);

  // Play the graduation sound ONLY when graduation lands while we're watching — i.e. we first saw the curve live
  // (migrated === false), then it flipped to true. Entering an already-graduated coin (undefined → true) must stay
  // silent: there was no graduation event to celebrate.
  const sawLive = useRef(false);
  const celebrated = useRef(false);
  useEffect(() => {
    if (migrated === false) sawLive.current = true;
    else if (migrated === true && sawLive.current && !celebrated.current) {
      celebrated.current = true;
      playGraduate();
    }
  }, [migrated]);

  const setSellPct = (p: number) => balance && setSellInput(formatEther((balance * BigInt(p)) / 100n));

  return (
    <>
      {complete && !migrated && (
        <div className="panel grad-card">
          <div className="grad-ring"><span className="grad-cap">🎓</span></div>
          <h3>Graduating to Uniswap</h3>
          <p className="muted">{symbol} sold out the bonding curve. Seeding the pool &amp; <b>locking liquidity</b> — automatic, no action needed.</p>
          <div className="grad-progress"><div /></div>
        </div>
      )}

      {!tradingClosed && (
        <div className="panel trade-panel">
          <div className="trade-tabs">
            <button className={`tt-buy${tab === "buy" ? " active" : ""}`} onClick={() => setTab("buy")}>Buy</button>
            <button className={`tt-sell${tab === "sell" ? " active" : ""}`} onClick={() => setTab("sell")}>Sell</button>
            <button className="gear" onClick={() => setGearOpen((v) => !v)} title="Slippage settings"><IconSliders size={16} /></button>
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
                {BUY_CHIPS.map((a) => (
                  <button key={a} className="chip-amt" onClick={() => setBuyInput(a)}>{a}</button>
                ))}
                {ethBal && maxBuyWei > 0n && <button className="chip-amt" onClick={() => setBuyInput(formatEther(maxBuyWei))}>Max</button>}
              </div>
              <div className="trade-quote">
                <span className="tq-label">You receive</span>
                <span className="tq-out">≈ {buyQuote ? fmtTokens(buyQuote[0]) : "–"} {symbol}</span>
                {usd != null && ethWei ? <span className="tq-usd">≈ {compactUsd(Number(formatEther(ethWei)) * usd)}</span> : null}
                <div className="tq-sub" title="1% trade fee — half goes to the coin's creator">Fee {buyQuote ? fmtEth(buyQuote[1]) : "–"} ETH · min received at {slipPct}% slippage</div>
              </div>
              {wrongNetwork ? (
                <button className="switch-btn trade-cta" onClick={() => switchChain({ chainId: activeChain.id })}>Switch to {activeChain.name}</button>
              ) : (
                <button className="green trade-cta" onClick={buy} disabled={busy || !connected || !ethWei || !buyQuote || buyQuote[0] === 0n || insufficientBuy}>
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
                {[25, 50, 100].map((p) => (
                  <button key={p} className="chip-amt" onClick={() => setSellPct(p)}>{p === 100 ? "Max" : `${p}%`}</button>
                ))}
              </div>
              <div className="trade-quote">
                <span className="tq-label">You receive</span>
                <span className="tq-out">≈ {sellQuote ? fmtEth(sellQuote[0]) : "–"} ETH</span>
                {usd != null && sellQuote ? <span className="tq-usd">≈ {compactUsd(Number(formatEther(sellQuote[0])) * usd)}</span> : null}
                <div className="tq-sub" title="1% trade fee — half goes to the coin's creator">Fee {sellQuote ? fmtEth(sellQuote[1]) : "–"} ETH · min received at {slipPct}% slippage</div>
              </div>
              {wrongNetwork ? (
                <button className="switch-btn trade-cta" onClick={() => switchChain({ chainId: activeChain.id })}>Switch to {activeChain.name}</button>
              ) : permitSupported ? (
                <button className="red trade-cta" onClick={sellPermit} disabled={busy || !connected || !sellWei || !sellQuote || sellQuote[0] === 0n}>
                  {busy ? "Submitting…" : `Sell ${symbol}`}
                </button>
              ) : needsApproval ? (
                <>
                  <button className="trade-cta" onClick={approve} disabled={busy || !connected}>{busy ? "Approving…" : `Approve ${symbol} (one-time)`}</button>
                  <div className="note">One-time approval — after it confirms, selling is a single click.</div>
                </>
              ) : (
                <button className="red trade-cta" onClick={sell} disabled={busy || !connected || !sellWei || !sellQuote || sellQuote[0] === 0n}>
                  {busy ? "Submitting…" : `Sell ${symbol}`}
                </button>
              )}
            </>
          )}

          {!connected && <div className="note">Connect a wallet to trade.</div>}
        </div>
      )}

      {migrated &&
        (curveMismatch ? (
          <div className="note">{unverifiedMsg}</div>
        ) : (
          <DexSwapPanel token={token} symbol={symbol} usd={usd} />
        ))}
    </>
  );
}

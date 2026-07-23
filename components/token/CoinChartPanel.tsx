"use client";

import Link from "next/link";
import { avatarStyle } from "@/lib/avatar";
import { useState } from "react";
import type { Address } from "viem";
import type { TokenSummary, TradeEvent } from "@/lib/api";
import { socialForDisplay } from "@/lib/links";
import { ExternalLink } from "@/components/ExternalLink";
import { addressUrl } from "@/lib/explorer";
import { track } from "@/lib/analytics";
import { TokenImage } from "@/components/TokenImage";
import { compactEth, compactUsd, timeAgo } from "../board/TokenCard";
import { IconCopy, IconEth, IconGlobe, IconTelegram, IconX } from "@/components/icons";
import { PriceChart } from "./PriceChart";
import { useLaunchpad } from "@/lib/launchpad-context";

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const compactCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`);

/// The token page's hero: coin identity + a 6-stat strip + the live chart + the bonding "fuel" seam, welded into
/// ONE bordered panel so a coin reads as a single trading instrument. Replaces the old TokenHeader + standalone
/// PriceChart. The chart is rendered via <PriceChart variant="embedded" /> so it shares this panel's chrome.
export function CoinChartPanel({ token, curve, usd, liveTrade }: { token?: TokenSummary; curve: Address; usd?: number | null; liveTrade: TradeEvent | null }) {
  const [copied, setCopied] = useState(false);
  const cfg = useLaunchpad();
  const sym = token?.symbol ?? "—";

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }
  function shareX() {
    track("share_click", { curve });
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `${token?.name ?? "this coin"} ($${sym}) on ${cfg.name}${cfg.tld}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
  }

  // ── stat derivations ──
  const mcUsd = token && usd != null ? compactUsd(Number(token.marketCapEth) * usd) : null;
  const mcMain = token ? mcUsd ?? `${compactEth(token.marketCapEth)} ETH` : "—";
  const mcSub = token && usd != null ? `${compactEth(token.marketCapEth)} ETH` : " ";
  const athUsd = token?.athMarketCapEth && usd != null ? compactUsd(Number(token.athMarketCapEth) * usd) : null;
  const athMain = token?.athMarketCapEth ? athUsd ?? `${compactEth(token.athMarketCapEth)} ETH` : null;

  const ch = token?.change24hPct;

  const liqUsd = token
    ? token.liquidityUsd != null
      ? compactUsd(token.liquidityUsd)
      : usd != null && token.liquidityEth
        ? compactUsd(Number(token.liquidityEth) * usd)
        : null
    : null;
  const liqMain = token?.liquidityEth ? liqUsd ?? `${compactEth(token.liquidityEth)} ETH` : "—";

  const volUsd = token && usd != null ? compactUsd(Number(token.volumeEth) * usd) : null;
  const volMain = token ? volUsd ?? `${compactEth(token.volumeEth)} ETH` : "—";

  const pct = Math.max(0, Math.min(100, token?.bondingProgressPct ?? 0));

  // creator-supplied socials, host-validated per field
  const web = socialForDisplay("website", token?.website);
  const tw = socialForDisplay("twitter", token?.twitter);
  const tg = socialForDisplay("telegram", token?.telegram);
  const explorer = token ? addressUrl(token.token) : null;

  return (
    <div className="panel coin-instrument">
      {/* ── identity ── */}
      <div className="ci-id">
        <div className="ch-avatar">
          <TokenImage src={token?.imageUrl} alt={sym} seed={sym} label={sym} nsfw={token?.nsfw} className="ch-media" />
        </div>
        <div className="ci-id-main">
          <div className="ch-name">
            {token?.name ?? "Token"} <span className="muted">${sym}</span>
            {token?.readyToGraduate && <span className="chip badge-grad">ready</span>}
          </div>
          <div className="ch-creator">
            {token?.creator ? (
              <Link href={`/profile/${token.creator}`} className="ch-creator-link addr-link">
                <span className="ch-blockie" style={avatarStyle(token.creator)} />
                by {short(token.creator)}
              </Link>
            ) : (
              <span className="ch-blockie" style={avatarStyle()} />
            )}
            <span className="muted">· {token ? `${timeAgo(token.createdAt)} ago` : ""}</span>
          </div>
          {token && (web || tw || tg) && (
            <div className="socials">
              {web && <ExternalLink href={web}><IconGlobe size={14} /> Website</ExternalLink>}
              {tw && <ExternalLink href={tw}><IconX size={13} /> Twitter</ExternalLink>}
              {tg && <ExternalLink href={tg}><IconTelegram size={14} /> Telegram</ExternalLink>}
            </div>
          )}
        </div>
        <div className="ci-actions">
          <button className="icon-btn" onClick={shareX} title="Share on X"><IconX size={14} /></button>
          {explorer && <a className="icon-btn" href={explorer} target="_blank" rel="noopener noreferrer" title="View on explorer"><IconEth size={15} /></a>}
          <button className="copy-chip copy-ca" onClick={() => token && copy(token.token)} title="Copy contract address (CA)">
            {copied ? "copied ✓" : <><span className="ca-tag">CA</span> {short(token?.token)} <IconCopy size={13} /></>}
          </button>
        </div>
      </div>

      {/* ── stat strip ── */}
      <div className="ci-strip">
        <div className="ci-cell ci-cell-mcap">
          <span className="ci-cell-label">Market cap</span>
          <span className="ci-cell-val">{mcMain}</span>
          <span className="ci-cell-sub">{mcSub}</span>
        </div>
        <div className="ci-cell ci-cell-ath">
          <span className="ci-cell-label">ATH</span>
          <span className="ci-cell-val">{athMain ?? "—"}</span>
          <span className="ci-cell-sub">all-time high</span>
        </div>
        <div className={`ci-cell ci-cell-change${ch == null ? "" : ch >= 0 ? " up" : " down"}`}>
          <span className="ci-cell-label">24h</span>
          <span className="ci-cell-val">{ch == null ? "—" : `${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(1)}%`}</span>
          <span className="ci-cell-sub">{" "}</span>
        </div>
        <div className="ci-cell">
          <span className="ci-cell-label">Liquidity</span>
          <span className="ci-cell-val">{liqMain}</span>
          <span className="ci-cell-sub">{" "}</span>
        </div>
        <div className="ci-cell">
          <span className="ci-cell-label">Volume</span>
          <span className="ci-cell-val">{volMain}</span>
          <span className="ci-cell-sub">all-time</span>
        </div>
      </div>

      {/* ── live chart (shares this panel's chrome) ── */}
      <PriceChart variant="embedded" curve={curve} liveTrade={liveTrade} usd={usd} migrated={token?.migrated} token={token?.token} />

      {/* ── bonding "fuel" seam ── */}
      <div className={`ci-fuel${token?.migrated ? " is-grad" : ""}`}>
        <div className="tprogress"><div style={{ width: `${token?.migrated ? 100 : pct}%` }} /></div>
        <div className="ci-fuel-meta">
          <span>
            {token?.migrated ? "Graduated to Uniswap" : token?.complete ? "Ready to graduate" : <>{pct.toFixed(1)}% bonded</>}
            {!token?.complete && token?.ethToGraduateEth && Number(token.ethToGraduateEth) > 0 && (
              <span className="muted" title="Approximate reserve amount — actual cost is a touch higher with trading fees"> · ~{compactEth(token.ethToGraduateEth)} ETH to graduate</span>
            )}
          </span>
          <span className="muted">{token?.holderCount ?? 0} holders · {compactCount(token?.tradeCount ?? 0)} trades</span>
        </div>
      </div>
    </div>
  );
}

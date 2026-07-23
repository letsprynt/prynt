"use client";

import Link from "next/link";
import { avatarStyle } from "@/lib/avatar";
import { useCallback, useEffect, useState } from "react";
import { fetchProfile, useEthUsd, type ProfileData } from "@/lib/api";
import { shortAddr } from "@/lib/format";
import { addressUrl } from "@/lib/explorer";
import { useToast } from "@/lib/toast";
import { EarningsCard } from "@/components/profile/EarningsCard";
import { TokenCard, compactEth, compactUsd } from "@/components/board/TokenCard";
import { TokenImage } from "@/components/TokenImage";
import { IconCopy } from "@/components/icons";

type Tab = "created" | "held";

export function ProfileView({ address }: { address: string }) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("created");
  const eth = useEthUsd();
  const toast = useToast();

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await fetchProfile(address));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [address]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  if (error) {
    return <div className="panel">Couldn&apos;t load this profile. {error} <button className="secondary" onClick={load}>Retry</button></div>;
  }
  if (!data) {
    return <div className="panel prof-header"><span className="prof-blockie" style={avatarStyle()} /><div className="muted">Loading profile…</div></div>;
  }

  const s = data.stats;
  const portfolioEth = data.held.reduce((sum, h) => sum + Number(h.valueEth), 0);
  const portfolioUsd = data.held.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);
  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: "created", label: "Coins created", n: s.created },
    { key: "held", label: "Held", n: s.held },
  ];

  return (
    <div className="prof">
      <div className="panel prof-header">
        <span className="prof-blockie" style={avatarStyle(address)} />
        <div className="prof-id">
          <div className="prof-addr">
            {shortAddr(address)}
            <button
              className="copy-chip"
              onClick={async () => {
                try { await navigator.clipboard.writeText(address); toast.success("Address copied"); }
                catch { toast.error("Couldn't copy address"); }
              }}
              title="Copy address"
            >
              <IconCopy size={13} /> copy
            </button>
            {addressUrl(address) && (
              <a className="copy-chip" href={addressUrl(address)!} target="_blank" rel="noopener noreferrer" title="View on explorer">
                ↗ Explorer
              </a>
            )}
          </div>
          <div className="prof-stats">
            <span><strong>{s.created}</strong> created</span>
            <span><strong>{s.held}</strong> held</span>
            {portfolioUsd > 0 || portfolioEth > 0 ? (
              <span><strong>{portfolioUsd > 0 ? compactUsd(portfolioUsd) : `${compactEth(String(portfolioEth))} ETH`}</strong> portfolio</span>
            ) : null}
            <span><strong>{s.trades}</strong> trades</span>
            <span><strong>{compactEth(s.volumeEth)}</strong> ETH volume</span>
          </div>
        </div>
      </div>

      <EarningsCard address={address} />

      <div className="prof-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`prof-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label} <span className="prof-tab-n">{t.n}</span>
          </button>
        ))}
      </div>

      {tab === "created" && (
        data.created.length ? (
          <div className="board-grid">
            {data.created.map((t) => <TokenCard key={t.curve} t={t} ethUsd={eth.usd} />)}
          </div>
        ) : <div className="panel muted">No coins launched yet.</div>
      )}

      {tab === "held" && (
        data.held.length ? (
          <div className="prof-list">
            {data.held.map((h) => (
              <Link key={h.curve} href={`/token/${h.curve}`} className="prof-hold">
                <TokenImage src={h.imageUrl} alt={h.symbol} seed={h.symbol} label={h.symbol} nsfw={h.nsfw} className="prof-hold-img" />
                <span className="prof-hold-id">
                  <strong>{h.name}</strong> <span className="muted">${h.symbol}</span>
                  <span className="muted prof-hold-bal">{compactEth(h.balanceTokens)} {h.symbol}</span>
                </span>
                <span className="prof-hold-val">
                  <strong>{h.valueUsd != null ? compactUsd(h.valueUsd) : `${compactEth(h.valueEth)} ETH`}</strong>
                  <span className="muted">{compactEth(h.valueEth)} ETH</span>
                </span>
              </Link>
            ))}
          </div>
        ) : <div className="panel muted">No holdings.</div>
      )}
    </div>
  );
}

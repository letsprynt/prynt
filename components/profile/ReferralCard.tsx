"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useMounted } from "@/lib/useMounted";

// Shown only on your OWN profile: your shareable referral link. First-touch attribution is already captured
// (lib/referral); on-chain fee-sharing to referrers needs the next contract deploy.
export function ReferralCard({ address }: { address: string }) {
  const { address: connected } = useAccount();
  const mounted = useMounted();
  const [copied, setCopied] = useState(false);

  if (!mounted || !connected || connected.toLowerCase() !== address.toLowerCase()) return null;

  const link = typeof window !== "undefined" ? `${window.location.origin}/?ref=${address}` : "";
  function copy() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <div className="panel ref-card">
      <div className="ref-main">
        <span className="ref-label">Your referral link</span>
        <span className="ref-link" title={link}>{link}</span>
        <span className="ref-sub muted">Share it to bring traders in. Referral fee-sharing goes live with the next contract deploy.</span>
      </div>
      <button className="ref-copy" onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
    </div>
  );
}

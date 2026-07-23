"use client";

import Link from "next/link";
import { isAddress } from "viem";
import { ProfileView } from "@/components/profile/ProfileView";

export function ProfilePageClient({ address }: { address: string }) {
  if (!isAddress(address)) {
    return (
      <div className="panel">
        <p>Invalid wallet address.</p>
        <Link href="/">← back to tokens</Link>
      </div>
    );
  }

  return (
    <>
      <Link href="/" className="muted">← back to tokens</Link>
      <div style={{ height: 12 }} />
      <ProfileView address={address} />
    </>
  );
}

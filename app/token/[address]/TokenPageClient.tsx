"use client";

import Link from "next/link";
import { isAddress } from "viem";
import { TokenView } from "@/components/token/TokenView";
import { factoryConfigured } from "@/lib/contracts";

export function TokenPageClient({ address }: { address: string }) {
  if (!factoryConfigured) {
    return <div className="banner">Set <code>NEXT_PUBLIC_FACTORY_ADDRESS</code> in <code>.env.local</code>.</div>;
  }
  if (!isAddress(address)) {
    return (
      <div className="panel">
        <p>Invalid curve address.</p>
        <Link href="/">← back to tokens</Link>
      </div>
    );
  }

  return <TokenView curve={address} />;
}

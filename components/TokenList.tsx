"use client";

import Link from "next/link";
import { useReadContract, useReadContracts } from "wagmi";
import { FACTORY_ADDRESS, factoryAbi, launchTokenAbi } from "@/lib/contracts";
import { shortAddr } from "@/lib/format";

export function TokenList() {
  const { data: count } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "tokenCount",
    query: { refetchInterval: 8000 },
  });

  const n = count ? Number(count) : 0;
  const limit = Math.min(n, 50);
  const offset = n > limit ? n - limit : 0;

  const { data: launches } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "getLaunches",
    args: [BigInt(offset), BigInt(limit)],
    query: { enabled: n > 0, refetchInterval: 8000 },
  });

  const { data: meta } = useReadContracts({
    contracts: (launches ?? []).flatMap((l) => [
      { address: l.token, abi: launchTokenAbi, functionName: "name" } as const,
      { address: l.token, abi: launchTokenAbi, functionName: "symbol" } as const,
    ]),
    query: { enabled: !!launches && launches.length > 0 },
  });

  if (n === 0) {
    return (
      <div className="panel">
        <h2>Tokens</h2>
        <p className="muted">No tokens launched yet — be the first.</p>
      </div>
    );
  }

  // newest first
  const items = (launches ?? []).map((l, i) => ({ launch: l, idx: i })).reverse();

  return (
    <div className="panel">
      <h2>Tokens ({n})</h2>
      <div className="tokenlist">
        {items.map(({ launch, idx }) => {
          const name = meta?.[idx * 2]?.result as string | undefined;
          const symbol = meta?.[idx * 2 + 1]?.result as string | undefined;
          return (
            <Link key={launch.curve} href={`/token/${launch.curve}`}>
              <div className="spread">
                <div>
                  <strong>{name ?? shortAddr(launch.token)}</strong>{" "}
                  <span className="muted">{symbol ? `($${symbol})` : ""}</span>
                </div>
                <span className="muted">by {shortAddr(launch.creator)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

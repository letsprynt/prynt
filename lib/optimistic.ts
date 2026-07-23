"use client";

import { useSyncExternalStore } from "react";
import type { TokenSummary } from "./api";

// Optimistic just-launched tokens: the creator's coin shows on the board INSTANTLY (with the image they just
// uploaded), without waiting ~12-24s for the indexer to pick up the on-chain event. The board merges these at the
// top and drops each one as soon as the real indexed token arrives over SSE. Entries auto-expire as a safety net.
let store: TokenSummary[] = [];
const listeners = new Set<() => void>();
const TTL_MS = 5 * 60_000;

const emit = () => listeners.forEach((l) => l());
const without = (curve: string) => store.filter((x) => x.curve.toLowerCase() !== curve.toLowerCase());

export function addOptimisticToken(t: TokenSummary) {
  store = [t, ...without(t.curve)];
  emit();
  setTimeout(() => {
    const next = without(t.curve);
    if (next.length !== store.length) {
      store = next;
      emit();
    }
  }, TTL_MS);
}

export function dropOptimisticToken(curve: string) {
  const next = without(curve);
  if (next.length !== store.length) {
    store = next;
    emit();
  }
}

export function useOptimisticTokens(): TokenSummary[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => store,
    () => store,
  );
}

/// Build a board-ready TokenSummary from what we already know at launch time (curve/token from the receipt, the
/// uploaded image URL, the form fields). Stats start at the launch state and are replaced by real indexed values
/// the moment the SSE `token` event arrives.
export function buildOptimisticToken(a: {
  curve: string;
  token: string;
  creator: string;
  name: string;
  symbol: string;
  metadataURI: string;
  imageUrl: string | null;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  nsfw?: boolean;
}): TokenSummary {
  return {
    curve: a.curve,
    token: a.token,
    creator: a.creator,
    name: a.name,
    symbol: a.symbol,
    metadataURI: a.metadataURI,
    createdAt: String(Math.floor(Date.now() / 1000)),
    metadataResolved: !!a.imageUrl,
    nsfw: a.nsfw ?? false,
    imageUrl: a.imageUrl ?? null,
    description: a.description ?? null,
    website: a.website ?? null,
    twitter: a.twitter ?? null,
    telegram: a.telegram ?? null,
    lastPriceWei: "0",
    marketCapWei: "0",
    volumeEthWei: "0",
    realEthReserve: "0",
    realTokenReserve: "0",
    tradeCount: 0,
    holderCount: 0,
    lastTradeAt: null,
    bondingProgress: 0,
    complete: false,
    migrated: false,
    priceEth: "0",
    marketCapEth: "0",
    volumeEth: "0",
    bondingProgressPct: 0,
    readyToGraduate: false,
  };
}

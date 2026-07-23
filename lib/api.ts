"use client";

import { useEffect, useRef, useState } from "react";
import { formatEther } from "viem";

export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:42069";
const INITIAL_REAL_TOKEN = 793_100_000n * 10n ** 18n;

export type TokenSummary = {
  curve: string;
  token: string;
  creator: string;
  name: string;
  symbol: string;
  metadataURI: string;
  createdAt: string;
  metadataResolved: boolean;
  nsfw: boolean;
  imageUrl: string | null;
  description: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  lastPriceWei: string;
  marketCapWei: string;
  volumeEthWei: string;
  realEthReserve: string;
  realTokenReserve: string;
  tradeCount: number;
  holderCount: number;
  lastTradeAt: string | null;
  bondingProgress: number;
  complete: boolean;
  migrated: boolean;
  dexTax?: boolean; // V2 launch: 1% pair-trade tax after graduation (0.5% creator / 0.5% protocol)
  priceEth: string;
  marketCapEth: string;
  volumeEth: string;
  bondingProgressPct: number;
  readyToGraduate: boolean;
  volume1hEth?: string;
  trades1h?: number;
  // USD + ATH + 24h (display-only; server-derived)
  marketCapUsd?: number | null;
  priceUsd?: number | null;
  athMarketCapEth?: string;
  athMarketCapUsd?: number | null;
  change24hPct?: number | null;
  // depth (detail endpoint only)
  ethToGraduateEth?: string;
  ethToGraduateUsd?: number | null;
  devHoldingPct?: number;
  top10Pct?: number;
  // Uniswap V2 pair address once graduated (for the live liquidity / LP-burn view)
  pair?: string | null;
  // Liquidity (TVL, both pool sides) — DIFFERENT from market cap. Virtual (curve) pre-grad, real pool post-grad.
  liquidityEth?: string;
  liquidityUsd?: number | null;
  liquidityVirtual?: boolean;
  poolTokenWei?: string; // token reserve held by the Uniswap pair after graduation
};

export type Position = {
  curve: string;
  address: string;
  hasPosition: boolean;
  balance: string;
  balanceTokens: string;
  valueEth: string;
  valueUsd: number | null;
  boughtEth: string;
  soldEth: string;
  pnlEth: string;
  pnlUsd: number | null;
  pnlPct: number | null;
  pnlUp: boolean;
  trades: number;
  buys: number;
  sells: number;
};

export async function fetchPosition(curve: string, address: string): Promise<Position> {
  const res = await fetch(`${INDEXER_URL}/api/position/${curve}/${address}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export type TradeEvent = {
  id: string;
  curve: string;
  trader: string;
  isBuy: boolean;
  ethWei: string;
  tokenWei: string;
  priceWei: string;
  marketCapWei: string;
  reserveToken: string;
  timestamp: string;
  // enriched token meta (live ticker) — present on the SSE `trade` event + /api/trades
  name?: string | null;
  symbol?: string | null;
  imageUrl?: string | null;
  nsfw?: boolean;
};

/// Recent global trades, enriched with token name/symbol/image — seeds the live ticker on first paint.
export async function fetchRecentTrades(limit = 30): Promise<TradeEvent[]> {
  const res = await fetch(`${INDEXER_URL}/api/trades?limit=${limit}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()).trades as TradeEvent[];
}

export type Holder = {
  address: string;
  balance: string;
  pctOfSupply: number;
  valueEth?: string;
  valueUsd?: number | null;
  costEth?: string;
  soldEth?: string;
  pnlEth?: string | null;
  pnlUsd?: number | null;
  pnlPct?: number | null;
  pnlUp?: boolean;
};
export type TradeRow = {
  id: string;
  trader: string;
  isBuy: boolean;
  ethWei: string;
  tokenWei: string;
  priceWei: string;
  timestamp: string;
  txHash: string;
};
export type TokenDetail = { token: TokenSummary; holders: Holder[]; recentTrades: TradeRow[] };
export type Candle = { time: number; open: string; high: string; low: string; close: string; volume: string; trades: number };

export async function fetchTokenDetail(curve: string): Promise<TokenDetail> {
  const res = await fetch(`${INDEXER_URL}/api/tokens/${curve}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function fetchCandles(curve: string, interval: string): Promise<Candle[]> {
  const res = await fetch(`${INDEXER_URL}/api/tokens/${curve}/candles?interval=${interval}&limit=2000`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()).candles as Candle[];
}

export type DevTrade = { timestamp: string; isBuy: boolean; ethWei: string; tokenWei: string };
/// The token creator's own trades — used to mark "DEV bought/sold" points on the price chart.
export async function fetchDevTrades(curve: string): Promise<DevTrade[]> {
  const res = await fetch(`${INDEXER_URL}/api/tokens/${curve}/dev-trades`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()).trades as DevTrade[];
}

// ---- wallet profile (pump.fun-style) ----
export type ProfileHolding = TokenSummary & { balance: string; balanceTokens: string; valueEth: string; valueUsd: number | null };
export type ProfileActivity = {
  id: string; curve: string; trader: string; isBuy: boolean; ethWei: string; tokenWei: string;
  priceWei: string; timestamp: string; txHash: string;
  name: string | null; symbol: string | null; imageUrl: string | null;
};
export type ProfileData = {
  address: string;
  ethUsd: number | null;
  stats: { created: number; held: number; trades: number; volumeEth: string; volumeEthWei?: string };
  created: TokenSummary[];
  held: ProfileHolding[];
  activity: ProfileActivity[];
};

export async function fetchProfile(address: string): Promise<ProfileData> {
  const res = await fetch(`${INDEXER_URL}/api/profile/${address}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ---- creator earnings (0.5% trade-fee share, accrued in the FeeManager) ----
// symbol/name are null when the indexer doesn't know the token (e.g. launched before its start block)
export type CreatorTokenEarnings = { token: string; curve?: string | null; symbol: string | null; name: string | null; imageUrl: string | null; earnedWei: string; lastAt: number };
export type CreatorClaim = { txHash: string; to: string; amountWei: string; timestamp: number };
export type CreatorFeeDay = { day: number; earnedWei: string }; // day = UTC day start (unix seconds); sparse
export type CreatorEarnings = {
  totalEarnedWei: string;
  totalClaimedWei: string;
  perToken: CreatorTokenEarnings[]; // sorted by earnedWei desc
  claims: CreatorClaim[]; // newest first, capped at 50
  daily?: CreatorFeeDay[]; // last 30 UTC days, ascending, sparse — absent on older indexers
};

/// Lifetime creator-fee earnings + claim history. Ships with the FeeManager indexer update — callers must
/// tolerate failure (an older indexer without the endpoint) and fall back to the on-chain claimable() read alone.
export async function fetchCreatorEarnings(address: string): Promise<CreatorEarnings> {
  const res = await fetch(`${INDEXER_URL}/api/creator/${address}/earnings`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export type Sort = "new" | "marketCap" | "volume" | "progress" | "trades";

export async function fetchTokens(sort: Sort, search: string, limit = 60): Promise<TokenSummary[]> {
  const q = new URLSearchParams({ sort, order: "desc", limit: String(limit) });
  if (search.trim()) q.set("search", search.trim());
  const res = await fetch(`${INDEXER_URL}/api/tokens?${q}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()).tokens as TokenSummary[];
}

export type TokensPage = { tokens: TokenSummary[]; hasMore: boolean; nextOffset: number };
export async function fetchTokensPage(sort: Sort, search: string, offset = 0, limit = 30): Promise<TokensPage> {
  const q = new URLSearchParams({ sort, order: "desc", limit: String(limit), offset: String(offset) });
  if (search.trim()) q.set("search", search.trim());
  const res = await fetch(`${INDEXER_URL}/api/tokens?${q}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const j = await res.json();
  return {
    tokens: (j.tokens ?? []) as TokenSummary[],
    hasMore: !!j.hasMore,
    nextOffset: j.nextOffset ?? offset + (j.tokens?.length ?? 0),
  };
}


export async function fetchTrending(limit = 8): Promise<TokenSummary[]> {
  // top volume over the last 24h (window is in seconds; the endpoint caps at 86400)
  const res = await fetch(`${INDEXER_URL}/api/trending?limit=${limit}&window=86400`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()).tokens as TokenSummary[];
}

// King of the Hill: the single token closest to graduating once it crosses ~70% bonded (null until then).
export async function fetchKing(): Promise<TokenSummary | null> {
  const res = await fetch(`${INDEXER_URL}/api/king`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return ((await res.json()).king ?? null) as TokenSummary | null;
}

/// Parse a wei string/number to bigint, returning 0n on any bad/empty input. A malformed indexer frame must
/// never throw inside a render and white-screen the live board/ticker.
export function safeBig(v: unknown): bigint {
  try {
    return typeof v === "bigint" ? v : BigInt((v ?? "0") as string | number);
  } catch {
    return 0n;
  }
}

/// Apply a streamed trade to a token row in-place (recompute the live stats the board shows).
export function applyTrade(t: TokenSummary, tr: TradeEvent): TokenSummary {
  const reserveToken = safeBig(tr.reserveToken);
  const sold = INITIAL_REAL_TOKEN - reserveToken;
  const progress = sold <= 0n ? 0 : reserveToken <= 0n ? 1 : Number((sold * 1_000_000n) / INITIAL_REAL_TOKEN) / 1_000_000;
  const volumeEthWei = (safeBig(t.volumeEthWei) + safeBig(tr.ethWei)).toString();
  return {
    ...t,
    lastPriceWei: tr.priceWei,
    marketCapWei: tr.marketCapWei,
    volumeEthWei,
    realTokenReserve: tr.reserveToken,
    bondingProgress: progress,
    bondingProgressPct: Math.round(progress * 10000) / 100,
    tradeCount: t.tradeCount + 1,
    // keep the display strings in sync so the card's shown numbers (and USD = ×ethUsd) update live
    priceEth: formatEther(safeBig(tr.priceWei)),
    marketCapEth: formatEther(safeBig(tr.marketCapWei)),
    volumeEth: formatEther(safeBig(volumeEthWei)),
  };
}

export type EthPriceInfo = { available: boolean; usd: number | null; updatedAt: number | null; ageSecs: number | null; reason?: string };

export async function fetchEthPrice(): Promise<EthPriceInfo> {
  const res = await fetch(`${INDEXER_URL}/api/eth-price`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/// Live ETH/USD (server-cached Chainlink). Polls every 45s. `usd` is null when the feed is stale/unavailable
/// — callers must then show ETH only (never $0). USD is display-only; it never feeds a trade or the curve.
// Public, chain-agnostic ETH/USD fallback. Robinhood Chain publishes no on-chain Chainlink ETH/USD feed, so when the
// indexer can't price ETH we pull the live price from CoinGecko (ETH is ETH on any chain). Display-only — it never
// feeds a trade, a quote, or the curve. Kept out of the trade path entirely.
async function fetchEthUsdFallback(): Promise<number | null> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", {
      headers: { accept: "application/json" },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { ethereum?: { usd?: number } };
    return typeof j?.ethereum?.usd === "number" ? j.ethereum.usd : null;
  } catch {
    return null;
  }
}

export function useEthUsd(): EthPriceInfo {
  const [p, setP] = useState<EthPriceInfo>({ available: false, usd: null, updatedAt: null, ageSecs: null });
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      // 1) authoritative on-chain feed via the indexer (where a Chainlink feed exists, e.g. Ethereum).
      try {
        const r = await fetchEthPrice();
        if (r.usd != null) { if (alive) setP(r); return; }
      } catch {
        /* fall through to the public fallback */
      }
      // 2) public fallback so market caps still read in USD ($k/$M) on feed-less chains like Robinhood Chain.
      const usd = await fetchEthUsdFallback();
      if (!alive) return;
      setP(
        usd != null
          ? { available: true, usd, updatedAt: Date.now(), ageSecs: 0, reason: "coingecko" }
          : { available: false, usd: null, updatedAt: null, ageSecs: null, reason: "unavailable" },
      );
    };
    tick();
    const id = setInterval(tick, 45_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return p;
}

// ---- shared SSE: ONE EventSource for the whole app, ref-counted across all subscribers ----
// (TopBar's ticker + the board + the token page all subscribe; without sharing each page held 2-3 connections.)
// Late image/socials backfill for a token whose image wasn't on IPFS yet when it was first streamed.
export type TokenMetaEvent = { curve: string; imageUrl: string | null; image: string | null; description: string | null; website: string | null; twitter: string | null; telegram: string | null };
type StreamHandlers = { onToken?: (t: TokenSummary) => void; onTrade?: (t: TradeEvent) => void; onTokenMeta?: (m: TokenMetaEvent) => void };
let _es: EventSource | null = null;
let _refs = 0;
const _subs = new Set<StreamHandlers>();

function _dispatch(kind: "token" | "trade" | "tokenmeta", e: Event) {
  let data: unknown;
  try {
    data = JSON.parse((e as MessageEvent).data); // skip a malformed frame instead of throwing in the listener
  } catch {
    return;
  }
  for (const s of _subs) {
    try {
      if (kind === "token") s.onToken?.(data as TokenSummary);
      else if (kind === "tokenmeta") s.onTokenMeta?.(data as TokenMetaEvent);
      else s.onTrade?.(data as TradeEvent);
    } catch {
      /* one bad subscriber must not kill the stream for the others */
    }
  }
}

/// Subscribe to the indexer's live SSE channel. Fires `onToken` for new launches, `onTrade` for trades.
/// All callers share a single underlying EventSource (ref-counted; closed when the last subscriber unmounts).
export function useTokenStream(handlers: StreamHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const sub: StreamHandlers = {
      onToken: (t) => ref.current.onToken?.(t),
      onTrade: (t) => ref.current.onTrade?.(t),
      onTokenMeta: (m) => ref.current.onTokenMeta?.(m),
    };
    _subs.add(sub);
    _refs++;
    if (!_es) {
      _es = new EventSource(`${INDEXER_URL}/api/stream`);
      _es.addEventListener("token", (e) => _dispatch("token", e));
      _es.addEventListener("trade", (e) => _dispatch("trade", e));
      _es.addEventListener("tokenmeta", (e) => _dispatch("tokenmeta", e));
    }
    return () => {
      _subs.delete(sub);
      _refs--;
      if (_refs <= 0 && _es) {
        _es.close();
        _es = null;
        _refs = 0;
      }
    };
  }, []);
}

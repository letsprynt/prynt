import { createConfig, fallback, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";
import { DEFAULT_CONFIG } from "@/lib/launchpad-config";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// Canonical block explorer per chain (override with NEXT_PUBLIC_EXPLORER_URL). Used for tx/address links + the chain config.
const EXPLORERS: Record<number, string> = {
  1: "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
  8453: "https://basescan.org",
  84532: "https://sepolia.basescan.org",
  // Robinhood Chain (Blockscout). Source: https://docs.robinhood.com/chain/connecting/ + /add-network-to-wallet/
  4663: "https://robinhoodchain.blockscout.com",
  46630: "https://explorer.testnet.chain.robinhood.com",
};
const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL ?? EXPLORERS[chainId];

// Public RPC per chain. Two jobs: (1) failover for the app's read transport (below), and (2) the endpoint we
// advertise to wallets — see `walletRpcs`. Source (RH): https://docs.robinhood.com/chain/connecting/
const PUBLIC_RPCS: Record<number, string[]> = {
  1: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com", "https://cloudflare-eth.com"],
  11155111: ["https://ethereum-sepolia-rpc.publicnode.com"],
  // Robinhood Chain public RPCs (rate-limited — set NEXT_PUBLIC_RPC_URL to an Alchemy endpoint as the primary for
  // production load; these are the failover). Source: https://docs.robinhood.com/chain/connecting/
  4663: ["https://rpc.mainnet.chain.robinhood.com"],
  46630: ["https://rpc.testnet.chain.robinhood.com"],
};

// The RPC we ADVERTISE to wallets via `wallet_addEthereumChain` (fired by switchChain when a user's wallet doesn't
// yet have the chain). Must be the PUBLIC endpoint — never NEXT_PUBLIC_RPC_URL, or every user who adds the network
// permanently registers our paid/private Alchemy key in their wallet. App reads still use the paid primary via the
// `transport` below; wallets sign+broadcast through their own registered RPC. Falls back to rpcUrl for local dev.
const walletRpcs = PUBLIC_RPCS[chainId] ?? [rpcUrl];

/// The target chain is defined entirely from env, so the same build runs against anvil, Sepolia, mainnet, or any
/// L2 (matching the contracts' config-only portability).
export const activeChain = defineChain({
  id: chainId,
  name: process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: walletRpcs } },
  ...(explorerUrl ? { blockExplorers: { default: { name: "Explorer", url: explorerUrl } } } : {}),
});

// injected (MetaMask / Rabby / Brave / the Coinbase extension — all expose window.ethereum) + WalletConnect
// (broad mobile coverage incl. Coinbase Wallet mobile, only enabled when a project id is set). The dedicated
// Coinbase Wallet SDK connector is intentionally NOT used: it eagerly probes for the native Coinbase app on page
// load, triggering a scary "access other apps on this device" browser prompt before the user clicks Connect.
// WC metadata.url must match the page's real origin — a mismatch (e.g. claiming prynt.fun while running on
// localhost) trips Reown's Verify API and makes safety-minded wallet apps flag or drop the session.
const siteUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_SITE_URL ?? "https://prynt.fun");

/// SINGLE-TENANT BRANDING FOR THE WALLET MODAL.
///
/// On an operator's own deployment every server-rendered surface is theirs, but this metadata is
/// baked in at module init on the CLIENT, where there is no request and no server round trip — so
/// without this the wallet pop-up said "prynt" in prynt's green on somebody else's domain, and the
/// documented remedy (set NEXT_PUBLIC_LAUNCHPAD_CONFIG) did nothing at all.
///
/// Only `NEXT_PUBLIC_LAUNCHPAD_CONFIG` can work here: Next substitutes NEXT_PUBLIC_* at build time
/// into the client bundle, and `LAUNCHPAD_CONFIG` collapses to undefined there. lib/launchpad-single
/// is deliberately NOT imported — it pulls in zod and throws at import, neither of which belongs in
/// the wallet path. This reader is the mirror image of that one and FAILS SOFT: a malformed value is
/// a loud 500 on the server already, so here it must never take the connect button down with it.
/// Only three cosmetic strings are read; nothing about it is authority-bearing.
function brand(): { name: string; description: string; accent: string; icon?: string } {
  const fallback = {
    name: DEFAULT_CONFIG.name,
    description: DEFAULT_CONFIG.seo.description,
    accent: DEFAULT_CONFIG.theme.accent,
  };
  const raw = process.env.NEXT_PUBLIC_LAUNCHPAD_CONFIG?.trim();
  if (!raw) return fallback;
  try {
    const value = raw.replace(/^["']|["']$/g, "").replace(/^(?:NEXT_PUBLIC_)?LAUNCHPAD_CONFIG\s*=\s*/, "");
    const json = value.startsWith("{")
      ? value
      : decodeURIComponent(
          Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
            `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`,
          ).join(""),
        );
    const cfg = JSON.parse(json) as {
      name?: unknown;
      tld?: unknown;
      seo?: { description?: unknown };
      theme?: { accent?: unknown };
      logoUrl?: unknown;
      faviconUrl?: unknown;
    };
    const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    // Hex/rgb only — this lands in a CSS custom property inside the WC modal.
    const accent = str(cfg.theme?.accent, 32);
    const icon = str(cfg.faviconUrl, 500) ?? str(cfg.logoUrl, 500);
    return {
      name: `${str(cfg.name, 32) ?? fallback.name}${str(cfg.tld, 16) ?? ""}`,
      description: str(cfg.seo?.description, 300) ?? fallback.description,
      accent: accent && /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,]+\))$/.test(accent) ? accent : fallback.accent,
      // Absolute only: a "/path" would resolve against the wallet app, not this site.
      icon: icon && /^https?:\/\//.test(icon) ? icon : undefined,
    };
  } catch {
    return fallback;
  }
}

const BRAND = brand();
export const connectors = [
  injected(),
  ...(wcProjectId
    ? [
        walletConnect({
          projectId: wcProjectId,
          showQrModal: true,
          // Match the WC QR dialog to the app: light + deep-emerald accent.
          qrModalOptions: {
            themeMode: "light",
            themeVariables: { "--wcm-accent-color": BRAND.accent, "--wcm-background-color": "#FFFFFF" },
          },
          // Branded WalletConnect modal + mobile-app deep links (Robinhood Wallet, Phantom, MetaMask mobile, …).
          // TODO(multi-tenant): on the PLATFORM deployment this metadata is still the default tenant's — it is
          // baked in at module init and there is no request/host context here, so `?tenant=` previews and
          // customer subdomains all show prynt in the wallet modal. Per-tenant WC branding would require
          // building the wagmi config lazily inside a client provider (keyed by useLaunchpad()), which changes
          // connector identity across renders and can drop live wallet sessions. Deliberately not attempted.
          // A SINGLE-TENANT deployment has exactly one brand and no such trade-off, which is what `brand()`
          // above resolves from NEXT_PUBLIC_LAUNCHPAD_CONFIG.
          metadata: {
            name: BRAND.name,
            description: BRAND.description,
            url: siteUrl,
            icons: [BRAND.icon ?? `${siteUrl}/icon.png`],
          },
        }),
      ]
    : []),
];

// The app's read transport: paid primary (NEXT_PUBLIC_RPC_URL) first, then the public failover so quotes/balances
// keep resolving when the primary rate-limits or errors under load. http({ batch }) coalesces many eth_calls into a
// single multicall — a big cut in RPC volume when ~1000 users poll quotes at once. (This is app reads only; the RPC
// advertised to wallets is `walletRpcs` above.)
const rpcUrls = [rpcUrl, ...(PUBLIC_RPCS[chainId] ?? []).filter((u) => u !== rpcUrl)];
const transport = fallback(rpcUrls.map((u) => http(u, { batch: { wait: 16 } })));

export const config = createConfig({
  chains: [activeChain],
  connectors,
  transports: { [activeChain.id]: transport },
  // Robinhood Chain produces ~10 blocks/sec; 1s polling keeps tx receipts (waitForTransactionReceipt) feeling
  // instant while staying inside public-RPC rate limits. 300ms was luxury we paid Alchemy dearly for: every open
  // tab polled ~3x/s around the clock (~260k req/day/tab), which at 864k blocks/day burned real money with zero
  // users. Reads stay http-batch-coalesced (the transport above). Source: https://docs.robinhood.com/chain/
  pollingInterval: 1000,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

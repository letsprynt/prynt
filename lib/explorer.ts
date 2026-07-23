import { activeChain } from "./wagmi";

/// Block-explorer base URL for the active chain (from wagmi's blockExplorers), or null if none is configured.
export const explorerBase = (): string | null => activeChain.blockExplorers?.default?.url ?? null;

export function txUrl(hash: string): string | null {
  const b = explorerBase();
  return b ? `${b}/tx/${hash}` : null;
}

export function addressUrl(addr: string): string | null {
  const b = explorerBase();
  return b ? `${b}/address/${addr}` : null;
}

/// Whether the active chain is a public testnet (used to surface a faucet hint + "not real funds" framing).
export const isTestnet = (): boolean => [11155111, 84532, 5, 80002, 421614, 46630].includes(activeChain.id);

/// A faucet URL for the active testnet, or null on mainnet/unknown.
export function faucetUrl(): string | null {
  switch (activeChain.id) {
    case 11155111:
      return "https://sepoliafaucet.com";
    case 84532:
      return "https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet";
    case 421614:
      return "https://www.alchemy.com/faucets/arbitrum-sepolia";
    // Robinhood Chain Testnet. Source: https://faucet.testnet.chain.robinhood.com
    case 46630:
      return "https://faucet.testnet.chain.robinhood.com";
    default:
      return null;
  }
}

/// Canonical bridge to move ETH onto the active chain for gas (mainnet only; testnets use faucetUrl). Null if none.
export function bridgeUrl(): string | null {
  switch (activeChain.id) {
    // Robinhood Chain — Arbitrum's native bridge is canonical. Source: https://docs.robinhood.com/chain/bridging/
    case 4663:
      return "https://portal.arbitrum.io/bridge?destinationChain=robinhood-chain&sourceChain=ethereum";
    default:
      return null;
  }
}

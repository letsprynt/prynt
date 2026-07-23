import type { Address } from "viem";
import { activeChain } from "./wagmi";

// Canonical Uniswap V2 Router02 + WETH per chain (override via env). Sepolia HAS Uniswap V2 deployed.
const ROUTERS: Record<number, string> = {
  1: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  11155111: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3",
  8453: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
  // Robinhood Chain (4663) — Uniswap V2 Router02. Uniswap v2/v3/v4 + UniswapX are all live on Robinhood Chain.
  // Source: https://developers.uniswap.org/contracts/v2/reference/smart-contracts/v2-deployments
  // Testnet (46630) isn't mapped yet — set NEXT_PUBLIC_UNISWAP_ROUTER for a testnet rehearsal.
  4663: "0x89e5db8b5aa49aa85ac63f691524311aeb649eba",
};
const WETHS: Record<number, string> = {
  1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  11155111: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  8453: "0x4200000000000000000000000000000000000006",
  // Robinhood Chain (4663) — canonical WETH9. Source: https://docs.robinhood.com/chain/protocol-contracts/ (+ /chain/contracts/)
  4663: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
};

export const UNISWAP_ROUTER = (process.env.NEXT_PUBLIC_UNISWAP_ROUTER ?? ROUTERS[activeChain.id] ?? "") as Address;
export const WETH = (process.env.NEXT_PUBLIC_WETH ?? WETHS[activeChain.id] ?? "") as Address;
export const uniswapConfigured =
  /^0x[0-9a-fA-F]{40}$/.test(UNISWAP_ROUTER) && /^0x[0-9a-fA-F]{40}$/.test(WETH);

// Minimal Uniswap V2 Router02 ABI for in-app swapping of graduated tokens.
/// V2 (dexTax) LaunchToken probe: reverts/undefined on V1 tokens, `true` on graduated V2 tokens — the
/// authoritative, indexer-free way to detect the 1% pair-trade tax in the swap panel.
export const dexTaxProbeAbi = [
  { type: "function", name: "dexTaxActive", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
] as const;

export const uniswapRouterAbi = [
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    // Fee-on-transfer-safe variants (V2 dexTax coins): identical args; min-received is checked on the
    // recipient's actual balance delta, so the 1% tax can't make the router revert or misprice the guard.
    type: "function",
    name: "swapExactETHForTokensSupportingFeeOnTransferTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "swapExactTokensForETHSupportingFeeOnTransferTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "swapExactETHForTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForETH",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

// Minimal Uniswap V2 pair ABI for the live liquidity / LP-burn view (read-only).
export const uniswapPairAbi = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Bonding-curve launch parameters — immutable on the BondingCurve implementation, identical for every token.
// Verified on-chain for the current (Sepolia) deploy. If the impl is redeployed with a different scale, update
// VIRTUAL_ETH (the only scale-dependent one; the token amounts are fixed). Override per-deploy via env if you want.
const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n; // 1B
const INITIAL_REAL_TOKEN = 793_100_000n * 10n ** 18n; // tokens for sale on the curve
const VIRTUAL_TOKEN_OFFSET = 279_900_000n * 10n ** 18n; // seeded virtual token reserve
const VIRTUAL_ETH = (() => {
  const env = process.env.NEXT_PUBLIC_VIRTUAL_ETH_WEI;
  if (env) { try { return BigInt(env); } catch { /* fall through */ } }
  return 50_000_000_000_000_000n; // 0.05 ETH (Sepolia dress-rehearsal scale)
})();
const TRADE_FEE_BPS = 100n; // ~1% inclusive trade fee (display estimate only)

export const LAUNCH_TOTAL_SUPPLY = TOTAL_SUPPLY;

/// Estimate the tokens a creator receives for an optional first-buy at launch (floor price) + the % of total supply.
/// Mirrors CurveMath.getTokensOut on the INITIAL reserves (real ETH = 0). Approximate ("≈") because the exact fee
/// tier and base-unit rounding are applied on-chain; good enough for a pre-launch preview.
export function previewFirstBuy(ethWei: bigint): { tokens: bigint; pctOfSupply: number } {
  if (ethWei <= 0n) return { tokens: 0n, pctOfSupply: 0 };
  const ethNet = (ethWei * (10_000n - TRADE_FEE_BPS)) / 10_000n; // net of the ~1% inclusive fee
  const vEth = VIRTUAL_ETH; // real ETH starts at 0, so the pricing reserve is just the virtual offset
  const vToken = INITIAL_REAL_TOKEN + VIRTUAL_TOKEN_OFFSET;
  let tokens = (ethNet * vToken) / (vEth + ethNet); // floor — matches CurveMath.getAmountOut
  if (tokens > INITIAL_REAL_TOKEN) tokens = INITIAL_REAL_TOKEN; // can never buy past the for-sale allocation
  const pct = (Number((tokens * 1_000_000n) / TOTAL_SUPPLY) / 1_000_000) * 100;
  return { tokens, pctOfSupply: pct };
}

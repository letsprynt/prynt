import type { Address } from "viem";
import { factoryAbi } from "./abis/factory";
import { bondingCurveAbi } from "./abis/bondingCurve";
import { launchTokenAbi } from "./abis/launchToken";
import { feeManagerAbi } from "./abis/feeManager";

const raw = process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? "";

/// Whether a real (non-zero) factory address is configured.
export const factoryConfigured =
  /^0x[0-9a-fA-F]{40}$/.test(raw) && raw.toLowerCase() !== "0x0000000000000000000000000000000000000000";

export const FACTORY_ADDRESS = raw as Address;

const fm = process.env.NEXT_PUBLIC_FEE_MANAGER_ADDRESS ?? "";
/// Shared FeeManager — custodies creator trade-fee rewards (pull-based claim).
export const FEE_MANAGER_ADDRESS = fm as Address;
export const feeManagerConfigured =
  /^0x[0-9a-fA-F]{40}$/.test(fm) && fm.toLowerCase() !== "0x0000000000000000000000000000000000000000";

export { factoryAbi, bondingCurveAbi, launchTokenAbi, feeManagerAbi };

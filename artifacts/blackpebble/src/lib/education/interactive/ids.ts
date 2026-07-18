import type { InteractiveModuleId } from "../types";

/**
 * Canonical list of registered interactive-module ids as plain data (no React),
 * so build scripts and node tests can validate content without importing the
 * lazy component registry. Kept in sync with the registry via the
 * `satisfies readonly InteractiveModuleId[]` check below and the registry's own
 * type-checked `Record<InteractiveModuleId, ...>`.
 */
export const INTERACTIVE_MODULE_IDS = [
  "pnl-simulator",
  "market-cap-calculator",
  "market-cap-fdv-simulator",
  "liquidity-price-impact-simulator",
  "slippage-simulator",
  "order-type-challenge",
  "stop-loss-take-profit-planner",
  "position-size-calculator",
  "wallet-signing-challenge",
  "seed-phrase-safety-exercise",
  "holder-concentration-explorer",
  "memecoin-launch-lifecycle",
  "bonding-curve-simulator",
  "rug-pull-scenario",
  "trading-psychology-scenarios",
] as const satisfies readonly InteractiveModuleId[];

const ID_SET = new Set<string>(INTERACTIVE_MODULE_IDS);

export function isRegisteredInteractiveId(id: string): id is InteractiveModuleId {
  return ID_SET.has(id);
}

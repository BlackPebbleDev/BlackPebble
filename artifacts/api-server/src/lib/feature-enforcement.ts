import type { FeatureFlags, FeatureFlagKey } from "./featureFlags.js";

/**
 * Pure feature-flag enforcement decisions for order-creation endpoints. Kept
 * dependency-free so the exact "which flag is required" and "is this allowed"
 * logic is unit-testable without a DB or Express.
 *
 * Enforcement principle: flags gate NEW risk (creating orders). Cancelling or
 * closing existing orders/positions is never gated, so disabling a flag can
 * never trap a user in a position they can't exit.
 */

export type OrderKind = "take_profit" | "stop_loss" | "buy_limit";

const FEATURE_LABEL: Record<FeatureFlagKey, string> = {
  buy_limits: "Buy limit orders",
  tp_sl: "Take profit / stop loss",
  multi_target_tp: "Multi-target take profit",
  experimental_utilities: "Experimental utilities",
  leverage: "Leverage trading",
  real_trading_analysis: "Real trading analysis",
  community_campaigns: "Community campaigns",
  public_paper_trading: "Public paper trading",
};

/**
 * Which feature flags an order creation requires. A second (or later)
 * take-profit on the same position additionally requires multi_target_tp; the
 * first take-profit and any stop-loss require only tp_sl.
 */
export function requiredOrderFeatures(
  kind: OrderKind,
  existingTakeProfitCount: number,
): FeatureFlagKey[] {
  switch (kind) {
    case "buy_limit":
      return ["buy_limits"];
    case "stop_loss":
      return ["tp_sl"];
    case "take_profit":
      return existingTakeProfitCount >= 1
        ? ["tp_sl", "multi_target_tp"]
        : ["tp_sl"];
    default:
      return [];
  }
}

export interface GateResult {
  ok: boolean;
  feature?: FeatureFlagKey;
  error?: string;
}

/**
 * Evaluate whether an order may be created given the current flags. Returns the
 * first missing required feature (deterministic dependency order) so the caller
 * can reject with a specific, safe message.
 */
export function evaluateOrderGate(
  kind: OrderKind,
  existingTakeProfitCount: number,
  flags: Pick<FeatureFlags, FeatureFlagKey>,
): GateResult {
  for (const f of requiredOrderFeatures(kind, existingTakeProfitCount)) {
    if (!flags[f]) {
      return { ok: false, feature: f, error: `${FEATURE_LABEL[f]} is disabled.` };
    }
  }
  return { ok: true };
}

/**
 * Static, code-verified dependencies between flags (for the admin control
 * center). A dependent flag is only meaningful when its parent is enabled.
 */
export const FLAG_DEPENDENCIES: Partial<Record<FeatureFlagKey, FeatureFlagKey[]>> = {
  multi_target_tp: ["tp_sl"],
};

/** True when every dependency of `key` is currently enabled. */
export function dependenciesSatisfied(
  key: FeatureFlagKey,
  flags: Pick<FeatureFlags, FeatureFlagKey>,
): boolean {
  const deps = FLAG_DEPENDENCIES[key] ?? [];
  return deps.every((d) => flags[d]);
}

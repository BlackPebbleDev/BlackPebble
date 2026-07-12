import { describe, it, expect } from "vitest";
import {
  requiredOrderFeatures,
  evaluateOrderGate,
  dependenciesSatisfied,
  FLAG_DEPENDENCIES,
} from "./feature-enforcement.js";
import type { FeatureFlags } from "./featureFlags.js";

const ALL_ON: FeatureFlags = {
  buy_limits: true,
  tp_sl: true,
  multi_target_tp: true,
  experimental_utilities: true,
  leverage: true,
  real_trading_analysis: true,
  community_campaigns: true,
  public_paper_trading: true,
};

describe("requiredOrderFeatures", () => {
  it("maps each order kind to its required flags", () => {
    expect(requiredOrderFeatures("buy_limit", 0)).toEqual(["buy_limits"]);
    expect(requiredOrderFeatures("stop_loss", 0)).toEqual(["tp_sl"]);
    expect(requiredOrderFeatures("take_profit", 0)).toEqual(["tp_sl"]);
  });

  it("requires multi_target_tp for a 2nd+ take-profit", () => {
    expect(requiredOrderFeatures("take_profit", 1)).toEqual([
      "tp_sl",
      "multi_target_tp",
    ]);
    expect(requiredOrderFeatures("take_profit", 3)).toEqual([
      "tp_sl",
      "multi_target_tp",
    ]);
  });
});

describe("evaluateOrderGate", () => {
  it("allows orders when required flags are on", () => {
    expect(evaluateOrderGate("buy_limit", 0, ALL_ON).ok).toBe(true);
    expect(evaluateOrderGate("stop_loss", 0, ALL_ON).ok).toBe(true);
    expect(evaluateOrderGate("take_profit", 2, ALL_ON).ok).toBe(true);
  });

  it("blocks a buy limit when buy_limits is disabled", () => {
    const r = evaluateOrderGate("buy_limit", 0, { ...ALL_ON, buy_limits: false });
    expect(r.ok).toBe(false);
    expect(r.feature).toBe("buy_limits");
    expect(r.error).toMatch(/disabled/i);
  });

  it("blocks TP and SL when tp_sl is disabled", () => {
    expect(evaluateOrderGate("stop_loss", 0, { ...ALL_ON, tp_sl: false }).feature).toBe("tp_sl");
    expect(evaluateOrderGate("take_profit", 0, { ...ALL_ON, tp_sl: false }).feature).toBe("tp_sl");
  });

  it("blocks a 2nd take-profit when multi_target_tp is disabled but allows the first", () => {
    const flags = { ...ALL_ON, multi_target_tp: false };
    expect(evaluateOrderGate("take_profit", 0, flags).ok).toBe(true);
    const second = evaluateOrderGate("take_profit", 1, flags);
    expect(second.ok).toBe(false);
    expect(second.feature).toBe("multi_target_tp");
  });

  it("reports the parent dependency first (tp_sl before multi_target_tp)", () => {
    const flags = { ...ALL_ON, tp_sl: false, multi_target_tp: false };
    expect(evaluateOrderGate("take_profit", 1, flags).feature).toBe("tp_sl");
  });
});

describe("dependenciesSatisfied", () => {
  it("multi_target_tp depends on tp_sl", () => {
    expect(FLAG_DEPENDENCIES.multi_target_tp).toEqual(["tp_sl"]);
    expect(dependenciesSatisfied("multi_target_tp", ALL_ON)).toBe(true);
    expect(
      dependenciesSatisfied("multi_target_tp", { ...ALL_ON, tp_sl: false }),
    ).toBe(false);
  });

  it("a flag with no dependencies is always satisfied", () => {
    expect(dependenciesSatisfied("leverage", { ...ALL_ON, tp_sl: false })).toBe(true);
  });
});

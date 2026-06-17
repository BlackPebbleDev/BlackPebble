import { describe, it, expect } from "vitest";
import {
  solUsdFromInfo,
  selectTradeRate,
  amountToSol,
  RATE_ANOMALY_FACTOR,
} from "./trade-rate";

describe("solUsdFromInfo", () => {
  it("derives the rate from a complete quote", () => {
    expect(solUsdFromInfo({ priceUsd: 0.002, priceSol: 0.00002 })).toBeCloseTo(
      100,
    );
  });

  it("returns null on missing or zero/invalid fields", () => {
    expect(solUsdFromInfo({ priceUsd: null, priceSol: 0.1 })).toBeNull();
    expect(solUsdFromInfo({ priceUsd: 1, priceSol: null })).toBeNull();
    expect(solUsdFromInfo({ priceUsd: 1, priceSol: 0 })).toBeNull();
    expect(solUsdFromInfo({ priceUsd: NaN, priceSol: 1 })).toBeNull();
  });
});

describe("selectTradeRate", () => {
  it("prefers the authoritative rate for sizing and display", () => {
    const r = selectTradeRate(150, 150);
    expect(r.rate).toBe(150);
    expect(r.solUsd).toBe(150);
    expect(r.rateReady).toBe(true);
    expect(r.anomaly).toBe(false);
  });

  it("never sizes against a token rate when authoritative is missing", () => {
    const r = selectTradeRate(0, 1); // the ~1 collapse case
    expect(r.rate).toBeNull(); // cannot size
    expect(r.rateReady).toBe(false); // submission disabled
    expect(r.solUsd).toBe(1); // display fallback only
  });

  it("uses authoritative even when the token quote collapsed to ~1", () => {
    const r = selectTradeRate(105.6, 1); // stale quote → ~1
    expect(r.rate).toBe(105.6);
    expect(r.solUsd).toBe(105.6);
    expect(r.anomaly).toBe(true); // divergence detected
  });

  it("flags an anomaly only beyond the divergence factor", () => {
    expect(selectTradeRate(100, 100 * RATE_ANOMALY_FACTOR - 1).anomaly).toBe(
      false,
    );
    expect(selectTradeRate(100, 100 * RATE_ANOMALY_FACTOR + 1).anomaly).toBe(
      true,
    );
  });

  it("zeroes out display when nothing is available", () => {
    const r = selectTradeRate(0, null);
    expect(r.solUsd).toBe(0);
    expect(r.rate).toBeNull();
    expect(r.rateReady).toBe(false);
  });
});

describe("amountToSol", () => {
  it("passes SOL amounts straight through", () => {
    expect(amountToSol("2.5", "SOL", 150)).toBe(2.5);
  });

  it("converts USD using the trusted rate", () => {
    expect(amountToSol(500, "USD", 100)).toBe(5);
  });

  it("fails closed (NaN) for USD with no trusted rate", () => {
    expect(amountToSol(500, "USD", null)).toBeNaN();
    expect(amountToSol(500, "USD", 0)).toBeNaN();
  });

  it("rejects invalid amounts", () => {
    expect(amountToSol("0", "SOL", 150)).toBeNaN();
    expect(amountToSol("abc", "USD", 150)).toBeNaN();
    expect(amountToSol(-3, "SOL", 150)).toBeNaN();
  });

  describe("the $56.83 regression scenario", () => {
    // 56.83 SOL balance, authoritative rate ~105.6 USD/SOL.
    const balanceSol = 56.83;
    const authRate = 105.6;
    const tokenCollapsed = 1; // stale quote

    it("renders the balance in USD using the authoritative rate", () => {
      const { solUsd } = selectTradeRate(authRate, tokenCollapsed);
      expect(balanceSol * solUsd).toBeCloseTo(6001.25, 0); // ~$6.0K, not $56.83
    });

    it("sizes a $500 margin well within the balance", () => {
      const { rate } = selectTradeRate(authRate, tokenCollapsed);
      const marginSol = amountToSol(500, "USD", rate);
      expect(marginSol).toBeCloseTo(4.735, 2);
      expect(marginSol).toBeLessThan(balanceSol); // no false rejection
    });
  });
});

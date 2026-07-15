import { describe, expect, it } from "vitest";
import {
  classifyRefundRisk,
  depositFailureAction,
  milestonesCrossed,
  reconcileCampaign,
  resolveSettlementDestinations,
  MAX_DEPOSIT_PARSE_ATTEMPTS,
} from "./campaign-recon.js";
import type { SettlementPlan } from "./campaign-math.js";

const SOL = 1_000_000_000;

describe("resolveSettlementDestinations", () => {
  const plan: SettlementPlan = {
    payoutLamports: 9.7 * SOL,
    feeLamports: 0.3 * SOL,
    excessLamports: 2 * SOL,
  };

  it("keeps the fee separate when a fee wallet exists", () => {
    const d = resolveSettlementDestinations(plan, true);
    expect(d.payoutLamports).toBe(9.7 * SOL);
    expect(d.feeLamports).toBe(0.3 * SOL);
    expect(d.excessLamports).toBe(2 * SOL);
  });

  it("folds the fee into the payout when no fee wallet (no stranded fee)", () => {
    const d = resolveSettlementDestinations(plan, false);
    expect(d.payoutLamports).toBe(10 * SOL);
    expect(d.feeLamports).toBe(0);
    // Every lamport of the goal still has exactly one destination.
    expect(d.payoutLamports + d.feeLamports).toBe(10 * SOL);
  });

  it("is a no-op fold when the fee is already zero", () => {
    const zero: SettlementPlan = {
      payoutLamports: 10 * SOL,
      feeLamports: 0,
      excessLamports: 0,
    };
    expect(resolveSettlementDestinations(zero, false)).toEqual({
      payoutLamports: 10 * SOL,
      feeLamports: 0,
      excessLamports: 0,
    });
  });
});

describe("classifyRefundRisk", () => {
  it("flags known exchange wallets", () => {
    expect(
      classifyRefundRisk({ isSystemOwned: true, isKnownExchange: true }),
    ).toBe("exchange");
  });
  it("flags program-owned accounts", () => {
    expect(
      classifyRefundRisk({ isSystemOwned: false, isKnownExchange: false }),
    ).toBe("program");
  });
  it("reports unknown when ownership could not be resolved", () => {
    expect(
      classifyRefundRisk({ isSystemOwned: null, isKnownExchange: false }),
    ).toBe("unknown");
  });
  it("passes a normal self-custody wallet", () => {
    expect(
      classifyRefundRisk({ isSystemOwned: true, isKnownExchange: false }),
    ).toBe("ok");
  });
});

describe("depositFailureAction", () => {
  it("retries below the ceiling", () => {
    expect(depositFailureAction(1)).toBe("retry");
    expect(depositFailureAction(MAX_DEPOSIT_PARSE_ATTEMPTS - 1)).toBe("retry");
  });
  it("flags at or beyond the ceiling", () => {
    expect(depositFailureAction(MAX_DEPOSIT_PARSE_ATTEMPTS)).toBe("flag");
    expect(depositFailureAction(MAX_DEPOSIT_PARSE_ATTEMPTS + 3)).toBe("flag");
  });
});

describe("milestonesCrossed", () => {
  it("reports each milestone crossed once", () => {
    expect(milestonesCrossed(0, 0.3)).toEqual([25]);
    expect(milestonesCrossed(0.3, 0.8)).toEqual([50, 75]);
    expect(milestonesCrossed(0.8, 1)).toEqual([100]);
  });
  it("reports nothing when progress does not advance a mark", () => {
    expect(milestonesCrossed(0.26, 0.4)).toEqual([]);
  });
  it("reports all marks on a single jump to fully funded", () => {
    expect(milestonesCrossed(0, 1.5)).toEqual([25, 50, 75, 100]);
  });
});

describe("reconcileCampaign", () => {
  it("is healthy when balance equals remaining", () => {
    const r = reconcileCampaign({
      state: "live",
      ledgerRemaining: 5 * SOL,
      onChainBalance: 5 * SOL,
      unresolvedDepositFailures: 0,
      outstandingRefunds: 0,
    });
    expect(r.severity).toBe("ok");
    expect(r.warnings).toHaveLength(0);
    expect(r.balanceDiff).toBe(0);
  });

  it("is CRITICAL when escrow holds less than the ledger expects", () => {
    const r = reconcileCampaign({
      state: "funded",
      ledgerRemaining: 5 * SOL,
      onChainBalance: 4 * SOL,
      unresolvedDepositFailures: 0,
      outstandingRefunds: 0,
    });
    expect(r.severity).toBe("critical");
    expect(r.balanceDiff).toBe(-1 * SOL);
  });

  it("warns (not critical) when escrow holds uncredited extra", () => {
    const r = reconcileCampaign({
      state: "live",
      ledgerRemaining: 5 * SOL,
      onChainBalance: 6 * SOL,
      unresolvedDepositFailures: 1,
      outstandingRefunds: 0,
    });
    expect(r.severity).toBe("warning");
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("warns on outstanding refunds for a failed campaign", () => {
    const r = reconcileCampaign({
      state: "failed",
      ledgerRemaining: 3 * SOL,
      onChainBalance: 3 * SOL,
      unresolvedDepositFailures: 0,
      outstandingRefunds: 2,
    });
    expect(r.severity).toBe("warning");
  });

  it("critical wins over warning", () => {
    const r = reconcileCampaign({
      state: "frozen",
      ledgerRemaining: 5 * SOL,
      onChainBalance: 1 * SOL,
      unresolvedDepositFailures: 3,
      outstandingRefunds: 0,
    });
    expect(r.severity).toBe("critical");
  });
});

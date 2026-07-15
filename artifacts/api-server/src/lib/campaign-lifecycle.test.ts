import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  canAcceptPublicContribution,
  dueFundingTransition,
  isMoneyActive,
  isRefundLocked,
  isTerminal,
  LIFECYCLE_STATES,
  normalizeState,
} from "./campaign-lifecycle.js";

describe("normalizeState (legacy mapping)", () => {
  it("maps Phase 1 states to canonical Phase 2 states", () => {
    expect(normalizeState("settled")).toBe("completed");
    expect(normalizeState("failed")).toBe("expired");
    expect(normalizeState("pending_funding")).toBe("awaiting_initial_contribution");
  });
  it("passes through canonical states unchanged", () => {
    for (const s of LIFECYCLE_STATES) expect(normalizeState(s)).toBe(s);
  });
});

describe("canTransition", () => {
  it("allows the primary success flow", () => {
    expect(canTransition("draft", "awaiting_initial_contribution")).toBe(true);
    expect(canTransition("awaiting_initial_contribution", "live")).toBe(true);
    expect(canTransition("live", "funded")).toBe(true);
    expect(canTransition("funded", "awaiting_execution")).toBe(true);
    expect(canTransition("awaiting_execution", "executing")).toBe(true);
    expect(canTransition("executing", "completed")).toBe(true);
  });
  it("allows the funding-failure flow", () => {
    expect(canTransition("live", "expired")).toBe(true);
    expect(canTransition("expired", "refunding")).toBe(true);
    expect(canTransition("refunding", "refunded")).toBe(true);
  });
  it("allows the execution-failure flow", () => {
    expect(canTransition("awaiting_execution", "execution_failed")).toBe(true);
    expect(canTransition("execution_failed", "refunding")).toBe(true);
  });
  it("allows freeze from every money-active state", () => {
    for (const s of ["live", "funded", "awaiting_execution", "executing", "expired", "refunding"]) {
      expect(canTransition(s, "frozen")).toBe(true);
    }
  });
  it("rejects invalid transitions", () => {
    expect(canTransition("completed", "live")).toBe(false);
    expect(canTransition("refunded", "executing")).toBe(false);
    expect(canTransition("live", "completed")).toBe(false);
    expect(canTransition("refunding", "executing")).toBe(false);
  });
  it("honors legacy names on the from side", () => {
    // legacy 'settled' normalizes to terminal 'completed' - no transitions out.
    expect(canTransition("settled", "live")).toBe(false);
    // legacy 'failed' -> 'expired' can start refunding.
    expect(canTransition("failed", "refunding")).toBe(true);
  });
});

describe("state predicates", () => {
  it("classifies money-active states", () => {
    expect(isMoneyActive("live")).toBe(true);
    expect(isMoneyActive("executing")).toBe(true);
    expect(isMoneyActive("draft")).toBe(false);
    expect(isMoneyActive("completed")).toBe(false);
  });
  it("classifies terminal states", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("refunded")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("live")).toBe(false);
  });
  it("blocks execution once refunds start", () => {
    expect(isRefundLocked("refunding")).toBe(true);
    expect(isRefundLocked("refunded")).toBe(true);
    expect(isRefundLocked("awaiting_execution")).toBe(false);
  });
  it("only allows public contributions while live", () => {
    expect(canAcceptPublicContribution("live")).toBe(true);
    expect(canAcceptPublicContribution("funded")).toBe(false);
    expect(canAcceptPublicContribution("awaiting_initial_contribution")).toBe(false);
  });
});

describe("dueFundingTransition", () => {
  const goal = 10_000;
  const deadline = 1000;
  it("funds when the goal is reached", () => {
    expect(dueFundingTransition("live", goal, goal, deadline, 500)).toBe("funded");
  });
  it("expires when the deadline passes below goal", () => {
    expect(dueFundingTransition("live", goal - 1, goal, deadline, 1001)).toBe("expired");
  });
  it("does nothing mid-flight", () => {
    expect(dueFundingTransition("live", 1, goal, deadline, 500)).toBeNull();
  });
  it("only acts on live campaigns", () => {
    expect(dueFundingTransition("funded", goal, goal, deadline, 2000)).toBeNull();
  });
});

describe("ALLOWED_TRANSITIONS integrity", () => {
  it("only references known states", () => {
    const known = new Set<string>(LIFECYCLE_STATES);
    for (const [from, tos] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(known.has(from)).toBe(true);
      for (const to of tos) expect(known.has(to)).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  canTransition,
  computeCampaignTrustScore,
  dueTransition,
  fundingProgress,
  planExcessRefunds,
  planFailureRefunds,
  planSettlement,
  resolveGoalLamports,
  summarizeLedger,
  validateCampaignInput,
  CAMPAIGN_TYPE_DEFS,
  REFUND_NETWORK_FEE_LAMPORTS,
  type ContributionLike,
  type LedgerRow,
} from "./campaign-math.js";

const SOL = 1_000_000_000;

describe("summarizeLedger", () => {
  it("balances deposits against outflows", () => {
    const rows: LedgerRow[] = [
      { kind: "deposit", lamports: 5 * SOL },
      { kind: "deposit", lamports: 2 * SOL },
      { kind: "payout", lamports: 4 * SOL },
      { kind: "fee", lamports: 0.2 * SOL },
      { kind: "refund", lamports: 1 * SOL },
    ];
    const s = summarizeLedger(rows);
    expect(s.deposited).toBe(7 * SOL);
    expect(s.paidOut).toBe(4 * SOL);
    expect(s.fees).toBe(0.2 * SOL);
    expect(s.refunded).toBe(1 * SOL);
    expect(s.remaining).toBe(1.8 * SOL);
    // The core invariant: everything is accounted for.
    expect(s.deposited).toBe(s.paidOut + s.refunded + s.fees + s.remaining);
  });

  it("rejects negative amounts", () => {
    expect(() =>
      summarizeLedger([{ kind: "deposit", lamports: -1 }]),
    ).toThrow();
  });

  it("empty ledger sums to zero", () => {
    const s = summarizeLedger([]);
    expect(s.remaining).toBe(0);
    expect(s.deposited).toBe(0);
  });
});

describe("state machine", () => {
  it("allows only legal transitions", () => {
    expect(canTransition("live", "funded")).toBe(true);
    expect(canTransition("live", "failed")).toBe(true);
    expect(canTransition("funded", "settled")).toBe(true);
    expect(canTransition("failed", "refunded")).toBe(true);
    // Money-safety: settled/refunded are terminal.
    expect(canTransition("settled", "live")).toBe(false);
    expect(canTransition("refunded", "live")).toBe(false);
    // A failed campaign can never be settled (funds are owed back).
    expect(canTransition("failed", "settled")).toBe(false);
    // Frozen campaigns cannot settle directly.
    expect(canTransition("frozen", "settled")).toBe(false);
  });

  it("goal reached transitions live → funded", () => {
    expect(dueTransition("live", 10 * SOL, 10 * SOL, 9999, 100)).toBe("funded");
    expect(dueTransition("live", 11 * SOL, 10 * SOL, 9999, 100)).toBe("funded");
  });

  it("deadline below goal transitions live → failed", () => {
    expect(dueTransition("live", 5 * SOL, 10 * SOL, 200, 200)).toBe("failed");
    expect(dueTransition("live", 5 * SOL, 10 * SOL, 200, 300)).toBe("failed");
  });

  it("no transition while live, underfunded, before deadline", () => {
    expect(dueTransition("live", 5 * SOL, 10 * SOL, 200, 100)).toBeNull();
  });

  it("goal reached wins even at the deadline", () => {
    expect(dueTransition("live", 10 * SOL, 10 * SOL, 200, 200)).toBe("funded");
  });

  it("non-live states never auto-transition", () => {
    expect(dueTransition("funded", 10 * SOL, 10 * SOL, 200, 300)).toBeNull();
    expect(dueTransition("frozen", 0, 10 * SOL, 200, 300)).toBeNull();
  });
});

describe("planFailureRefunds", () => {
  const contribs: ContributionLike[] = [
    { id: 1, contributor: "AAA", lamports: 2 * SOL, refunded: false },
    { id: 2, contributor: "BBB", lamports: 1 * SOL, refunded: true },
    { id: 3, contributor: "CCC", lamports: 3_000, refunded: false }, // dust
  ];

  it("refunds full amounts minus only the network fee", () => {
    const plan = planFailureRefunds(contribs);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({
      contributionId: 1,
      destination: "AAA",
      lamports: 2 * SOL - REFUND_NETWORK_FEE_LAMPORTS,
    });
  });

  it("skips already-refunded and dust contributions", () => {
    const plan = planFailureRefunds(contribs);
    expect(plan.some((p) => p.contributionId === 2)).toBe(false);
    expect(plan.some((p) => p.contributionId === 3)).toBe(false);
  });
});

describe("planExcessRefunds", () => {
  it("returns overfunding pro-rata", () => {
    const contribs: ContributionLike[] = [
      { id: 1, contributor: "AAA", lamports: 3 * SOL, refunded: false },
      { id: 2, contributor: "BBB", lamports: 1 * SOL, refunded: false },
    ];
    const plan = planExcessRefunds(contribs, 1 * SOL);
    expect(plan).toHaveLength(2);
    // AAA contributed 75% → gets 0.75 SOL minus fee.
    expect(plan[0].lamports).toBe(0.75 * SOL - REFUND_NETWORK_FEE_LAMPORTS);
    expect(plan[1].lamports).toBe(0.25 * SOL - REFUND_NETWORK_FEE_LAMPORTS);
  });

  it("never plans more than the excess", () => {
    const contribs: ContributionLike[] = [
      { id: 1, contributor: "AAA", lamports: 7 * SOL, refunded: false },
      { id: 2, contributor: "BBB", lamports: 5 * SOL, refunded: false },
    ];
    const excess = 2 * SOL;
    const plan = planExcessRefunds(contribs, excess);
    const total = plan.reduce((s, p) => s + p.lamports, 0);
    expect(total).toBeLessThanOrEqual(excess);
  });

  it("no excess → no refunds", () => {
    expect(planExcessRefunds([], 0)).toEqual([]);
    expect(
      planExcessRefunds(
        [{ id: 1, contributor: "A", lamports: SOL, refunded: false }],
        0,
      ),
    ).toEqual([]);
  });
});

describe("planSettlement", () => {
  it("splits goal into payout + fee, excess separately", () => {
    const plan = planSettlement(12 * SOL, 10 * SOL, 300); // 3%
    expect(plan.feeLamports).toBe(0.3 * SOL);
    expect(plan.payoutLamports).toBe(9.7 * SOL);
    expect(plan.excessLamports).toBe(2 * SOL);
    // Fee + payout exactly equals the goal - nothing leaks.
    expect(plan.payoutLamports + plan.feeLamports).toBe(10 * SOL);
  });

  it("fee applies to the goal, never the excess", () => {
    const withExcess = planSettlement(20 * SOL, 10 * SOL, 500);
    const without = planSettlement(10 * SOL, 10 * SOL, 500);
    expect(withExcess.feeLamports).toBe(without.feeLamports);
  });

  it("refuses to settle below goal", () => {
    expect(() => planSettlement(9 * SOL, 10 * SOL, 300)).toThrow();
  });

  it("rejects absurd fees", () => {
    expect(() => planSettlement(10 * SOL, 10 * SOL, 5_000)).toThrow();
  });

  it("zero fee settles cleanly", () => {
    const plan = planSettlement(10 * SOL, 10 * SOL, 0);
    expect(plan.feeLamports).toBe(0);
    expect(plan.payoutLamports).toBe(10 * SOL);
  });
});

describe("computeCampaignTrustScore", () => {
  const base = {
    creatorTrustScore: 0,
    creatorAccountAgeDays: 0,
    creatorSettledCampaigns: 0,
    creatorFailedCampaigns: 0,
    hasCompleteBrief: false,
    hasImage: false,
    hasLink: false,
  };

  it("brand-new creator with bare campaign scores low", () => {
    const score = computeCampaignTrustScore(base);
    expect(score).toBeLessThanOrEqual(15); // only the neutral-history 10
  });

  it("established creator with complete campaign scores high", () => {
    const score = computeCampaignTrustScore({
      creatorTrustScore: 90,
      creatorAccountAgeDays: 400,
      creatorSettledCampaigns: 5,
      creatorFailedCampaigns: 0,
      hasCompleteBrief: true,
      hasImage: true,
      hasLink: true,
    });
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it("failed campaign history drags the score down", () => {
    const clean = computeCampaignTrustScore({
      ...base,
      creatorTrustScore: 60,
      creatorSettledCampaigns: 4,
    });
    const dirty = computeCampaignTrustScore({
      ...base,
      creatorTrustScore: 60,
      creatorSettledCampaigns: 1,
      creatorFailedCampaigns: 3,
    });
    expect(dirty).toBeLessThan(clean);
  });

  it("is always clamped to 0–100", () => {
    const max = computeCampaignTrustScore({
      creatorTrustScore: 1_000,
      creatorAccountAgeDays: 10_000,
      creatorSettledCampaigns: 100,
      creatorFailedCampaigns: 0,
      hasCompleteBrief: true,
      hasImage: true,
      hasLink: true,
    });
    expect(max).toBeLessThanOrEqual(100);
    expect(computeCampaignTrustScore(base)).toBeGreaterThanOrEqual(0);
  });
});

describe("validateCampaignInput", () => {
  const valid = {
    title: "List our community token",
    brief: "A campaign to fund the DEXScreener listing for our community.",
    typeKey: "dex_listing",
    goalLamports: 2 * SOL,
    durationSec: 24 * 3600,
  };

  it("accepts a well-formed campaign", () => {
    expect(validateCampaignInput(valid)).toBeNull();
  });

  it("rejects bad titles, briefs, types, goals, durations", () => {
    expect(validateCampaignInput({ ...valid, title: "ab" })).toBeTruthy();
    expect(validateCampaignInput({ ...valid, brief: "short" })).toBeTruthy();
    expect(validateCampaignInput({ ...valid, typeKey: "nope" })).toBeTruthy();
    expect(
      validateCampaignInput({ ...valid, goalLamports: 1_000 }),
    ).toBeTruthy();
    expect(
      validateCampaignInput({ ...valid, goalLamports: 1.5 }),
    ).toBeTruthy();
    expect(
      validateCampaignInput({ ...valid, durationSec: 60 }),
    ).toBeTruthy();
    expect(
      validateCampaignInput({ ...valid, durationSec: 90 * 86_400 }),
    ).toBeTruthy();
  });
});

describe("resolveGoalLamports", () => {
  it("preset types convert USD goals at the live SOL price", () => {
    const r = resolveGoalLamports({
      typeKey: "dextools_listing",
      goalUsd: 340,
      goalSol: null,
      solPriceUsd: 170,
    });
    expect(r).toEqual({ lamports: 2 * SOL }); // $340 / $170 = 2 SOL
  });

  it("preset types reject amounts not in the catalogue", () => {
    const r = resolveGoalLamports({
      typeKey: "dex_listing",
      goalUsd: 100,
      goalSol: null,
      solPriceUsd: 170,
    });
    expect("error" in r).toBe(true);
  });

  it("boost tiers accept every listed tier and nothing else", () => {
    for (const usd of [110, 275, 440, 990, 4_400]) {
      const r = resolveGoalLamports({
        typeKey: "dex_boost",
        goalUsd: usd,
        goalSol: null,
        solPriceUsd: 200,
      });
      expect("lamports" in r).toBe(true);
    }
    const bad = resolveGoalLamports({
      typeKey: "dex_boost",
      goalUsd: 300,
      goalSol: null,
      solPriceUsd: 200,
    });
    expect("error" in bad).toBe(true);
  });

  it("nitro tiers accept every listed tier", () => {
    for (const usd of [220, 550, 990, 4_400]) {
      const r = resolveGoalLamports({
        typeKey: "dextools_nitro",
        goalUsd: usd,
        goalSol: null,
        solPriceUsd: 200,
      });
      expect("lamports" in r).toBe(true);
    }
  });

  it("preset types fail closed without a SOL price", () => {
    const r = resolveGoalLamports({
      typeKey: "community_takeover",
      goalUsd: 220,
      goalSol: null,
      solPriceUsd: 0,
    });
    expect("error" in r).toBe(true);
  });

  it("unknown types are rejected", () => {
    const r = resolveGoalLamports({
      typeKey: "nope",
      goalUsd: 100,
      goalSol: null,
      solPriceUsd: 100,
    });
    expect("error" in r).toBe(true);
  });
});

describe("campaign type catalogue", () => {
  it("every type has a label, description, group, and token requirement", () => {
    for (const def of CAMPAIGN_TYPE_DEFS) {
      expect(def.label.length).toBeGreaterThan(2);
      expect(def.description.length).toBeGreaterThan(10);
      expect(def.group.length).toBeGreaterThan(2);
      expect(typeof def.requiresToken).toBe("boolean");
    }
  });

  it("every type has set-in-stone goal tiers (no custom goals)", () => {
    for (const def of CAMPAIGN_TYPE_DEFS) {
      expect(def.goalOptions.length).toBeGreaterThan(0);
      for (const o of def.goalOptions) {
        expect(o.usd).toBeGreaterThan(0);
        expect(o.label.length).toBeGreaterThan(2);
        expect(o.description.length).toBeGreaterThan(10);
      }
    }
  });

  it("listing combos cost more than listing alone and scale with the boost", () => {
    const listing = CAMPAIGN_TYPE_DEFS.find((d) => d.key === "dex_listing")!;
    const prices = listing.goalOptions.map((o) => o.usd);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThan(prices[i - 1]);
    }
  });

  it("no user-facing catalogue text contains an em dash", () => {
    for (const def of CAMPAIGN_TYPE_DEFS) {
      expect(def.label).not.toContain("\u2014");
      expect(def.description).not.toContain("\u2014");
      for (const o of def.goalOptions) {
        expect(o.label).not.toContain("\u2014");
        expect(o.description).not.toContain("\u2014");
      }
    }
  });

  it("goals carry a margin over known retail prices", () => {
    // 10× boost retails at $99; goal must cover retail + processing.
    const boost = CAMPAIGN_TYPE_DEFS.find((d) => d.key === "dex_boost")!;
    expect(boost.goalOptions![0].usd).toBeGreaterThan(99);
    // Nitro 200 retails at $199.
    const nitro = CAMPAIGN_TYPE_DEFS.find((d) => d.key === "dextools_nitro")!;
    expect(nitro.goalOptions![0].usd).toBeGreaterThan(199);
  });
});

describe("fundingProgress", () => {
  it("reports progress and overfunding", () => {
    expect(fundingProgress(5 * SOL, 10 * SOL)).toBe(0.5);
    expect(fundingProgress(15 * SOL, 10 * SOL)).toBe(1.5);
    expect(fundingProgress(0, 0)).toBe(0);
  });
});

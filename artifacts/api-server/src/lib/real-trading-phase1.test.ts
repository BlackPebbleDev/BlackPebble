/**
 * Phase 1 (trustworthiness) regression suite.
 *
 * Locks in the correctness fixes from the Trader Intelligence Master Audit:
 * WSOL/token-to-token parsing, fee & rent exclusion, wallet-value
 * reconciliation, confidence gating, behavior confidence, and archetype
 * stability. All pure - no DB/network required.
 */
import { describe, expect, it } from "vitest";
import {
  ATA_RENT_LAMPORTS,
  classifySwap,
  matchFifo,
  computeMetrics,
  type ParsedSwapEvent,
} from "./real-trading-math";
import {
  confidenceTier,
  overallAnalysisConfidence,
  MIN_SAMPLES_FOR_SCORE,
} from "./real-trading-confidence";
import { reconcilePortfolio } from "./real-trading-portfolio";
import { computeSignals } from "./real-trading-signals";
import { analyzeBehavior } from "./real-trading-behavior";
import {
  classifyArchetypes,
  areContradictory,
  type DnaVector,
} from "./real-trading-dna";

const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const WSOL = "So11111111111111111111111111111111111111112";
const TOKEN = "TokenMint11111111111111111111111111111111";

// ── Part 2: Parser ──────────────────────────────────────────────────────────

describe("parser: WSOL-settled swaps", () => {
  it("folds WSOL token transfers into the SOL leg for a buy", () => {
    const res = classifySwap(
      WALLET,
      "wsolbuy",
      1000,
      [
        { mint: TOKEN, fromUserAccount: "pool", toUserAccount: WALLET, tokenAmount: 1000 },
        { mint: WSOL, fromUserAccount: WALLET, toUserAccount: "pool", tokenAmount: 0.5 },
      ],
      [], // no native SOL leg - purely WSOL settled
      "JUPITER",
    );
    expect(res.skipReason).toBeNull();
    expect(res.event).not.toBeNull();
    expect(res.event!.side).toBe("buy");
    expect(res.event!.tokenMint).toBe(TOKEN);
    expect(res.event!.tokenAmount).toBe(1000);
    expect(res.event!.solAmount).toBeCloseTo(0.5, 9);
  });

  it("folds WSOL into the SOL leg for a sell (wallet receives WSOL)", () => {
    const res = classifySwap(
      WALLET,
      "wsolsell",
      2000,
      [
        { mint: TOKEN, fromUserAccount: WALLET, toUserAccount: "pool", tokenAmount: 500 },
        { mint: WSOL, fromUserAccount: "pool", toUserAccount: WALLET, tokenAmount: 0.75 },
      ],
      [],
      "JUPITER",
    );
    expect(res.event!.side).toBe("sell");
    expect(res.event!.solAmount).toBeCloseTo(0.75, 9);
  });
});

describe("parser: token-to-token swaps", () => {
  it("reports token↔token (no SOL leg) instead of silently dropping it", () => {
    const res = classifySwap(
      WALLET,
      "t2t",
      3000,
      [
        { mint: "AAAA", fromUserAccount: WALLET, toUserAccount: "pool", tokenAmount: 100 },
        { mint: "BBBB", fromUserAccount: "pool", toUserAccount: WALLET, tokenAmount: 50 },
      ],
      [],
      "JUPITER",
    );
    expect(res.event).toBeNull();
    expect(res.tokenToToken).toBe(true);
    expect(res.skipReason).toBe("token_to_token_no_sol");
  });
});

describe("parser: fee & rent exclusion (cost basis hygiene)", () => {
  it("strips ATA rent from the SOL leg", () => {
    const res = classifySwap(
      WALLET,
      "rentbuy",
      4000,
      [{ mint: TOKEN, fromUserAccount: "pool", toUserAccount: WALLET, tokenAmount: 1000 }],
      [
        { fromUserAccount: WALLET, toUserAccount: "pool", amount: 500_000_000 },
        { fromUserAccount: WALLET, toUserAccount: "ata", amount: ATA_RENT_LAMPORTS },
      ],
      "RAYDIUM",
    );
    // Rent must not inflate cost basis - only the 0.5 SOL swap leg remains.
    expect(res.event!.solAmount).toBeCloseTo(0.5, 9);
    expect(res.rentStrippedLamports).toBe(ATA_RENT_LAMPORTS);
  });

  it("keeps the network fee OUT of the SOL leg and surfaces it", () => {
    const res = classifySwap(
      WALLET,
      "feebuy",
      5000,
      [{ mint: TOKEN, fromUserAccount: "pool", toUserAccount: WALLET, tokenAmount: 1000 }],
      [{ fromUserAccount: WALLET, toUserAccount: "pool", amount: 500_000_000 }],
      "RAYDIUM",
      { feeLamports: 5_000, feePayer: WALLET },
    );
    expect(res.event!.solAmount).toBeCloseTo(0.5, 9);
    expect(res.feeLamports).toBe(5_000);
  });

  it("only attributes the fee to the wallet when it is the fee payer", () => {
    const res = classifySwap(
      WALLET,
      "feeother",
      5100,
      [{ mint: TOKEN, fromUserAccount: "pool", toUserAccount: WALLET, tokenAmount: 1000 }],
      [{ fromUserAccount: WALLET, toUserAccount: "pool", amount: 500_000_000 }],
      "RAYDIUM",
      { feeLamports: 5_000, feePayer: "someone-else" },
    );
    expect(res.feeLamports).toBe(0);
  });
});

describe("parser: duplicate token accounts", () => {
  it("sums deltas across multiple token accounts for the same mint", () => {
    const res = classifySwap(
      WALLET,
      "dupacct",
      6000,
      [
        { mint: TOKEN, fromUserAccount: "pool", toUserAccount: WALLET, tokenAmount: 600 },
        { mint: TOKEN, fromUserAccount: "pool", toUserAccount: WALLET, tokenAmount: 400 },
      ],
      [{ fromUserAccount: WALLET, toUserAccount: "pool", amount: 1_000_000_000 }],
      null,
    );
    expect(res.event!.tokenAmount).toBeCloseTo(1000, 6);
    expect(res.event!.side).toBe("buy");
  });
});

// ── Part 1: Wallet value reconciliation ─────────────────────────────────────

describe("portfolio reconciliation", () => {
  it("classifies assets and never treats unpriced as zero", () => {
    const p = reconcilePortfolio(2, [
      { mint: "PRICED", amount: 10, priceSol: 0.1, tracedByHistory: true },
      { mint: "PRICED2", amount: 4, priceSol: 0.25, tracedByHistory: false },
      { mint: "UNPRICED", amount: 1000, priceSol: null },
      { mint: "SPAM", amount: 1e9, priceSol: 0.001, spam: true },
      { mint: "UNSUP", amount: 5, priceSol: 0.5, supported: false },
      { mint: "DUST", amount: 0, priceSol: 0.5 },
    ]);

    expect(p.counts).toEqual({
      priced: 2,
      unpriced: 1,
      spam: 1,
      unsupported: 1,
      excluded: 1,
    });
    // Total On-Chain = native 2 + priced (10*0.1) + (4*0.25) = 2 + 1 + 1 = 4.
    expect(p.totalOnChainPortfolioSol).toBeCloseTo(4, 9);
    // Analyzed Trading = only the traced+priced holding = 10*0.1 = 1.
    expect(p.analyzedTradingPortfolioSol).toBeCloseTo(1, 9);
    // Unpriced is tracked, not silently valued at zero.
    const unpriced = p.assets.find((a) => a.mint === "UNPRICED")!;
    expect(unpriced.inclusion).toBe("unpriced");
    expect(unpriced.valueSol).toBeNull();
    expect(unpriced.includedInOnChain).toBe(false);
  });

  it("returns native SOL only when there are no token holdings", () => {
    const p = reconcilePortfolio(3.5, []);
    expect(p.totalOnChainPortfolioSol).toBeCloseTo(3.5, 9);
    expect(p.analyzedTradingPortfolioSol).toBe(0);
  });
});

// ── Part 4: Confidence engine ───────────────────────────────────────────────

describe("confidence gating", () => {
  it("returns Insufficient Data below the sample floor", () => {
    expect(confidenceTier(1, MIN_SAMPLES_FOR_SCORE - 1)).toBe("insufficient");
    expect(confidenceTier(0.9, 0)).toBe("insufficient");
  });

  it("maps confidence to tiers above the floor", () => {
    expect(confidenceTier(0.9, 10)).toBe("high");
    expect(confidenceTier(0.5, 10)).toBe("medium");
    expect(confidenceTier(0.1, 10)).toBe("low");
  });

  it("overall analysis is insufficient below 5 closed trades", () => {
    const c = overallAnalysisConfidence(2, 8);
    expect(c.tier).toBe("insufficient");
    expect(c.hasSufficientData).toBe(false);
  });

  it("computeSignals gates trade-quality signals as insufficient on thin data", () => {
    const events: ParsedSwapEvent[] = [
      { signature: "b", blockTime: 100, tokenMint: "A", side: "buy", tokenAmount: 10, solAmount: 1, dexSource: null },
      { signature: "s", blockTime: 200, tokenMint: "A", side: "sell", tokenAmount: 10, solAmount: 1.5, dexSource: null },
    ];
    const { closed } = matchFifo(events);
    const metrics = computeMetrics(events, closed, [], 30);
    const signals = computeSignals({ events, closed, openPositions: [], metrics, behaviorTags: [] });
    const timing = signals.find((s) => s.key === "timing")!;
    expect(timing.tier).toBe("insufficient");
    expect(timing.sampleSize).toBe(closed.length);
  });

  it("computeSignals produces a reliable tier once enough trades close", () => {
    const events: ParsedSwapEvent[] = [];
    for (let i = 0; i < 12; i++) {
      const t = 1000 + i * 1000;
      events.push({ signature: `b${i}`, blockTime: t, tokenMint: `M${i}`, side: "buy", tokenAmount: 10, solAmount: 1, dexSource: null });
      events.push({ signature: `s${i}`, blockTime: t + 500, tokenMint: `M${i}`, side: "sell", tokenAmount: 10, solAmount: 1.2, dexSource: null });
    }
    const { closed } = matchFifo(events);
    const metrics = computeMetrics(events, closed, [], 60);
    const signals = computeSignals({ events, closed, openPositions: [], metrics, behaviorTags: [] });
    const timing = signals.find((s) => s.key === "timing")!;
    expect(timing.tier).not.toBe("insufficient");
    expect(timing.sampleSize).toBeGreaterThanOrEqual(MIN_SAMPLES_FOR_SCORE);
  });
});

// ── Part 5: Behavior confidence ─────────────────────────────────────────────

describe("behavior confidence", () => {
  it("attaches sample size + evidence count to every insight", () => {
    const events: ParsedSwapEvent[] = [];
    // 6 identical-size buys -> "good_sizing" strength.
    for (let i = 0; i < 6; i++) {
      events.push({ signature: `b${i}`, blockTime: 100 + i, tokenMint: `T${i}`, side: "buy", tokenAmount: 10, solAmount: 1, dexSource: null });
    }
    const { closed } = matchFifo(events);
    const metrics = computeMetrics(events, closed, [], 30);
    const { insights } = analyzeBehavior(events, closed, metrics);
    expect(insights.length).toBeGreaterThan(0);
    for (const i of insights) {
      expect(i.sampleSize).toBeGreaterThan(0);
      expect(i.evidenceCount).toBeGreaterThan(0);
      expect(i.confidence).toBeGreaterThan(0);
    }
  });
});

// ── Part 6: Archetype stability ─────────────────────────────────────────────

describe("archetype hysteresis + contradictions", () => {
  const base = (): DnaVector => ({
    momentum: 0.5,
    patience: 0.5,
    conviction: 0.5,
    risk_tolerance: 0.5,
    diversification: 0.5,
    discipline: 0.5,
    recovery: 0.5,
    rotation: 0.5,
    scalping: 0.5,
    swing: 0.5,
    fomo: 0.5,
  });

  it("flags degen vs disciplined as contradictory", () => {
    expect(areContradictory("degen_gambler", "disciplined_investor")).toBe(true);
    expect(areContradictory("momentum_hunter", "swing_trader")).toBe(false);
  });

  it("keeps the incumbent when a challenger lead is within the margin", () => {
    // momentum_hunter 0.61 (top) vs liquidity_sniper 0.60 (incumbent): a 0.01
    // lead is under the 0.08 margin, so the incumbent must NOT be dethroned.
    const v = { ...base(), momentum: 0.6, scalping: 0.62, discipline: 0.6 };
    const fresh = classifyArchetypes(v, 40);
    expect(fresh.primary.id).toBe("momentum_hunter");

    const sticky = classifyArchetypes(v, 40, "liquidity_sniper");
    expect(sticky.primary.id).toBe("liquidity_sniper");
  });

  it("flips the archetype when a challenger clears the margin", () => {
    // momentum_hunter 0.9 vs liquidity_sniper 0.75: a 0.15 lead exceeds the
    // margin, so the incumbent is legitimately replaced.
    const v = { ...base(), momentum: 0.9, scalping: 0.9, discipline: 0.6 };
    const flipped = classifyArchetypes(v, 40, "liquidity_sniper");
    expect(flipped.primary.id).toBe("momentum_hunter");
  });

  it("is idempotent when the incumbent is already the top archetype", () => {
    const v = { ...base(), momentum: 0.6, scalping: 0.62, discipline: 0.6 };
    const kept = classifyArchetypes(v, 40, "momentum_hunter");
    expect(kept.primary.id).toBe("momentum_hunter");
  });

  it("never emits a contradictory secondary archetype", () => {
    const v = {
      ...base(),
      fomo: 0.8,
      risk_tolerance: 0.8,
      discipline: 0.3,
      momentum: 0.6,
      scalping: 0.5,
    };
    const { primary, secondary } = classifyArchetypes(v, 50);
    if (secondary) {
      expect(areContradictory(primary.id, secondary.id)).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  BREAKEVEN_EPSILON_SOL,
  classifyOutcome,
  classifySwap,
  computeMetrics,
  isStablecoinMint,
  median,
  STABLECOIN_MINTS,
  type ClosedRoundTrip,
  type OpenPosition,
} from "./real-trading-math";
import { buildHoldBuckets } from "./real-trading-performance";

const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN = "MintTokenAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function trip(pnl: number, hold = 3600): ClosedRoundTrip {
  return {
    tokenMint: TOKEN,
    buyTime: 0,
    sellTime: hold,
    holdDurationSec: hold,
    costBasisSol: 1,
    proceedsSol: 1 + pnl,
    realizedPnlSol: pnl,
    roiPercent: pnl * 100,
  };
}

describe("breakeven classification (Part 3D)", () => {
  it("classifies win / loss / breakeven around the epsilon band", () => {
    expect(classifyOutcome(BREAKEVEN_EPSILON_SOL * 2)).toBe("win");
    expect(classifyOutcome(-BREAKEVEN_EPSILON_SOL * 2)).toBe("loss");
    expect(classifyOutcome(0)).toBe("breakeven");
    expect(classifyOutcome(BREAKEVEN_EPSILON_SOL / 2)).toBe("breakeven");
    expect(classifyOutcome(-BREAKEVEN_EPSILON_SOL / 2)).toBe("breakeven");
  });

  it("does not count tiny rounding noise as a loss and excludes breakeven from win rate", () => {
    const closed = [trip(1), trip(-1), trip(BREAKEVEN_EPSILON_SOL / 3)];
    const m = computeMetrics([], closed, [], 30);
    expect(m.breakevenCount).toBe(1);
    // winRate = wins / (wins + losses) = 1 / (1 + 1) = 0.5, breakeven excluded.
    expect(m.winRate).toBeCloseTo(0.5, 6);
    expect(m.lossRate).toBeCloseTo(0.5, 6);
  });
});

describe("true median (Part 3F)", () => {
  it("averages the two middle values for even datasets", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([40, 10, 30, 20])).toBe(25); // unsorted input
  });
  it("returns the middle value for odd datasets", () => {
    expect(median([10, 20, 30])).toBe(20);
  });
  it("returns 0 for an empty dataset", () => {
    expect(median([])).toBe(0);
  });
  it("computeMetrics uses a true median hold for an even count", () => {
    const closed = [trip(1, 60), trip(1, 120), trip(1, 180), trip(1, 240)];
    const m = computeMetrics([], closed, [], 30);
    expect(m.medianHoldDurationSec).toBe(150); // (120 + 180) / 2
  });
});

describe("diversification rescope (Part 3C)", () => {
  const events = [
    { signature: "a", blockTime: 1, tokenMint: "m1", side: "buy" as const, tokenAmount: 1, solAmount: 1, dexSource: null },
    { signature: "b", blockTime: 2, tokenMint: "m2", side: "buy" as const, tokenAmount: 1, solAmount: 1, dexSource: null },
    { signature: "c", blockTime: 3, tokenMint: "m3", side: "buy" as const, tokenAmount: 1, solAmount: 1, dexSource: null },
  ];

  it("historical breadth reflects distinct tokens; current diversification is null with no priced positions", () => {
    const m = computeMetrics(events, [], [], 30);
    expect(m.historicalTradingBreadth).toBe(24); // min(100, 3 * 8)
    expect(m.currentDiversification).toBeNull();
    // Legacy field is now the historical breadth, never a blended value.
    expect(m.diversificationScore).toBe(m.historicalTradingBreadth);
  });

  it("current diversification is derived only from verified current holdings", () => {
    const positions: OpenPosition[] = [
      pos("m1", 6),
      pos("m2", 4),
    ];
    const m = computeMetrics(events, [], positions, 30);
    // Two positions 60/40 -> HHI 0.52 -> currentDiversification = round((1-0.52)*100).
    expect(m.currentDiversification).not.toBeNull();
    expect(m.currentDiversification!).toBeGreaterThan(0);
    expect(m.currentDiversification!).toBeLessThan(100);
  });

  it("a single current position reads as fully concentrated (0)", () => {
    const m = computeMetrics(events, [], [pos("m1", 10)], 30);
    expect(m.currentDiversification).toBe(0);
  });
});

function pos(mint: string, valueSol: number): OpenPosition {
  return {
    tokenMint: mint,
    symbol: null,
    name: null,
    logo: null,
    tokenAmount: 1,
    costBasisSol: valueSol,
    avgEntryPriceSol: valueSol,
    firstAcquiredAt: 0,
    currentPriceSol: valueSol,
    currentValueSol: valueSol,
    unrealizedPnlSol: 0,
    marketCapUsd: null,
  };
}

describe("stablecoin quote handling (Part 3A)", () => {
  it("recognizes trusted stablecoin mints", () => {
    expect(isStablecoinMint(USDC)).toBe(true);
    expect(STABLECOIN_MINTS.has(USDC)).toBe(true);
    expect(isStablecoinMint(TOKEN)).toBe(false);
  });

  it("does not treat a SOL<->USDC swap as a speculative position", () => {
    const res = classifySwap(
      WALLET,
      "sig",
      1000,
      [{ mint: USDC, toUserAccount: WALLET, tokenAmount: 100 }],
      [{ fromUserAccount: WALLET, amount: 1_000_000_000 }],
      "raydium",
    );
    expect(res.event).toBeNull();
    expect(res.skipReason).toBe("stablecoin_quote");
  });

  it("still parses a genuine token buy settled in SOL", () => {
    const res = classifySwap(
      WALLET,
      "sig2",
      1000,
      [{ mint: TOKEN, toUserAccount: WALLET, tokenAmount: 500 }],
      [{ fromUserAccount: WALLET, amount: 1_000_000_000 }],
      "raydium",
    );
    expect(res.event).not.toBeNull();
    expect(res.event!.tokenMint).toBe(TOKEN);
    expect(res.event!.side).toBe("buy");
  });

  it("picks the real token, not the stablecoin, in a TOKEN/USDC settled-in-SOL route", () => {
    const res = classifySwap(
      WALLET,
      "sig3",
      1000,
      [
        { mint: TOKEN, toUserAccount: WALLET, tokenAmount: 500 },
        { mint: USDC, fromUserAccount: WALLET, tokenAmount: 50 },
      ],
      [{ fromUserAccount: WALLET, amount: 1_000_000_000 }],
      "jupiter",
    );
    expect(res.event).not.toBeNull();
    expect(res.event!.tokenMint).toBe(TOKEN);
  });
});

describe("hold-time bucket boundaries (Part 3E)", () => {
  it("assigns boundary values to exactly one (upper) bucket", () => {
    const closed = [
      trip(1, 600), // exactly 10m -> "10-60m"
      trip(1, 3600), // exactly 60m -> "1-6h"
      trip(1, 6 * 3600), // exactly 6h -> "6-24h"
      trip(1, 86400), // exactly 24h -> "1-7d"
      trip(1, 7 * 86400), // exactly 7d -> ">7d"
      trip(1, 599), // just under 10m -> "<10m"
    ];
    const buckets = buildHoldBuckets(closed);
    const by = Object.fromEntries(buckets.map((b) => [b.label, b.count]));
    expect(by["<10m"]).toBe(1);
    expect(by["10–60m"]).toBe(1);
    expect(by["1–6h"]).toBe(1);
    expect(by["6–24h"]).toBe(1);
    expect(by["1–7d"]).toBe(1);
    expect(by[">7d"]).toBe(1);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(closed.length); // every trip counted exactly once
  });
});

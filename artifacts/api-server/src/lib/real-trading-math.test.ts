import { describe, expect, it } from "vitest";
import {
  aggregateLotsByMint,
  computeMetrics,
  matchFifo,
  parseSwapDeltas,
  reconcileHoldings,
  type MintHolding,
  type ParsedSwapEvent,
  type TradeLot,
} from "./real-trading-math";
import { computeSignals, SIGNAL_KEYS } from "./real-trading-signals";
import {
  classifyArchetypes,
  evolveVector,
  observeDnaVector,
  EVOLUTION_THRESHOLD,
  type DnaVector,
} from "./real-trading-dna";

const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

describe("parseSwapDeltas", () => {
  it("detects a buy when wallet receives tokens and sends SOL", () => {
    const ev = parseSwapDeltas(
      WALLET,
      "sig1",
      1000,
      [
        {
          mint: "TokenMint11111111111111111111111111111111",
          fromUserAccount: "pool",
          toUserAccount: WALLET,
          tokenAmount: 1000,
        },
      ],
      [
        {
          fromUserAccount: WALLET,
          toUserAccount: "pool",
          amount: 500_000_000,
        },
      ],
      "JUPITER",
    );
    expect(ev).not.toBeNull();
    expect(ev!.side).toBe("buy");
    expect(ev!.tokenAmount).toBe(1000);
    expect(ev!.solAmount).toBeCloseTo(0.5, 6);
  });

  it("detects a sell when wallet sends tokens and receives SOL", () => {
    const ev = parseSwapDeltas(
      WALLET,
      "sig2",
      2000,
      [
        {
          mint: "TokenMint11111111111111111111111111111111",
          fromUserAccount: WALLET,
          toUserAccount: "pool",
          tokenAmount: 500,
        },
      ],
      [
        {
          fromUserAccount: "pool",
          toUserAccount: WALLET,
          amount: 750_000_000,
        },
      ],
      "PUMP_FUN",
    );
    expect(ev).not.toBeNull();
    expect(ev!.side).toBe("sell");
    expect(ev!.solAmount).toBeCloseTo(0.75, 6);
  });

  it("returns null when no meaningful token delta", () => {
    const ev = parseSwapDeltas(WALLET, "sig3", 3000, [], [], null);
    expect(ev).toBeNull();
  });
});

describe("matchFifo", () => {
  it("computes realized PnL on a simple buy-then-sell round trip", () => {
    const events: ParsedSwapEvent[] = [
      {
        signature: "b1",
        blockTime: 100,
        tokenMint: "MINT",
        side: "buy",
        tokenAmount: 100,
        solAmount: 1,
        dexSource: "JUPITER",
      },
      {
        signature: "s1",
        blockTime: 200,
        tokenMint: "MINT",
        side: "sell",
        tokenAmount: 100,
        solAmount: 1.5,
        dexSource: "JUPITER",
      },
    ];
    const { closed, openLots } = matchFifo(events);
    expect(closed.length).toBe(1);
    expect(closed[0]!.realizedPnlSol).toBeCloseTo(0.5, 6);
    expect(closed[0]!.holdDurationSec).toBe(100);
    expect(openLots.length).toBe(0);
  });

  it("leaves open lots when only partially sold", () => {
    const events: ParsedSwapEvent[] = [
      {
        signature: "b1",
        blockTime: 100,
        tokenMint: "MINT",
        side: "buy",
        tokenAmount: 100,
        solAmount: 1,
        dexSource: null,
      },
      {
        signature: "s1",
        blockTime: 200,
        tokenMint: "MINT",
        side: "sell",
        tokenAmount: 40,
        solAmount: 0.5,
        dexSource: null,
      },
    ];
    const { closed, openLots } = matchFifo(events);
    expect(closed.length).toBe(1);
    expect(openLots.length).toBe(1);
    expect(openLots[0]!.tokenAmount).toBeCloseTo(60, 6);
  });
});

describe("aggregateLotsByMint", () => {
  it("merges lots of the same mint, keeping earliest acquisition", () => {
    const lots: TradeLot[] = [
      { tokenMint: "A", tokenAmount: 10, costBasisSol: 1, acquiredAt: 200 },
      { tokenMint: "A", tokenAmount: 5, costBasisSol: 0.5, acquiredAt: 100 },
      { tokenMint: "B", tokenAmount: 3, costBasisSol: 0.3, acquiredAt: 300 },
    ];
    const holdings = aggregateLotsByMint(lots);
    expect(holdings).toHaveLength(2);
    const a = holdings.find((h) => h.tokenMint === "A")!;
    expect(a.tokenAmount).toBeCloseTo(15);
    expect(a.costBasisSol).toBeCloseTo(1.5);
    expect(a.firstAcquiredAt).toBe(100);
  });
});

describe("reconcileHoldings", () => {
  const fifo: MintHolding[] = [
    { tokenMint: "HELD", tokenAmount: 100, costBasisSol: 2, firstAcquiredAt: 100 },
    { tokenMint: "GONE", tokenAmount: 50, costBasisSol: 1, firstAcquiredAt: 100 },
    { tokenMint: "PARTIAL", tokenAmount: 40, costBasisSol: 4, firstAcquiredAt: 100 },
  ];

  it("caps holdings at live balances and drops ghost positions", () => {
    const balances = new Map<string, number>([
      ["HELD", 100],
      // GONE: absent - transferred out or sold via a non-swap route.
      ["PARTIAL", 10], // wallet only holds a quarter of what FIFO thinks
    ]);
    const { holdings, verified, droppedMints } = reconcileHoldings(
      fifo,
      balances,
    );
    expect(verified).toBe(true);
    expect(droppedMints).toBe(1);
    expect(holdings.map((h) => h.tokenMint).sort()).toEqual([
      "HELD",
      "PARTIAL",
    ]);
    const partial = holdings.find((h) => h.tokenMint === "PARTIAL")!;
    expect(partial.tokenAmount).toBeCloseTo(10);
    // Cost basis scales with the fraction actually still held.
    expect(partial.costBasisSol).toBeCloseTo(1);
  });

  it("never inflates a holding above what FIFO traced", () => {
    // Wallet holds MORE than trade history explains (e.g. airdrop/transfer
    // in) - we only claim what we can trace to actual buys.
    const balances = new Map<string, number>([["HELD", 10_000]]);
    const { holdings } = reconcileHoldings(
      [{ tokenMint: "HELD", tokenAmount: 100, costBasisSol: 2, firstAcquiredAt: 1 }],
      balances,
    );
    expect(holdings[0]!.tokenAmount).toBeCloseTo(100);
  });

  it("returns NO current positions when balances are unavailable (never ghosts)", () => {
    const { holdings, verified, droppedMints, diagnostics } = reconcileHoldings(
      fifo,
      null,
    );
    expect(verified).toBe(false);
    expect(droppedMints).toBe(0);
    // Unverified must never present trade-history holdings as current positions.
    expect(holdings).toHaveLength(0);
    // Every mint is still reported in diagnostics, flagged unverified.
    expect(diagnostics).toHaveLength(3);
    for (const d of diagnostics) {
      expect(d.liveQuantity).toBeNull();
      expect(d.reconciledQuantity).toBe(0);
      expect(d.includedInOpenPositions).toBe(false);
    }
  });
});

describe("computeMetrics", () => {
  it("calculates win rate from closed round trips", () => {
    const events: ParsedSwapEvent[] = [
      { signature: "b1", blockTime: 100, tokenMint: "A", side: "buy", tokenAmount: 10, solAmount: 1, dexSource: null },
      { signature: "s1", blockTime: 200, tokenMint: "A", side: "sell", tokenAmount: 10, solAmount: 1.5, dexSource: null },
      { signature: "b2", blockTime: 300, tokenMint: "B", side: "buy", tokenAmount: 10, solAmount: 1, dexSource: null },
      { signature: "s2", blockTime: 400, tokenMint: "B", side: "sell", tokenAmount: 10, solAmount: 0.5, dexSource: null },
    ];
    const { closed } = matchFifo(events);
    const metrics = computeMetrics(events, closed, [], 30);
    expect(metrics.closedRoundTrips).toBe(2);
    expect(metrics.winRate).toBe(0.5);
    expect(metrics.realizedPnlSol).toBeCloseTo(0, 6);
  });
});

describe("computeSignals", () => {
  function makeContext(overrides?: { behaviorTags?: string[] }) {
    const events: ParsedSwapEvent[] = [
      { signature: "b1", blockTime: 100, tokenMint: "A", side: "buy", tokenAmount: 10, solAmount: 1, dexSource: null },
      { signature: "s1", blockTime: 90100, tokenMint: "A", side: "sell", tokenAmount: 10, solAmount: 1.5, dexSource: null },
      { signature: "b2", blockTime: 200000, tokenMint: "B", side: "buy", tokenAmount: 10, solAmount: 1, dexSource: null },
      { signature: "s2", blockTime: 290000, tokenMint: "B", side: "sell", tokenAmount: 10, solAmount: 0.8, dexSource: null },
    ];
    const { closed } = matchFifo(events);
    const metrics = computeMetrics(events, closed, [], 30);
    return {
      events,
      closed,
      openPositions: [],
      metrics,
      behaviorTags: overrides?.behaviorTags ?? [],
    };
  }

  it("computes every registered signal, bounded 0-100 with 0-1 confidence", () => {
    const signals = computeSignals(makeContext());
    expect(signals.map((s) => s.key).sort()).toEqual([...SIGNAL_KEYS].sort());
    for (const s of signals) {
      expect(s.value).toBeGreaterThanOrEqual(0);
      expect(s.value).toBeLessThanOrEqual(100);
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("penalizes discipline for panic sellers and rewards good sizing", () => {
    const clean = computeSignals(makeContext({ behaviorTags: ["good_sizing"] }));
    const panicky = computeSignals(makeContext({ behaviorTags: ["panic_seller", "fomo_entries"] }));
    const disciplineOf = (arr: typeof clean) =>
      arr.find((s) => s.key === "discipline")!.value;
    expect(disciplineOf(clean)).toBeGreaterThan(disciplineOf(panicky));
  });

  it("profitability sits above 50 when net positive", () => {
    const signals = computeSignals(makeContext());
    const prof = signals.find((s) => s.key === "profitability")!;
    // +0.5 SOL win, −0.2 SOL loss → net positive.
    expect(prof.value).toBeGreaterThan(50);
  });
});

describe("trader DNA", () => {
  const baseVector = (): DnaVector => ({
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

  it("observeDnaVector produces values in [0,1]", () => {
    const events: ParsedSwapEvent[] = [
      { signature: "b1", blockTime: 100, tokenMint: "A", side: "buy", tokenAmount: 10, solAmount: 1, dexSource: null },
    ];
    const metrics = computeMetrics(events, [], [], 30);
    const signals = computeSignals({
      events,
      closed: [],
      openPositions: [],
      metrics,
      behaviorTags: [],
    });
    const vector = observeDnaVector(metrics, signals, []);
    for (const v of Object.values(vector)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("evolveVector blends smoothly (EMA) instead of replacing", () => {
    const prev = baseVector();
    const observed = { ...baseVector(), momentum: 1 };
    const { vector } = evolveVector(prev, observed);
    // 0.5 * 0.7 + 1 * 0.3 = 0.65
    expect(vector.momentum).toBeCloseTo(0.65, 2);
    expect(vector.patience).toBeCloseTo(0.5, 2);
  });

  it("reports evolved traits only beyond the threshold", () => {
    const prev = baseVector();
    const observed = { ...baseVector(), momentum: 1, patience: 0.52 };
    const { evolvedTraits } = evolveVector(prev, observed);
    expect(evolvedTraits).toContain("momentum");
    expect(evolvedTraits).not.toContain("patience");
    // Sanity: momentum moved by 0.15 > threshold.
    expect(0.15).toBeGreaterThan(EVOLUTION_THRESHOLD);
  });

  it("classifies Emerging Trader below 5 trades regardless of vector", () => {
    const { primary } = classifyArchetypes(
      { ...baseVector(), momentum: 1, scalping: 1 },
      3,
    );
    expect(primary.id).toBe("emerging_trader");
  });

  it("classifies a momentum scalper as Momentum Hunter", () => {
    const { primary } = classifyArchetypes(
      { ...baseVector(), momentum: 0.9, scalping: 0.8, discipline: 0.3 },
      50,
    );
    expect(primary.id).toBe("momentum_hunter");
  });

  it("classifies patient conviction holders as Diamond Hands", () => {
    const { primary } = classifyArchetypes(
      {
        ...baseVector(),
        patience: 0.9,
        conviction: 0.5,
        momentum: 0.2,
        scalping: 0.1,
        swing: 0.3,
        risk_tolerance: 0.4,
        discipline: 0.55,
      },
      40,
    );
    expect(primary.id).toBe("diamond_hands");
  });
});

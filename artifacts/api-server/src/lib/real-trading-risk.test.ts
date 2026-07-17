import { describe, it, expect } from "vitest";
import {
  computeHistoricalRisk,
  computeDrawdownEpisodes,
  computeStreaks,
  classifyRiskProfile,
} from "./real-trading-risk.js";
import type { ClosedRoundTrip, ParsedSwapEvent } from "./real-trading-math.js";

let t = 1_700_000_000;
function rt(pnl: number, opts?: Partial<ClosedRoundTrip>): ClosedRoundTrip {
  t += 3600;
  const cost = opts?.costBasisSol ?? 1;
  return {
    tokenMint: opts?.tokenMint ?? "MINT",
    buyTime: opts?.buyTime ?? t - 1800,
    sellTime: opts?.sellTime ?? t,
    holdDurationSec: opts?.holdDurationSec ?? 1800,
    costBasisSol: cost,
    proceedsSol: cost + pnl,
    realizedPnlSol: pnl,
    roiPercent: cost > 0 ? (pnl / cost) * 100 : 0,
  };
}

function buy(sol: number): ParsedSwapEvent {
  return {
    signature: `sig${Math.random()}`,
    blockTime: t,
    tokenMint: "MINT",
    side: "buy",
    tokenAmount: 1000,
    solAmount: sol,
    dexSource: null,
  };
}

describe("computeDrawdownEpisodes", () => {
  it("detects a single recovered drawdown with correct depth", () => {
    // equity: +5, +3(dd2), +1(dd4), +6(recover)
    const closed = [rt(5), rt(-2), rt(-2), rt(5)];
    const { episodes, maxDrawdownSol, currentDrawdownSol } =
      computeDrawdownEpisodes(closed);
    expect(episodes.length).toBe(1);
    expect(episodes[0]!.recovered).toBe(true);
    expect(maxDrawdownSol).toBeCloseTo(4, 5);
    expect(currentDrawdownSol).toBeCloseTo(0, 5);
  });

  it("reports an unrecovered current drawdown", () => {
    const closed = [rt(10), rt(-3), rt(-2)];
    const { episodes, currentDrawdownSol } = computeDrawdownEpisodes(closed);
    expect(episodes.length).toBe(1);
    expect(episodes[0]!.recovered).toBe(false);
    expect(currentDrawdownSol).toBeCloseTo(5, 5);
  });

  it("has no drawdown for a monotonic winning curve", () => {
    const { episodes, maxDrawdownSol } = computeDrawdownEpisodes([
      rt(1),
      rt(2),
      rt(3),
    ]);
    expect(episodes.length).toBe(0);
    expect(maxDrawdownSol).toBe(0);
  });

  it("leaves percentage drawdown null when equity never turns positive", () => {
    const { maxDrawdownPercent } = computeDrawdownEpisodes([rt(-1), rt(-2)]);
    expect(maxDrawdownPercent).toBeNull();
  });
});

describe("computeStreaks", () => {
  it("finds max consecutive wins and losses", () => {
    const s = computeStreaks([rt(1), rt(1), rt(-1), rt(-1), rt(-1), rt(1)]);
    expect(s.maxConsecutiveWins).toBe(2);
    expect(s.maxConsecutiveLosses).toBe(3);
    expect(s.currentStreak).toBe(1);
  });

  it("resets streaks on breakeven", () => {
    const s = computeStreaks([rt(1), rt(0), rt(1)]);
    expect(s.maxConsecutiveWins).toBe(1);
    expect(s.currentStreak).toBe(1);
  });
});

describe("computeHistoricalRisk", () => {
  it("gates as insufficient below the sample floor", () => {
    const r = computeHistoricalRisk([rt(1), rt(-1)], []);
    expect(r.confidenceTier).toBe("insufficient");
    expect(r.profileTier).toBe("insufficient");
  });

  it("computes profit factor, expectancy and payoff ratio", () => {
    const closed = [rt(2), rt(2), rt(-1), rt(-1), rt(2), rt(-1)];
    const r = computeHistoricalRisk(closed, []);
    // gains sum = 6, losses sum = 3 -> PF 2
    expect(r.profitFactor).toBeCloseTo(2, 5);
    // expectancy = (6-3)/6 = 0.5
    expect(r.expectancySol).toBeCloseTo(0.5, 5);
    // payoff = avgWin(2) / avgLoss(1) = 2
    expect(r.payoffRatio).toBeCloseTo(2, 5);
  });

  it("returns null profit factor when there are no losses", () => {
    const r = computeHistoricalRisk([rt(1), rt(2), rt(3), rt(4), rt(5)], []);
    expect(r.profitFactor).toBeNull();
    expect(r.payoffRatio).toBeNull();
  });

  it("computes position-size volatility from buy sizes", () => {
    const closed = [rt(1), rt(1), rt(1), rt(1), rt(1)];
    const steady = computeHistoricalRisk(closed, [buy(1), buy(1), buy(1)]);
    expect(steady.positionSizeVolatility).toBeCloseTo(0, 5);
    const wild = computeHistoricalRisk(closed, [buy(1), buy(10), buy(1)]);
    expect(wild.positionSizeVolatility).toBeGreaterThan(0.5);
  });

  it("concentrates tail losses in the worst trades", () => {
    const closed = [rt(1), rt(1), rt(1), rt(1), rt(-10), rt(-0.1)];
    const r = computeHistoricalRisk(closed, []);
    expect(r.tailLossConcentration).toBeGreaterThan(0.9);
  });
});

describe("classifyRiskProfile", () => {
  it("labels calm results as controlled", () => {
    expect(
      classifyRiskProfile(10, {
        resultDispersion: 0.5,
        drawdownSeverity: 1,
        tailLossConcentration: 0.3,
      }),
    ).toBe("controlled");
  });

  it("labels extreme swings as highly volatile", () => {
    expect(
      classifyRiskProfile(10, {
        resultDispersion: 2,
        drawdownSeverity: 6,
        tailLossConcentration: 0.8,
      }),
    ).toBe("highly_volatile");
  });

  it("is insufficient below the floor regardless of inputs", () => {
    expect(
      classifyRiskProfile(2, {
        resultDispersion: 2,
        drawdownSeverity: 6,
        tailLossConcentration: 0.8,
      }),
    ).toBe("insufficient");
  });
});

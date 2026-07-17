import { describe, expect, it } from "vitest";
import {
  analyzeBehavior,
  MIN_MEANINGFUL_BUY_SOL,
} from "./real-trading-behavior";
import { computeMetrics } from "./real-trading-math";
import type { ClosedRoundTrip, ParsedSwapEvent } from "./real-trading-math";

const MINT = "MintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function buy(
  sig: string,
  t: number,
  sol: number,
  tokens: number,
  mint = MINT,
): ParsedSwapEvent {
  return {
    signature: sig,
    blockTime: t,
    tokenMint: mint,
    side: "buy",
    tokenAmount: tokens,
    solAmount: sol,
    dexSource: null,
  };
}

function sell(
  sig: string,
  t: number,
  sol: number,
  tokens: number,
  mint = MINT,
): ParsedSwapEvent {
  return {
    signature: sig,
    blockTime: t,
    tokenMint: mint,
    side: "sell",
    tokenAmount: tokens,
    solAmount: sol,
    dexSource: null,
  };
}

let rtSeq = 0;
function rt(
  pnl: number,
  opts?: Partial<ClosedRoundTrip>,
): ClosedRoundTrip {
  rtSeq += 1;
  const cost = opts?.costBasisSol ?? 1;
  const sellTime = opts?.sellTime ?? 1_700_000_000 + rtSeq * 3600;
  return {
    tokenMint: opts?.tokenMint ?? MINT,
    buyTime: opts?.buyTime ?? sellTime - 1800,
    sellTime,
    holdDurationSec: opts?.holdDurationSec ?? 1800,
    costBasisSol: cost,
    proceedsSol: cost + pnl,
    realizedPnlSol: pnl,
    roiPercent: cost > 0 ? (pnl / cost) * 100 : 0,
  };
}

function noMetrics() {
  return computeMetrics([], [], [], 30);
}

describe("behavior dust exclusion (Part 5.3)", () => {
  it("does not flag averaging down from dust-sized buys", () => {
    const dust = MIN_MEANINGFUL_BUY_SOL / 10;
    const events = [
      buy("s1", 1, dust, 1000),
      buy("s2", 2, dust, 2000), // implied price falling, but dust
      buy("s3", 3, dust, 4000),
    ];
    const res = analyzeBehavior(events, [], noMetrics());
    expect(res.tags).not.toContain("averages_down");
  });

  it("still flags averaging down for meaningful buys with a material decline", () => {
    const events = [
      buy("s1", 1, 1.0, 1000), // price 0.001
      buy("s2", 2, 1.0, 1200), // ~0.00083 (-17%)
      buy("s3", 3, 1.0, 1500), // ~0.00067 (-20%)
    ];
    const res = analyzeBehavior(events, [], noMetrics());
    expect(res.tags).toContain("averages_down");
  });

  it("does not flag averaging down for sub-percent slippage noise", () => {
    const events = [
      buy("s1", 1, 1.0, 1000),
      buy("s2", 2, 1.0, 1002), // -0.2% (noise)
      buy("s3", 3, 1.0, 1004),
    ];
    const res = analyzeBehavior(events, [], noMetrics());
    expect(res.tags).not.toContain("averages_down");
  });
});

describe("behavior duplicate-transaction handling (Part 5.2)", () => {
  it("de-duplicates identical signatures so a dup cannot create a false pattern", () => {
    // Same signature repeated - should collapse to one buy, so <3 distinct buys.
    const events = [
      buy("dup", 1, 1.0, 1000),
      buy("dup", 1, 1.0, 1000),
      buy("dup", 1, 1.0, 1000),
    ];
    const res = analyzeBehavior(events, [], noMetrics());
    expect(res.tags).not.toContain("averages_down");
    expect(res.tags).not.toContain("fomo_entries");
  });
});

describe("behavior FOMO noise tolerance (Part 5.2)", () => {
  it("requires a material rise within a short window", () => {
    const events = [
      buy("s1", 1, 1.0, 1000), // 0.001
      buy("s2", 1 + 600, 1.0, 830), // +20% within 10m
      buy("s3", 1 + 1200, 1.0, 690), // +20% again
    ];
    const res = analyzeBehavior(events, [], noMetrics());
    expect(res.tags).toContain("fomo_entries");
  });
});

describe("Phase 2B sequence behaviors", () => {
  it("detects position-size escalation across the trade history", () => {
    const events: ParsedSwapEvent[] = [];
    for (let i = 0; i < 4; i++) events.push(buy(`e${i}`, i + 1, 1, 1000, `M${i}`));
    for (let i = 0; i < 4; i++) events.push(buy(`l${i}`, 100 + i, 5, 1000, `L${i}`));
    const res = analyzeBehavior(events, [], noMetrics());
    expect(res.tags).toContain("size_escalation");
  });

  it("does not flag escalation when sizing stays steady", () => {
    const events: ParsedSwapEvent[] = [];
    for (let i = 0; i < 8; i++) events.push(buy(`s${i}`, i + 1, 1, 1000, `M${i}`));
    const res = analyzeBehavior(events, [], noMetrics());
    expect(res.tags).not.toContain("size_escalation");
  });

  it("detects overtrading bursts", () => {
    const events: ParsedSwapEvent[] = [];
    // 4 quiet days with 1 trade each.
    for (let d = 0; d < 4; d++) events.push(buy(`q${d}`, d * 86400 + 10, 1, 1000, `Q${d}`));
    // 2 burst days with 8 trades each.
    for (let d = 10; d < 12; d++)
      for (let k = 0; k < 8; k++)
        events.push(buy(`b${d}_${k}`, d * 86400 + k * 60, 1, 1000, `B${d}${k}`));
    const res = analyzeBehavior(events, [], noMetrics());
    expect(res.tags).toContain("overtrading_bursts");
  });

  it("detects re-entry persistence on the same token", () => {
    const closed = [
      rt(1, { tokenMint: "REENTRY" }),
      rt(-1, { tokenMint: "REENTRY" }),
      rt(2, { tokenMint: "REENTRY" }),
    ];
    const res = analyzeBehavior([], closed, noMetrics());
    expect(res.tags).toContain("reentry_persistence");
  });

  it("detects revenge trading: outsized buys right after losses", () => {
    const base = 1_700_000_000;
    // Median buy ~1 SOL from many normal buys.
    const events: ParsedSwapEvent[] = [];
    for (let i = 0; i < 6; i++) events.push(buy(`n${i}`, base - 10000 + i, 1, 1000, `N${i}`));
    const closed: ClosedRoundTrip[] = [];
    for (let i = 0; i < 3; i++) {
      const sellTime = base + i * 100000;
      closed.push(rt(-1, { sellTime, tokenMint: `X${i}` }));
      // Outsized buy 30 min after each loss.
      events.push(buy(`rev${i}`, sellTime + 1800, 3, 1000, `R${i}`));
    }
    const res = analyzeBehavior(events, closed, noMetrics());
    expect(res.tags).toContain("revenge_trading");
  });

  it("does not flag revenge trading when post-loss buys are normal sized", () => {
    const base = 1_700_000_000;
    const events: ParsedSwapEvent[] = [];
    for (let i = 0; i < 6; i++) events.push(buy(`n${i}`, base - 10000 + i, 1, 1000, `N${i}`));
    const closed: ClosedRoundTrip[] = [];
    for (let i = 0; i < 3; i++) {
      const sellTime = base + i * 100000;
      closed.push(rt(-1, { sellTime, tokenMint: `X${i}` }));
      events.push(buy(`ok${i}`, sellTime + 1800, 1, 1000, `R${i}`));
    }
    const res = analyzeBehavior(events, closed, noMetrics());
    expect(res.tags).not.toContain("revenge_trading");
  });

  it("detects strong recovery from repeated drawdowns", () => {
    // Three recovered drawdown episodes.
    const closed = [
      rt(5),
      rt(-2),
      rt(3), // recover
      rt(-2),
      rt(4), // recover
      rt(-2),
      rt(3), // recover
    ];
    const res = analyzeBehavior([], closed, noMetrics());
    expect(res.tags).toContain("strong_recovery");
  });
});

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

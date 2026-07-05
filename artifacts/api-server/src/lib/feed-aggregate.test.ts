import { describe, expect, it } from "vitest";
import {
  AGG_GAP_SECONDS,
  aggregateSpotTrades,
  windowLabel,
  type RawSpotTrade,
} from "./feed-aggregate.js";

function trade(over: Partial<RawSpotTrade>): RawSpotTrade {
  return {
    id: "1",
    userId: 1,
    mint: "BONK",
    side: "buy",
    ts: 1_000_000,
    solAmount: 1,
    pnlSol: null,
    marketCapUsd: null,
    ...over,
  };
}

describe("aggregateSpotTrades", () => {
  it("a lone trade stays a single card", () => {
    const items = aggregateSpotTrades([trade({ id: "a" })]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("single");
  });

  it("buys within the gap window collapse into one group", () => {
    const t0 = 1_000_000;
    const items = aggregateSpotTrades([
      trade({ id: "a", ts: t0 }),
      trade({ id: "b", ts: t0 + 300 }),
      trade({ id: "c", ts: t0 + 900 }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("group");
    if (items[0].type === "group") {
      expect(items[0].group.tradeCount).toBe(3);
      expect(items[0].group.id).toBe("agg-buy-a");
      expect(items[0].group.totalSol).toBe(3);
      expect(items[0].group.breakdown).toHaveLength(3);
    }
  });

  it("a gap larger than the window splits groups", () => {
    const t0 = 1_000_000;
    const items = aggregateSpotTrades([
      trade({ id: "a", ts: t0 }),
      trade({ id: "b", ts: t0 + 60 }),
      trade({ id: "c", ts: t0 + 60 + AGG_GAP_SECONDS + 1 }),
    ]);
    expect(items).toHaveLength(2);
    // Newest-first ordering: the lone later trade comes first.
    expect(items[0].type).toBe("single");
    expect(items[1].type).toBe("group");
  });

  it("the chain extends as long as consecutive gaps stay inside the window", () => {
    const t0 = 1_000_000;
    const step = AGG_GAP_SECONDS - 10;
    const items = aggregateSpotTrades([
      trade({ id: "a", ts: t0 }),
      trade({ id: "b", ts: t0 + step }),
      trade({ id: "c", ts: t0 + step * 2 }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("group");
  });

  it("buys and sells never mix into one group", () => {
    const t0 = 1_000_000;
    const items = aggregateSpotTrades([
      trade({ id: "a", ts: t0, side: "buy" }),
      trade({ id: "b", ts: t0 + 10, side: "sell", pnlSol: 0.5 }),
      trade({ id: "c", ts: t0 + 20, side: "buy" }),
      trade({ id: "d", ts: t0 + 30, side: "sell", pnlSol: 0.2 }),
    ]);
    const groups = items.filter((i) => i.type === "group");
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      if (g.type === "group") expect(g.group.tradeCount).toBe(2);
    }
  });

  it("different tokens and users never mix", () => {
    const t0 = 1_000_000;
    const items = aggregateSpotTrades([
      trade({ id: "a", ts: t0, mint: "BONK" }),
      trade({ id: "b", ts: t0 + 10, mint: "WIF" }),
      trade({ id: "c", ts: t0 + 20, userId: 2 }),
    ]);
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.type === "single")).toBe(true);
  });

  it("weights average market cap by SOL size and skips missing MCs", () => {
    const t0 = 1_000_000;
    const items = aggregateSpotTrades([
      trade({ id: "a", ts: t0, solAmount: 1, marketCapUsd: 1_000_000 }),
      trade({ id: "b", ts: t0 + 10, solAmount: 3, marketCapUsd: 2_000_000 }),
      trade({ id: "c", ts: t0 + 20, solAmount: 5, marketCapUsd: null }),
    ]);
    expect(items[0].type).toBe("group");
    if (items[0].type === "group") {
      // (1M*1 + 2M*3) / 4 = 1.75M
      expect(items[0].group.avgMarketCapUsd).toBeCloseTo(1_750_000);
      expect(items[0].group.totalSol).toBe(9);
    }
  });

  it("sums realized PnL across an exit group", () => {
    const t0 = 1_000_000;
    const items = aggregateSpotTrades([
      trade({ id: "a", ts: t0, side: "sell", pnlSol: 0.4 }),
      trade({ id: "b", ts: t0 + 10, side: "sell", pnlSol: -0.1 }),
    ]);
    if (items[0].type === "group") {
      expect(items[0].group.totalPnlSol).toBeCloseTo(0.3);
    } else {
      throw new Error("expected group");
    }
  });

  it("group with no PnL data reports null, not zero", () => {
    const t0 = 1_000_000;
    const items = aggregateSpotTrades([
      trade({ id: "a", ts: t0 }),
      trade({ id: "b", ts: t0 + 10 }),
    ]);
    if (items[0].type === "group") {
      expect(items[0].group.totalPnlSol).toBeNull();
    } else {
      throw new Error("expected group");
    }
  });

  it("orders output newest-first by latest trade in each item", () => {
    const t0 = 1_000_000;
    const items = aggregateSpotTrades([
      trade({ id: "old", ts: t0, mint: "AAA" }),
      trade({ id: "g1", ts: t0 + 100, mint: "BBB" }),
      trade({ id: "g2", ts: t0 + 1_000, mint: "BBB" }),
      trade({ id: "new", ts: t0 + 10_000, mint: "CCC" }),
    ]);
    expect(items[0].type).toBe("single"); // CCC newest
    expect(items[1].type).toBe("group"); // BBB group ends at t0+1000
    expect(items[2].type).toBe("single"); // AAA oldest
  });
});

describe("windowLabel", () => {
  it("formats minutes and hours", () => {
    expect(windowLabel(0, 30)).toBe("under a minute");
    expect(windowLabel(0, 18 * 60)).toBe("18 minutes");
    expect(windowLabel(0, 60)).toBe("1 minute");
    expect(windowLabel(0, 2 * 3600)).toBe("2 hours");
  });
});

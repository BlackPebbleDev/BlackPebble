import { describe, it, expect } from "vitest";
import {
  searchLessons,
  classifyIntent,
  expandQuery,
  lessonDocCount,
  editDistance,
  suggestQuery,
  popularLessonSlugs,
} from "./search";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const EVM_ADDR = "0x1234567890abcdef1234567890abcdef12345678";

function slugs(query: string): string[] {
  return searchLessons(query, 20).map((r) => r.slug);
}

describe("academy search", () => {
  it("indexes published lessons", () => {
    expect(lessonDocCount()).toBeGreaterThan(100);
  });

  it("finds the PnL lesson by exact term and alias variants", () => {
    expect(slugs("PnL")).toContain("profit-and-loss");
    expect(slugs("P&L")).toContain("profit-and-loss");
    expect(slugs("profit and loss")).toContain("profit-and-loss");
  });

  it("expands common shorthand equivalences", () => {
    expect(expandQuery("p&l")).toContain("pnl");
    expect(expandQuery("stop loss")).toContain("sl");
    expect(expandQuery("market cap")).toContain("mc");
  });

  it("matches stop-loss content via SL alias", () => {
    expect(slugs("stop loss")).toContain("automated-exits");
  });

  it("returns nothing for a blank query", () => {
    expect(searchLessons("")).toEqual([]);
    expect(searchLessons("   ")).toEqual([]);
  });

  it("ranks an exact title above partial matches", () => {
    const results = searchLessons("cost basis", 10);
    expect(results[0]?.slug).toBe("cost-basis");
  });

  describe("intent classification", () => {
    it("detects tickers", () => {
      expect(classifyIntent("$PNL")).toBe("ticker");
    });
    it("detects handles", () => {
      expect(classifyIntent("@someone")).toBe("handle");
    });
    it("detects addresses", () => {
      expect(classifyIntent(SOL_MINT)).toBe("address");
      expect(classifyIntent(EVM_ADDR)).toBe("address");
    });
    it("detects natural-language questions", () => {
      expect(classifyIntent("what is pnl")).toBe("question");
      expect(classifyIntent("how does liquidity work")).toBe("question");
      expect(classifyIntent("why did my trade lose money")).toBe("question");
    });
    it("treats a bare ambiguous term as term intent", () => {
      expect(classifyIntent("PNL")).toBe("term");
      expect(classifyIntent("liquidity")).toBe("term");
    });
  });

  it("still surfaces a lesson for a $ticker query (concept below tokens)", () => {
    expect(searchLessons("$PNL", 2).map((r) => r.slug)).toContain(
      "profit-and-loss",
    );
  });

  describe("typo tolerance", () => {
    it("computes bounded edit distance", () => {
      expect(editDistance("slipage", "slippage")).toBe(1);
      expect(editDistance("walet", "wallet")).toBe(1);
      expect(editDistance("abc", "xyz", 2)).toBe(3);
    });

    it("finds slippage content despite a typo", () => {
      expect(slugs("slipage")).toContain("price-impact-and-slippage");
    });

    it("finds wallet content despite a typo", () => {
      const results = slugs("walet");
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("synonyms", () => {
    it("maps plain-English words to canonical concepts", () => {
      expect(expandQuery("coin")).toContain("token");
      expect(expandQuery("rugged")).toContain("rug pull");
      expect(expandQuery("gas")).toContain("fees");
    });
  });

  describe("did-you-mean", () => {
    it("suggests a correction for a near-miss", () => {
      expect(suggestQuery("slipage")).toBe("slippage");
    });
    it("returns nothing for an exact concept", () => {
      expect(suggestQuery("slippage")).toBeUndefined();
    });
    it("returns nothing for very short input", () => {
      expect(suggestQuery("a")).toBeUndefined();
    });
  });

  it("offers popular beginner lessons for zero-result fallbacks", () => {
    const popular = popularLessonSlugs();
    expect(popular.length).toBeGreaterThan(0);
    expect(popular).toContain("what-is-blackpebble");
  });
});

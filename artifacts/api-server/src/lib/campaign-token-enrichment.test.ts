import { describe, expect, it } from "vitest";
import {
  applyTokenEnrichment,
  type EnrichableSummary,
} from "./campaign-token-enrichment.js";

function summary(over: Partial<EnrichableSummary>): EnrichableSummary {
  return {
    publicId: "p1",
    tokenMint: "MintAAA",
    tokenName: null,
    tokenSymbol: null,
    imageUrl: null,
    tokenMarketCapUsd: null,
    tokenMarketCapFetchedAt: null,
    ...over,
  };
}

describe("applyTokenEnrichment", () => {
  it("fills null name/symbol/logo from provider metadata and flags backfill", () => {
    const s = summary({ publicId: "abc", tokenMint: "MintAAA" });
    const backfill = applyTokenEnrichment(
      [s],
      { MintAAA: { name: "Bonk", symbol: "BONK", logo: "http://logo" } },
      new Map(),
    );
    expect(s.tokenName).toBe("Bonk");
    expect(s.tokenSymbol).toBe("BONK");
    expect(s.imageUrl).toBe("http://logo");
    expect(backfill).toEqual([{ publicId: "abc", name: "Bonk", symbol: "BONK" }]);
  });

  it("never overwrites values the row already has", () => {
    const s = summary({
      tokenName: "Existing",
      tokenSymbol: "EXIST",
      imageUrl: "http://existing",
    });
    const backfill = applyTokenEnrichment(
      [s],
      { MintAAA: { name: "Other", symbol: "OTHER", logo: "http://other" } },
      new Map(),
    );
    expect(s.tokenName).toBe("Existing");
    expect(s.tokenSymbol).toBe("EXIST");
    expect(s.imageUrl).toBe("http://existing");
    // Nothing new to persist.
    expect(backfill).toEqual([]);
  });

  it("leaves identity null when metadata is genuinely unavailable (no fake name)", () => {
    const s = summary({ tokenMint: "MintNoMeta" });
    const backfill = applyTokenEnrichment([s], {}, new Map());
    expect(s.tokenName).toBeNull();
    expect(s.tokenSymbol).toBeNull();
    expect(backfill).toEqual([]);
  });

  it("attaches market cap with fetchedAt when present", () => {
    const s = summary({ tokenMint: "MintAAA" });
    applyTokenEnrichment(
      [s],
      {},
      new Map([["MintAAA", { mc: 2_300_000, fetchedAt: 111 }]]),
    );
    expect(s.tokenMarketCapUsd).toBe(2_300_000);
    expect(s.tokenMarketCapFetchedAt).toBe(111);
  });

  it("keeps market cap null (never $0) and fetchedAt null when provider has no data", () => {
    const s = summary({ tokenMint: "MintAAA" });
    applyTokenEnrichment(
      [s],
      {},
      new Map([["MintAAA", { mc: null, fetchedAt: 111 }]]),
    );
    expect(s.tokenMarketCapUsd).toBeNull();
    expect(s.tokenMarketCapFetchedAt).toBeNull();
  });

  it("ignores summaries without a token mint", () => {
    const s = summary({ tokenMint: null });
    const backfill = applyTokenEnrichment(
      [s],
      { MintAAA: { name: "Bonk", symbol: "BONK", logo: null } },
      new Map([["MintAAA", { mc: 5, fetchedAt: 1 }]]),
    );
    expect(s.tokenName).toBeNull();
    expect(s.tokenMarketCapUsd).toBeNull();
    expect(backfill).toEqual([]);
  });
});

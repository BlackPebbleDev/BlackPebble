import { describe, expect, it } from "vitest";
import {
  fmtCompactUsd,
  shortenMint,
  deriveTokenIdentity,
  checkOpeningBalance,
  type TokenIdentityInput,
} from "./campaign-identity";

const LAMPORTS = 1_000_000_000;

function input(over: Partial<TokenIdentityInput>): TokenIdentityInput {
  return {
    tokenMint: "So11111111111111111111111111111111111111112",
    tokenName: null,
    tokenSymbol: null,
    tokenMarketCapUsd: null,
    title: "My Campaign",
    ...over,
  };
}

describe("fmtCompactUsd", () => {
  it("formats K / M / B compactly", () => {
    expect(fmtCompactUsd(48_200)).toBe("$48.2K");
    expect(fmtCompactUsd(2_300_000)).toBe("$2.3M");
    expect(fmtCompactUsd(1_100_000_000)).toBe("$1.1B");
    expect(fmtCompactUsd(950)).toBe("$950");
  });
});

describe("deriveTokenIdentity", () => {
  it("prefers real token name", () => {
    const v = deriveTokenIdentity(input({ tokenName: "Bonk", tokenSymbol: "BONK" }));
    expect(v.name).toBe("Bonk");
    expect(v.ticker).toBe("$BONK");
    expect(v.hasMeta).toBe(true);
    expect(v.isMintFallback).toBe(false);
  });

  it("uses $ticker when only a symbol exists", () => {
    const v = deriveTokenIdentity(input({ tokenSymbol: "WIF" }));
    expect(v.name).toBe("$WIF");
  });

  it("NEVER shows 'Token campaign' — falls back to shortened mint + Metadata unavailable", () => {
    const v = deriveTokenIdentity(
      input({ tokenMint: "So11111111111111111111111111111111111111112" }),
    );
    expect(v.name).not.toBe("Token campaign");
    expect(v.name).toBe(shortenMint("So11111111111111111111111111111111111111112"));
    expect(v.isMintFallback).toBe(true);
    expect(v.hasMeta).toBe(false);
  });

  it("falls back to campaign title only for non-token (community) campaigns", () => {
    const v = deriveTokenIdentity(input({ tokenMint: null, title: "Community fund" }));
    expect(v.name).toBe("Community fund");
    expect(v.hasToken).toBe(false);
  });

  it("shows compact MC when available and 'MC unavailable' otherwise", () => {
    expect(deriveTokenIdentity(input({ tokenMarketCapUsd: 2_300_000 })).mcLabel).toBe(
      "$2.3M MC",
    );
    expect(deriveTokenIdentity(input({ tokenMarketCapUsd: null })).mcLabel).toBe(
      "MC unavailable",
    );
    // Missing data must never render as $0.
    expect(deriveTokenIdentity(input({ tokenMarketCapUsd: null })).mcLabel).not.toContain(
      "$0",
    );
  });
});

describe("checkOpeningBalance", () => {
  it("blocks when balance cannot cover amount + fee + buffer", () => {
    const r = checkOpeningBalance(0.5 * LAMPORTS, 0.5 * LAMPORTS, 5000);
    expect(r.sufficient).toBe(false);
    expect(r.shortfallLamports).toBe(10_000); // fee + buffer
    expect(r.requiredLamports).toBe(0.5 * LAMPORTS + 10_000);
  });

  it("allows when balance covers amount + fee + buffer", () => {
    const r = checkOpeningBalance(1 * LAMPORTS, 0.5 * LAMPORTS, 5000);
    expect(r.sufficient).toBe(true);
    expect(r.shortfallLamports).toBe(0);
  });

  it("respects a custom buffer", () => {
    const r = checkOpeningBalance(100_000, 90_000, 5000, 10_000);
    expect(r.requiredLamports).toBe(105_000);
    expect(r.sufficient).toBe(false);
    expect(r.shortfallLamports).toBe(5000);
  });
});

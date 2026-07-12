import { describe, it, expect } from "vitest";
import { classifyIdentifier } from "./adminIdentifier.js";

/**
 * The admin user resolver's classification is the crux of the single-user reset
 * fix: it decides how each admin identifier is normalised before the DB lookup
 * that maps it to the canonical `x:<x_id>` / wallet account key. These are pure,
 * DB-free assertions for every supported identifier shape.
 */
describe("classifyIdentifier", () => {
  it("treats blank input as empty", () => {
    expect(classifyIdentifier("").kind).toBe("empty");
    expect(classifyIdentifier("   ").kind).toBe("empty");
  });

  it("resolves an X handle with @", () => {
    expect(classifyIdentifier("@PumpGunna")).toEqual({
      kind: "handle",
      value: "pumpgunna",
    });
  });

  it("resolves a bare X handle and lowercases it", () => {
    expect(classifyIdentifier("PumpGunna")).toEqual({
      kind: "handle",
      value: "pumpgunna",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(classifyIdentifier("  @PumpGunna  ")).toEqual({
      kind: "handle",
      value: "pumpgunna",
    });
  });

  it("classifies a numeric id (X id or internal id) as numeric", () => {
    expect(classifyIdentifier("1465789123456789")).toEqual({
      kind: "numeric",
      value: "1465789123456789",
    });
    expect(classifyIdentifier("42")).toEqual({ kind: "numeric", value: "42" });
  });

  it("strips a leading @ before a numeric id", () => {
    expect(classifyIdentifier("@123")).toEqual({
      kind: "numeric",
      value: "123",
    });
  });

  it("recognises the synthetic x:<id> account key (case-insensitive prefix)", () => {
    expect(classifyIdentifier("x:1465789")).toEqual({
      kind: "x-key",
      value: "1465789",
    });
    expect(classifyIdentifier("X:1465789")).toEqual({
      kind: "x-key",
      value: "1465789",
    });
  });

  it("recognises a base58 Solana wallet address", () => {
    const wallet = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
    expect(classifyIdentifier(wallet)).toEqual({ kind: "wallet", value: wallet });
    const wsol = "So11111111111111111111111111111111111111112";
    expect(classifyIdentifier(wsol)).toEqual({ kind: "wallet", value: wsol });
  });

  it("does not confuse a short handle with a wallet", () => {
    // 15 chars max handle length is far below the 32-char wallet floor.
    expect(classifyIdentifier("solana_trader").kind).toBe("handle");
  });

  it("does not confuse a numeric id with a wallet", () => {
    // X ids are well under 32 chars, so they never match the wallet pattern.
    expect(classifyIdentifier("1758901234567890").kind).toBe("numeric");
  });
});

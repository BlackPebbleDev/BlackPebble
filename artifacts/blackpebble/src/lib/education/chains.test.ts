import { describe, it, expect } from "vitest";
import {
  isSolanaAddress,
  isEvmAddress,
  detectAddressChains,
  looksLikeAddress,
  getChain,
  isChainKey,
  enabledChains,
  CHAIN_KEYS,
} from "./chains";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const EVM_ADDR = "0x1234567890abcdef1234567890abcdef12345678";

describe("chains registry", () => {
  it("detects Solana addresses", () => {
    expect(isSolanaAddress(SOL_MINT)).toBe(true);
    expect(isSolanaAddress(EVM_ADDR)).toBe(false);
    expect(isSolanaAddress("pnl")).toBe(false);
    expect(isSolanaAddress("what is pnl")).toBe(false);
  });

  it("detects EVM addresses", () => {
    expect(isEvmAddress(EVM_ADDR)).toBe(true);
    expect(isEvmAddress(SOL_MINT)).toBe(false);
    expect(isEvmAddress("0x123")).toBe(false);
  });

  it("maps addresses to candidate chains", () => {
    expect(detectAddressChains(SOL_MINT)).toEqual(["solana"]);
    const evm = detectAddressChains(EVM_ADDR);
    expect(evm).toContain("ethereum");
    expect(evm).toContain("base");
    expect(evm).not.toContain("solana");
    expect(detectAddressChains("hello")).toEqual([]);
  });

  it("reports whether a string looks like any address", () => {
    expect(looksLikeAddress(SOL_MINT)).toBe(true);
    expect(looksLikeAddress(EVM_ADDR)).toBe(true);
    expect(looksLikeAddress("stop loss")).toBe(false);
  });

  it("exposes chain lookups and only Solana is enabled today", () => {
    expect(getChain("solana")?.displayName).toBe("Solana");
    expect(getChain("nope")).toBeUndefined();
    expect(isChainKey("ethereum")).toBe(true);
    expect(isChainKey("dogechain")).toBe(false);
    const enabled = enabledChains().map((c) => c.key);
    expect(enabled).toEqual(["solana"]);
    expect(CHAIN_KEYS.length).toBeGreaterThan(1);
  });
});

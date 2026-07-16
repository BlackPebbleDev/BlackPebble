import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  reconcileHoldings,
  type MintHolding,
} from "./real-trading-math.js";
import { reconcilePortfolio } from "./real-trading-portfolio.js";

/**
 * Regression coverage for the "one source of truth for current positions" work.
 * These lock in that a wallet can never display a position it does not actually
 * hold on-chain (the 10.14-SOL ghost bug) and that duplicate/WSOL/unpriced
 * cases are handled truthfully.
 */

describe("open position reconciliation (canonical current positions)", () => {
  const WSOL = "So11111111111111111111111111111111111111112";

  it("FIFO 2900 tokens but live balance 0 -> dropped ghost, no position", () => {
    const fifo: MintHolding[] = [
      { tokenMint: "GHOST", tokenAmount: 2900, costBasisSol: 10, firstAcquiredAt: 1 },
    ];
    const { holdings, verified, droppedMints, diagnostics } = reconcileHoldings(
      fifo,
      new Map(), // wallet holds nothing
    );
    expect(verified).toBe(true);
    expect(holdings).toHaveLength(0);
    expect(droppedMints).toBe(1);
    const d = diagnostics[0]!;
    expect(d.historyQuantity).toBe(2900);
    expect(d.liveQuantity).toBe(0);
    expect(d.reconciledQuantity).toBe(0);
    expect(d.droppedAsGhost).toBe(true);
    expect(d.includedInOpenPositions).toBe(false);
    expect(d.includedInAnalyzed).toBe(false);
  });

  it("FIFO 2900 tokens but live balance 100 -> capped to 100 with scaled cost basis", () => {
    const fifo: MintHolding[] = [
      { tokenMint: "PARTIAL", tokenAmount: 2900, costBasisSol: 29, firstAcquiredAt: 1 },
    ];
    const { holdings, diagnostics } = reconcileHoldings(
      fifo,
      new Map([["PARTIAL", 100]]),
    );
    expect(holdings).toHaveLength(1);
    expect(holdings[0]!.tokenAmount).toBeCloseTo(100);
    // Cost basis scales with the fraction still held: 29 * (100/2900) = 1.
    expect(holdings[0]!.costBasisSol).toBeCloseTo(1);
    const d = diagnostics[0]!;
    expect(d.reconciledQuantity).toBeCloseTo(100);
    expect(d.droppedAsGhost).toBe(false);
    expect(d.includedInOpenPositions).toBe(true);
  });

  it("fully transferred-out token is removed from open positions", () => {
    const fifo: MintHolding[] = [
      { tokenMint: "KEEP", tokenAmount: 5, costBasisSol: 1, firstAcquiredAt: 1 },
      { tokenMint: "SENT", tokenAmount: 50, costBasisSol: 2, firstAcquiredAt: 1 },
    ];
    const { holdings } = reconcileHoldings(fifo, new Map([["KEEP", 5]]));
    expect(holdings.map((h) => h.tokenMint)).toEqual(["KEEP"]);
  });

  it("unverified balances produce an unverified state, not historical positions", () => {
    const fifo: MintHolding[] = [
      { tokenMint: "A", tokenAmount: 100, costBasisSol: 1, firstAcquiredAt: 1 },
    ];
    const { holdings, verified } = reconcileHoldings(fifo, null);
    expect(verified).toBe(false);
    expect(holdings).toHaveLength(0);
  });

  it("native SOL is not duplicated through WSOL", () => {
    // Native SOL (2) is a separate quantity from a WSOL token holding (1).
    const p = reconcilePortfolio(2, [
      { mint: WSOL, symbol: "WSOL", amount: 1, priceSol: 1, priceSource: "dexscreener", tracedByHistory: true },
    ]);
    expect(p.nativeSol).toBe(2);
    // Total = native 2 + WSOL 1, counted once each (no merge, no double count).
    expect(p.totalOnChainPortfolioSol).toBeCloseTo(3);
    expect(p.pricedHoldingsValueSol).toBeCloseTo(1);
  });

  it("unpriced live holdings are disclosed and not silently valued at zero", () => {
    const p = reconcilePortfolio(1, [
      { mint: "UNPRICED", symbol: "UNP", amount: 500, priceSol: null, priceSource: null },
    ]);
    expect(p.counts.unpriced).toBe(1);
    // Total is native only; the unpriced holding is disclosed, not zeroed in.
    expect(p.totalOnChainPortfolioSol).toBeCloseTo(1);
    const asset = p.assets.find((a) => a.mint === "UNPRICED")!;
    expect(asset.inclusion).toBe("unpriced");
    expect(asset.includedInOnChain).toBe(false);
    expect(asset.valueSol).toBeNull();
  });
});

describe("getWalletTokenBalances sums duplicate token accounts", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env["HELIUS_API_KEY"] = "";
    process.env["SOLANA_RPC_URL"] = "https://rpc.test/";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("aggregates two accounts of the same mint into one summed balance", async () => {
    vi.doMock("axios", () => ({
      default: {
        post: vi.fn().mockResolvedValue({
          data: {
            result: {
              value: [
                { account: { data: { parsed: { info: { mint: "DUPE", tokenAmount: { uiAmount: 40 } } } } } },
                { account: { data: { parsed: { info: { mint: "DUPE", tokenAmount: { uiAmount: 60 } } } } } },
                { account: { data: { parsed: { info: { mint: "OTHER", tokenAmount: { uiAmount: 5 } } } } } },
              ],
            },
          },
        }),
      },
    }));
    const { getWalletTokenBalances } = await import("./helius.js");
    const balances = await getWalletTokenBalances("Wallet1111111111111111111111111111111111111");
    expect(balances).not.toBeNull();
    // Two token programs are queried, so each account is seen twice -> 2x sums.
    expect(balances!.get("DUPE")).toBeCloseTo(200); // (40+60) across 2 programs
    expect(balances!.get("OTHER")).toBeCloseTo(10);
  });
});

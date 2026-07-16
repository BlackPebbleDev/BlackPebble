import { describe, it, expect } from "vitest";
import {
  canonicalOpenPositions,
  currentOpenPositionCount,
  holdingsAreVerified,
} from "./real-analysis-select";
import type {
  RealAnalysisSummary,
  RealOpenPosition,
  RealPositionReconciliation,
} from "./api";

/**
 * Regression tests for the exact production ghost: a wallet that no longer
 * holds ANSEM still rendered "OPEN POSITIONS (1) ANSEM 2.9K tokens, 10.14 SOL".
 * The canonical selector must be the single choke point that makes this
 * impossible regardless of what a (possibly stale) snapshot stored.
 */

const ANSEM = "ANSEMmintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const CASHDOG = "CASHDOGmintxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

function ansemPosition(tokenAmount = 2900): RealOpenPosition {
  return {
    tokenMint: ANSEM,
    symbol: "ANSEM",
    name: "Ansem",
    logo: null,
    tokenAmount,
    costBasisSol: 10.16,
    avgEntryPriceSol: 10.16 / tokenAmount,
    firstAcquiredAt: 0,
    currentPriceSol: 10.14 / tokenAmount,
    currentValueSol: 10.14,
    unrealizedPnlSol: -0.02,
    marketCapUsd: null,
  };
}

function recon(
  over: Partial<RealPositionReconciliation> & { mint: string },
): RealPositionReconciliation {
  return {
    mint: over.mint,
    historyQuantity: over.historyQuantity ?? 2900,
    liveQuantity: over.liveQuantity ?? null,
    reconciledQuantity: over.reconciledQuantity ?? 0,
    reason: over.reason ?? "",
    droppedAsGhost: over.droppedAsGhost ?? false,
    includedInOpenPositions: over.includedInOpenPositions ?? false,
    includedInAnalyzed: over.includedInAnalyzed ?? false,
  };
}

function summary(over: Partial<RealAnalysisSummary>): RealAnalysisSummary {
  return {
    wallet: "wallet",
    computedAt: 100,
    syncStatus: "idle",
    lastSyncedAt: null,
    tradeCount: 20,
    dataSources: "helius",
    // Only the fields the selectors read matter; cast the rest.
    metrics: {} as RealAnalysisSummary["metrics"],
    signals: [],
    dna: null,
    personality: {} as RealAnalysisSummary["personality"],
    walletHealth: {} as RealAnalysisSummary["walletHealth"],
    openPositions: [],
    holdingsVerified: true,
    droppedGhostMints: 0,
    insights: [],
    portfolio: null,
    reconciliation: [],
    reconciliationId: 100,
    ...over,
  };
}

describe("canonicalOpenPositions - ghost position guarantees", () => {
  it("holdingsVerified=false + historical FIFO ANSEM renders NOTHING", () => {
    const a = summary({
      holdingsVerified: false,
      openPositions: [ansemPosition()],
      reconciliation: [
        recon({ mint: ANSEM, liveQuantity: null, reconciledQuantity: 0 }),
      ],
    });
    expect(holdingsAreVerified(a)).toBe(false);
    expect(canonicalOpenPositions(a)).toHaveLength(0);
    expect(currentOpenPositionCount(a)).toBeNull();
  });

  it("holdingsVerified=true + live ANSEM balance 0 drops it as a ghost", () => {
    const a = summary({
      holdingsVerified: true,
      openPositions: [ansemPosition()],
      reconciliation: [
        recon({
          mint: ANSEM,
          liveQuantity: 0,
          reconciledQuantity: 0,
          droppedAsGhost: true,
          includedInOpenPositions: false,
          includedInAnalyzed: false,
        }),
      ],
    });
    expect(canonicalOpenPositions(a)).toHaveLength(0);
    expect(currentOpenPositionCount(a)).toBe(0);
  });

  it("verified snapshot with a stored position but NO reconciliation entry renders nothing", () => {
    // Legacy-shaped: stored open position but no per-mint reconciliation proof.
    const a = summary({
      holdingsVerified: true,
      openPositions: [ansemPosition()],
      reconciliation: [],
    });
    expect(canonicalOpenPositions(a)).toHaveLength(0);
  });

  it("renders a genuinely held, priced position and caps the amount to live balance", () => {
    const a = summary({
      holdingsVerified: true,
      openPositions: [ansemPosition(2900)],
      reconciliation: [
        recon({
          mint: ANSEM,
          liveQuantity: 100,
          reconciledQuantity: 100,
          droppedAsGhost: false,
          includedInOpenPositions: true,
          includedInAnalyzed: true,
        }),
      ],
    });
    const out = canonicalOpenPositions(a);
    expect(out).toHaveLength(1);
    // Displayed amount is capped to the reconciled live balance, not the FIFO 2900.
    expect(out[0]!.tokenAmount).toBe(100);
    expect(currentOpenPositionCount(a)).toBe(1);
  });

  it("excludes held-but-unpriced holdings from open positions (includedInAnalyzed=false)", () => {
    const a = summary({
      holdingsVerified: true,
      openPositions: [ansemPosition()],
      reconciliation: [
        recon({
          mint: ANSEM,
          liveQuantity: 2900,
          reconciledQuantity: 2900,
          droppedAsGhost: false,
          includedInOpenPositions: true,
          includedInAnalyzed: false,
        }),
      ],
    });
    expect(canonicalOpenPositions(a)).toHaveLength(0);
  });

  it("excludes dust-level reconciled balances", () => {
    const a = summary({
      holdingsVerified: true,
      openPositions: [ansemPosition()],
      reconciliation: [
        recon({
          mint: ANSEM,
          liveQuantity: 1e-12,
          reconciledQuantity: 1e-12,
          includedInOpenPositions: true,
          includedInAnalyzed: true,
        }),
      ],
    });
    expect(canonicalOpenPositions(a)).toHaveLength(0);
  });

  it("keeps a real position while dropping a ghost in the same wallet", () => {
    const a = summary({
      holdingsVerified: true,
      openPositions: [
        ansemPosition(),
        {
          tokenMint: CASHDOG,
          symbol: "CashDog",
          name: null,
          logo: null,
          tokenAmount: 50,
          costBasisSol: 1,
          avgEntryPriceSol: 0.02,
          firstAcquiredAt: 0,
          currentPriceSol: 0.03,
          currentValueSol: 1.5,
          unrealizedPnlSol: 0.5,
          marketCapUsd: null,
        },
      ],
      reconciliation: [
        recon({ mint: ANSEM, droppedAsGhost: true }),
        recon({
          mint: CASHDOG,
          liveQuantity: 50,
          reconciledQuantity: 50,
          includedInOpenPositions: true,
          includedInAnalyzed: true,
        }),
      ],
    });
    const out = canonicalOpenPositions(a);
    expect(out.map((p) => p.tokenMint)).toEqual([CASHDOG]);
  });
});

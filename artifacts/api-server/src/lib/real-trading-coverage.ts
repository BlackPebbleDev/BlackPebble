/**
 * Report coverage & confidence metadata (Phase 2B, Part 15).
 *
 * Users must be able to see WHAT BlackPebble successfully analyzed and where the
 * picture is incomplete, rather than the report silently hiding gaps. Pure and
 * fully testable: the engine assembles the raw counts and this maps them onto a
 * coverage tier plus honest limitation strings.
 */

export type CoverageTier = "high" | "moderate" | "limited" | "insufficient";

export interface CoverageInput {
  /** Directional swaps successfully parsed from history. */
  parsedSwaps: number;
  /** Token↔token swaps that could not be reconstructed in SOL terms. */
  unsupportedSwaps: number;
  /** Completed FIFO round trips (all are SOL-priced by construction). */
  completedTrades: number;
  /** Verified, priced current holdings. */
  verifiedHoldings: number;
  /** Current holdings that could not be priced. */
  unpricedHoldings: number;
  /** Live-balance verification succeeded for current holdings. */
  holdingsVerified: boolean;
  /** History exceeded the per-sync reconstruction limit. */
  historyTruncated: boolean;
  /** Trade-history tokens no longer held (excluded from current positions). */
  droppedGhostMints: number;
  /** Unix seconds of the first and last analyzed swap. */
  firstTradeAt: number | null;
  lastTradeAt: number | null;
}

export interface ReportCoverage {
  parsedSwaps: number;
  unsupportedSwaps: number;
  completedTrades: number;
  verifiedHoldings: number;
  unpricedHoldings: number;
  holdingsVerified: boolean;
  historyTruncated: boolean;
  droppedGhostMints: number;
  firstTradeAt: number | null;
  lastTradeAt: number | null;
  /** Fraction (0-1) of parseable activity that produced usable swaps. */
  parseCoverage: number;
  /** Fraction (0-1) of current holdings that are priced. */
  pricingCoverage: number;
  tier: CoverageTier;
  /** Short human summary of the tier. */
  summary: string;
  limitations: string[];
}

/** Minimum completed trades before the report's behavioral claims are trusted. */
const MIN_COMPLETED_FOR_COVERAGE = 5;

export function computeCoverage(input: CoverageInput): ReportCoverage {
  const totalSwapAttempts = input.parsedSwaps + input.unsupportedSwaps;
  const parseCoverage =
    totalSwapAttempts > 0 ? input.parsedSwaps / totalSwapAttempts : 1;
  const totalCurrent = input.verifiedHoldings + input.unpricedHoldings;
  const pricingCoverage =
    totalCurrent > 0 ? input.verifiedHoldings / totalCurrent : 1;

  const limitations: string[] = [];
  if (input.unsupportedSwaps > 0) {
    limitations.push(
      `${input.unsupportedSwaps} token-to-token swap${input.unsupportedSwaps === 1 ? "" : "s"} could not be reconstructed in SOL terms and are excluded.`,
    );
  }
  if (input.historyTruncated) {
    limitations.push(
      "Swap history exceeded the per-sync limit, so the oldest trades are not yet included.",
    );
  }
  if (!input.holdingsVerified) {
    limitations.push(
      "Live token balances could not be verified, so current holdings and exposure are not shown.",
    );
  }
  if (input.unpricedHoldings > 0) {
    limitations.push(
      `${input.unpricedHoldings} current holding${input.unpricedHoldings === 1 ? "" : "s"} could not be priced and are excluded from valuation (never counted as zero).`,
    );
  }
  if (input.droppedGhostMints > 0) {
    limitations.push(
      `${input.droppedGhostMints} token${input.droppedGhostMints === 1 ? "" : "s"} from history are no longer held and were excluded from current positions.`,
    );
  }

  let tier: CoverageTier;
  if (input.completedTrades < MIN_COMPLETED_FOR_COVERAGE) {
    tier = "insufficient";
  } else if (
    input.historyTruncated ||
    !input.holdingsVerified ||
    parseCoverage < 0.85 ||
    pricingCoverage < 0.6
  ) {
    tier = "limited";
  } else if (
    input.completedTrades >= 20 &&
    parseCoverage >= 0.95 &&
    pricingCoverage >= 0.9
  ) {
    tier = "high";
  } else {
    tier = "moderate";
  }

  const summary =
    tier === "high"
      ? "High coverage — a reliable, well-populated analysis."
      : tier === "moderate"
        ? "Moderate coverage — the core analysis is reliable with minor gaps."
        : tier === "limited"
          ? "Limited coverage — some data was unavailable; read the limitations below."
          : "Insufficient data — not enough completed trades to score reliably yet.";

  return {
    parsedSwaps: input.parsedSwaps,
    unsupportedSwaps: input.unsupportedSwaps,
    completedTrades: input.completedTrades,
    verifiedHoldings: input.verifiedHoldings,
    unpricedHoldings: input.unpricedHoldings,
    holdingsVerified: input.holdingsVerified,
    historyTruncated: input.historyTruncated,
    droppedGhostMints: input.droppedGhostMints,
    firstTradeAt: input.firstTradeAt,
    lastTradeAt: input.lastTradeAt,
    parseCoverage,
    pricingCoverage,
    tier,
    summary,
    limitations,
  };
}

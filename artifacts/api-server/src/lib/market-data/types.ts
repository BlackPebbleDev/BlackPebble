/**
 * Provider-neutral historical market data contracts (Phase 2C, Part 2 + 23).
 *
 * The Trader Intelligence engine must never be coupled to one vendor. These
 * normalized types describe candles, price windows, and liquidity points in a
 * multichain-ready shape so Birdeye, GeckoTerminal, DexScreener-derived
 * sources, Helius-enhanced data, or future EVM providers can all satisfy the
 * same interface. Solana-specific concepts (WSOL, base58 pools) never leak into
 * these generic contracts.
 *
 * Honesty rules baked into the shape:
 *  - every window/candle reports its `source`, `interval`, and `confidence`
 *  - unavailable data is expressed as an explicit state, never fabricated
 *  - completeness is measured, not assumed
 */

/** Chain identity. Solana-first today; the union widens as chains are added. */
export type ChainId =
  | "solana"
  | "ethereum"
  | "base"
  | "arbitrum"
  | "avalanche"
  | "bnb";

/** Candle interval, vendor-neutral. Mirrors the existing candle resolutions. */
export type CandleInterval =
  | "15s"
  | "30s"
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "4h"
  | "1d";

/** Approximate seconds per interval, for window math and gap detection. */
export const INTERVAL_SECONDS: Record<CandleInterval, number> = {
  "15s": 15,
  "30s": 30,
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

/** How much to trust a normalized market-data point. */
export type DataConfidence = "high" | "medium" | "low" | "unavailable";

/**
 * A single normalized OHLCV candle. `timestamp` is the candle OPEN time in unix
 * seconds. USD-denominated prices. Optional enrichment fields are present only
 * when the underlying source actually supplies them.
 */
export interface HistoricalCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeUsd: number | null;
  liquidityUsd?: number | null;
  marketCapUsd?: number | null;
  fdvUsd?: number | null;
  source: string;
  interval: CandleInterval;
  confidence: DataConfidence;
}

/**
 * A requested price path over a window. `actualStart`/`actualEnd` may be
 * narrower than requested when the source only has partial history.
 * `completeness` is the fraction (0..1) of expected candles that were returned.
 */
export interface HistoricalPriceWindow {
  chain: ChainId;
  mint: string;
  pairAddress: string | null;
  requestedStart: number;
  requestedEnd: number;
  actualStart: number | null;
  actualEnd: number | null;
  candles: HistoricalCandle[];
  source: string;
  interval: CandleInterval;
  /** 0..1 fraction of expected candles present in the window. */
  completeness: number;
  limitations: string[];
}

/** A liquidity/reserve observation at a point in time (USD). */
export interface HistoricalLiquidityPoint {
  timestamp: number;
  liquidityUsd: number;
  source: string;
  confidence: DataConfidence;
}

/** Declares which capabilities a provider actually supports. */
export interface ProviderCapabilities {
  candles: boolean;
  priceWindow: boolean;
  liquidityHistory: boolean;
  /** Intervals the provider can serve. */
  intervals: CandleInterval[];
  /** Chains the provider can serve. */
  chains: ChainId[];
}

/** Common request shape for a windowed lookup. */
export interface WindowRequest {
  chain: ChainId;
  mint: string;
  /** Optional explicit pool/pair; providers may resolve their own otherwise. */
  pairAddress?: string | null;
  start: number;
  end: number;
  interval: CandleInterval;
}

/**
 * Provider-neutral historical market data source. Implementations wrap a single
 * vendor (GeckoTerminal, Birdeye, ...) and translate to the normalized types.
 * A provider must fail honestly: on outage it returns an empty/limited window
 * with `confidence: "unavailable"`, never fabricated candles.
 */
export interface HistoricalMarketDataProvider {
  /** Stable provider identity, e.g. "geckoterminal". */
  readonly id: string;
  /** What this provider can do. */
  capabilities(): ProviderCapabilities;
  /** Fetch a price path over a window. Always resolves (never throws). */
  fetchPriceWindow(req: WindowRequest): Promise<HistoricalPriceWindow>;
  /**
   * Fetch the candle nearest a timestamp within a tolerance. Returns null when
   * no candle is available within tolerance.
   */
  fetchNearestCandle(
    req: Omit<WindowRequest, "start" | "end"> & {
      timestamp: number;
      toleranceSec?: number;
    },
  ): Promise<HistoricalCandle | null>;
  /** Fetch liquidity history where supported; empty array otherwise. */
  fetchLiquidityHistory(req: WindowRequest): Promise<HistoricalLiquidityPoint[]>;
}

/** Pick the candle whose open time is closest to `timestamp`. Pure helper. */
export function nearestCandle(
  candles: HistoricalCandle[],
  timestamp: number,
  toleranceSec?: number,
): HistoricalCandle | null {
  let best: HistoricalCandle | null = null;
  let bestDist = Infinity;
  for (const c of candles) {
    const d = Math.abs(c.timestamp - timestamp);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  if (best && toleranceSec != null && bestDist > toleranceSec) return null;
  return best;
}

/**
 * Candles whose open time falls within [start, end] inclusive, oldest first.
 * Pure helper used by the entry/exit engines to slice a fetched window.
 */
export function candlesInRange(
  candles: HistoricalCandle[],
  start: number,
  end: number,
): HistoricalCandle[] {
  return candles
    .filter((c) => c.timestamp >= start && c.timestamp <= end)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Expected candle count for a window at an interval (inclusive of both ends).
 * Used to compute completeness without assuming a perfect grid.
 */
export function expectedCandleCount(
  start: number,
  end: number,
  interval: CandleInterval,
): number {
  if (end <= start) return 1;
  const step = INTERVAL_SECONDS[interval];
  return Math.max(1, Math.floor((end - start) / step) + 1);
}

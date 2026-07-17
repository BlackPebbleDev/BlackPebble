/**
 * Historical enrichment layer (Phase 2C, Part 4).
 *
 * Two responsibilities, cleanly separated:
 *  1. PURE quality computation from candles already in hand
 *     (`computeQualityFromCandles`) - fully testable, no I/O.
 *  2. A BOUNDED, safe cache-population orchestrator (`enrichWalletTrades`) that
 *     fetches only the candles it needs, reuses the durable cache, deduplicates
 *     concurrent work per wallet, applies bounded concurrency + timeouts + a
 *     circuit breaker, and NEVER lets provider failure break analysis.
 *
 * The base analysis never blocks on external calls: the engine computes quality
 * from whatever candles are already cached and reports a readiness status.
 * Enrichment is triggered explicitly and populates the cache for next time.
 */

import { logger } from "./logger.js";
import type { ConfidenceTier } from "./real-trading-confidence.js";
import {
  analyzeEntry,
  summarizeEntryQuality,
  type EntryQualityEvidence,
  type EntryQualitySummary,
} from "./real-trading-entry-quality.js";
import {
  analyzeExit,
  summarizeExitQuality,
  type ExitQualityEvidence,
  type ExitQualitySummary,
} from "./real-trading-exit-quality.js";
import type { ReconstructedRoundTrip } from "./real-trading-roundtrips.js";
import type { CandleInterval, ChainId, HistoricalCandle } from "./market-data/types.js";
import { readCachedCandles, upsertCandles } from "./market-data/cache.js";
import { defaultMarketDataProvider } from "./market-data/geckoterminal-provider.js";

export type EnrichmentStatus =
  | "ready"
  | "partial"
  | "processing"
  | "unavailable"
  | "insufficient_data";

export interface QualityResult {
  entrySummary: EntryQualitySummary;
  exitSummary: ExitQualitySummary;
  status: EnrichmentStatus;
  analyzedTrades: number;
  eligibleTrades: number;
}

/** Choose a candle interval appropriate to a trade's hold duration. */
export function intervalForHold(holdDurationSec: number): CandleInterval {
  if (holdDurationSec <= 3600) return "5m";
  if (holdDurationSec <= 6 * 3600) return "15m";
  if (holdDurationSec <= 7 * 86400) return "1h";
  return "4h";
}

/** Window (seconds) to analyze around a trip: 1h before entry to 4h after exit. */
export function windowForTrip(trip: ReconstructedRoundTrip): {
  start: number;
  end: number;
} {
  const end = (trip.sellTime ?? trip.buyTime) + 4 * 3600;
  return { start: trip.buyTime - 3600, end };
}

/**
 * PURE: compute entry/exit quality summaries from candles already provided.
 * A trip with no candles contributes an "insufficient" evidence row, so
 * coverage is measured honestly.
 */
export function computeQualityFromCandles(
  closedTrips: ReconstructedRoundTrip[],
  candlesByTripId: Map<string, HistoricalCandle[]>,
  tier: ConfidenceTier,
  source: string,
): QualityResult {
  const eligible = closedTrips.length;
  const entryEvidence: EntryQualityEvidence[] = [];
  const exitEvidence: ExitQualityEvidence[] = [];
  for (const trip of closedTrips) {
    const candles = candlesByTripId.get(trip.roundTripId) ?? [];
    entryEvidence.push(analyzeEntry(trip, candles, source));
    exitEvidence.push(analyzeExit(trip, candles, source));
  }
  const entrySummary = summarizeEntryQuality(eligible, entryEvidence, tier);
  const exitSummary = summarizeExitQuality(eligible, exitEvidence, tier);
  const analyzed = Math.max(
    entrySummary.analyzedEntries,
    exitSummary.analyzedExits,
  );

  let status: EnrichmentStatus;
  if (eligible === 0) status = "insufficient_data";
  else if (analyzed === 0) status = "processing";
  else if (analyzed >= eligible) status = "ready";
  else status = "partial";

  return { entrySummary, exitSummary, status, analyzedTrades: analyzed, eligibleTrades: eligible };
}

/**
 * Read cached candles for each closed trip's analysis window. Cheap DB reads
 * only - the base analysis path uses this so it never blocks on external calls.
 */
export async function loadCachedCandlesForTrips(
  chain: ChainId,
  trips: ReconstructedRoundTrip[],
): Promise<Map<string, HistoricalCandle[]>> {
  const byTrip = new Map<string, HistoricalCandle[]>();
  for (const trip of trips) {
    const { start, end } = windowForTrip(trip);
    const interval = intervalForHold(trip.holdDurationSec);
    try {
      const candles = await readCachedCandles({
        chain,
        mint: trip.tokenMint,
        interval,
        start,
        end,
      });
      byTrip.set(trip.roundTripId, candles);
    } catch (e) {
      logger.warn({ err: e, mint: trip.tokenMint }, "Cached candle read failed");
      byTrip.set(trip.roundTripId, []);
    }
  }
  return byTrip;
}

// ── Bounded enrichment orchestrator ─────────────────────────────────────────

export interface EnrichOptions {
  chain?: ChainId;
  /** Hard cap on trades enriched per invocation (bounds external calls). */
  maxTrades?: number;
  /** Max concurrent provider fetches. */
  concurrency?: number;
  /** Consecutive provider failures before the circuit opens. */
  circuitThreshold?: number;
}

const DEFAULTS: Required<Omit<EnrichOptions, "chain">> = {
  maxTrades: 40,
  concurrency: 3,
  circuitThreshold: 5,
};

/** Per-wallet in-flight dedup so concurrent requests share one enrichment run. */
const inFlight = new Map<string, Promise<EnrichmentRunResult>>();

export interface EnrichmentRunResult {
  fetched: number;
  cached: number;
  failures: number;
  circuitOpen: boolean;
  tradesConsidered: number;
}

/**
 * Populate the durable candle cache for a wallet's most recent closed trips,
 * with all Part-4 safety controls. Best-effort: returns run stats and never
 * throws. Deduplicates concurrent runs for the same wallet.
 */
export function enrichWalletTrades(
  wallet: string,
  closedTrips: ReconstructedRoundTrip[],
  opts: EnrichOptions = {},
): Promise<EnrichmentRunResult> {
  const existing = inFlight.get(wallet);
  if (existing) return existing;
  const task = runEnrichment(wallet, closedTrips, opts).finally(() => {
    inFlight.delete(wallet);
  });
  inFlight.set(wallet, task);
  return task;
}

async function runEnrichment(
  wallet: string,
  closedTrips: ReconstructedRoundTrip[],
  opts: EnrichOptions,
): Promise<EnrichmentRunResult> {
  const chain: ChainId = opts.chain ?? "solana";
  const cfg = { ...DEFAULTS, ...opts };
  const provider = defaultMarketDataProvider();

  // Most recent trips first - they matter most and bound the work.
  const targets = [...closedTrips]
    .sort((a, b) => (b.sellTime ?? 0) - (a.sellTime ?? 0))
    .slice(0, cfg.maxTrades);

  const result: EnrichmentRunResult = {
    fetched: 0,
    cached: 0,
    failures: 0,
    circuitOpen: false,
    tradesConsidered: targets.length,
  };

  let consecutiveFailures = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      if (result.circuitOpen) return;
      const trip = targets[cursor++]!;
      const { start, end } = windowForTrip(trip);
      const interval = intervalForHold(trip.holdDurationSec);
      // Skip when we already hold fresh cached candles for the window.
      try {
        const cached = await readCachedCandles({
          chain,
          mint: trip.tokenMint,
          interval,
          start,
          end,
        });
        if (cached.length > 0) {
          result.cached++;
          consecutiveFailures = 0;
          continue;
        }
      } catch {
        // fall through to fetch
      }
      try {
        const window = await provider.fetchPriceWindow({
          chain,
          mint: trip.tokenMint,
          interval,
          start,
          end,
        });
        if (window.candles.length > 0) {
          await upsertCandles({
            chain,
            mint: trip.tokenMint,
            pairAddress: window.pairAddress,
            interval,
            candles: window.candles,
          });
          result.fetched++;
          consecutiveFailures = 0;
        } else {
          consecutiveFailures++;
          result.failures++;
        }
      } catch (e) {
        consecutiveFailures++;
        result.failures++;
        logger.warn({ err: e, mint: trip.tokenMint }, "Enrichment fetch failed");
      }
      if (consecutiveFailures >= cfg.circuitThreshold) {
        result.circuitOpen = true;
        logger.warn(
          { wallet, failures: consecutiveFailures },
          "Enrichment circuit breaker opened",
        );
        return;
      }
    }
  };

  const workers = Array.from({ length: Math.min(cfg.concurrency, targets.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  logger.info({ wallet, ...result }, "Wallet trade enrichment complete");
  return result;
}

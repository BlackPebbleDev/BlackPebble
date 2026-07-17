/**
 * GeckoTerminal historical market data provider (Phase 2C, Part 2).
 *
 * Wraps the existing `candles.ts` OHLCV fetcher (GeckoTerminal, trusted-pool
 * resolved) and normalizes it to the provider-neutral contracts. This adds NO
 * new vendor coupling and reuses the same pool selection, caching, and
 * serve-stale behavior the token charts already rely on.
 *
 * The engine depends only on `HistoricalMarketDataProvider`, so a future
 * Birdeye/GeckoTerminal-Pro/EVM provider is a drop-in swap.
 */

import {
  getCandleRange,
  isCandleResolution,
  type CandleResolution,
} from "../candles.js";
import { logger } from "../logger.js";
import {
  candlesInRange,
  expectedCandleCount,
  nearestCandle,
  type CandleInterval,
  type HistoricalCandle,
  type HistoricalLiquidityPoint,
  type HistoricalMarketDataProvider,
  type HistoricalPriceWindow,
  type ProviderCapabilities,
  type WindowRequest,
} from "./types.js";

const SUPPORTED_INTERVALS: CandleInterval[] = [
  "15s",
  "30s",
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
];

const INTERVAL_SECONDS: Record<CandleInterval, number> = {
  "15s": 15,
  "30s": 30,
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

export class GeckoTerminalProvider implements HistoricalMarketDataProvider {
  readonly id = "geckoterminal";

  capabilities(): ProviderCapabilities {
    return {
      candles: true,
      priceWindow: true,
      // GeckoTerminal OHLCV does not expose per-candle liquidity history.
      liquidityHistory: false,
      intervals: SUPPORTED_INTERVALS,
      chains: ["solana"],
    };
  }

  async fetchPriceWindow(req: WindowRequest): Promise<HistoricalPriceWindow> {
    const empty = (limitations: string[]): HistoricalPriceWindow => ({
      chain: req.chain,
      mint: req.mint,
      pairAddress: req.pairAddress ?? null,
      requestedStart: req.start,
      requestedEnd: req.end,
      actualStart: null,
      actualEnd: null,
      candles: [],
      source: this.id,
      interval: req.interval,
      completeness: 0,
      limitations,
    });

    if (req.chain !== "solana") {
      return empty(["GeckoTerminal provider currently supports Solana only."]);
    }
    if (!isCandleResolution(req.interval)) {
      return empty([`Unsupported interval: ${req.interval}`]);
    }

    const step = INTERVAL_SECONDS[req.interval];
    const expected = expectedCandleCount(req.start, req.end, req.interval);
    const countBack = Math.min(1000, Math.max(50, expected + 10));

    try {
      const range = await getCandleRange({
        mint: req.mint,
        resolution: req.interval as CandleResolution,
        before: req.end + step, // include the end candle
        countBack,
        marketCap: false,
      });
      if (!range || range.candles.length === 0) {
        return empty(["No historical candles available for this window."]);
      }
      const supply = range.supply;
      const all: HistoricalCandle[] = range.candles.map((c) => ({
        timestamp: c.t,
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
        volumeUsd: c.v,
        liquidityUsd: null,
        marketCapUsd: supply != null && supply > 0 ? c.c * supply : null,
        source: this.id,
        interval: req.interval,
        confidence: range.noData ? "low" : "high",
      }));
      const windowCandles = candlesInRange(all, req.start, req.end);
      const completeness =
        expected > 0 ? Math.min(1, windowCandles.length / expected) : 0;
      const limitations: string[] = [];
      if (completeness < 1) {
        limitations.push(
          "Historical price data is partial for this window; metrics use the closest available candles.",
        );
      }
      return {
        chain: req.chain,
        mint: req.mint,
        pairAddress: range.poolAddress ?? req.pairAddress ?? null,
        requestedStart: req.start,
        requestedEnd: req.end,
        actualStart: windowCandles[0]?.timestamp ?? null,
        actualEnd: windowCandles[windowCandles.length - 1]?.timestamp ?? null,
        candles: windowCandles,
        source: this.id,
        interval: req.interval,
        completeness,
        limitations,
      };
    } catch (e) {
      logger.warn({ err: e, mint: req.mint }, "GeckoTerminal window fetch failed");
      return empty(["Historical market data provider is temporarily unavailable."]);
    }
  }

  async fetchNearestCandle(
    req: Omit<WindowRequest, "start" | "end"> & {
      timestamp: number;
      toleranceSec?: number;
    },
  ): Promise<HistoricalCandle | null> {
    const tol = req.toleranceSec ?? INTERVAL_SECONDS[req.interval] * 4;
    const window = await this.fetchPriceWindow({
      chain: req.chain,
      mint: req.mint,
      pairAddress: req.pairAddress ?? null,
      interval: req.interval,
      start: req.timestamp - tol,
      end: req.timestamp + tol,
    });
    return nearestCandle(window.candles, req.timestamp, tol);
  }

  async fetchLiquidityHistory(
    _req: WindowRequest,
  ): Promise<HistoricalLiquidityPoint[]> {
    // Not supported by GeckoTerminal OHLCV. Honest empty result.
    return [];
  }
}

let singleton: GeckoTerminalProvider | null = null;

/** Default provider used by the enrichment layer. */
export function defaultMarketDataProvider(): HistoricalMarketDataProvider {
  if (!singleton) singleton = new GeckoTerminalProvider();
  return singleton;
}

/**
 * TradingView Advanced Charts — BlackPebble Datafeed adapter.
 *
 * This is the data bridge between TradingView's Charting Library and our
 * backend. It is intentionally framework-agnostic (no React) and does NOT
 * import the charting library itself, so it type-checks and unit-tests without
 * the (private, non-redistributable) library being installed. Once access is
 * approved and `charting_library` is dropped into `public/`, this object is
 * passed straight to the widget constructor's `datafeed` option.
 *
 * Data source: our `/markets/:mint/candles/range` endpoint, which serves
 * GeckoTerminal OHLCV for the trusted pool and can return market-cap-valued
 * candles using a pinned on-chain supply — so price and MC stay consistent
 * across every timeframe.
 *
 * Docs: https://www.tradingview.com/charting-library-docs/latest/connecting_data/datafeed-api/
 */

import { api, type Candle, type CandleResolution } from "./api";

// ── Minimal Datafeed API surface (subset we implement) ───────────────────────
// Structural stand-ins for the library's own types so this file builds without
// the library present. When the real `charting_library.d.ts` is available these
// remain compatible (they are structurally a subset of the official types).

export type TvResolution = string;

export interface TvBar {
  time: number; // ms since epoch (bar open time)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TvPeriodParams {
  from: number; // unix seconds
  to: number; // unix seconds
  countBack: number;
  firstDataRequest: boolean;
}

export interface TvSymbolInfo {
  name: string;
  ticker: string;
  description: string;
  type: string;
  session: string;
  timezone: string;
  exchange: string;
  listed_exchange: string;
  format: "price";
  minmov: number;
  pricescale: number;
  has_intraday: boolean;
  has_seconds: boolean;
  has_daily: boolean;
  visible_plots_set: "ohlcv" | "ohlc" | "c";
  supported_resolutions: TvResolution[];
  volume_precision: number;
  data_status: "streaming" | "endofday" | "pulsed" | "delayed_streaming";
  // BlackPebble extensions (allowed as extra fields on symbolInfo):
  bpMint: string;
  bpMarketCap: boolean;
}

interface DatafeedConfiguration {
  supported_resolutions: TvResolution[];
  supports_marks: boolean;
  supports_timescale_marks: boolean;
  supports_time: boolean;
}

export interface BlackPebbleDatafeed {
  onReady(cb: (config: DatafeedConfiguration) => void): void;
  searchSymbols(
    userInput: string,
    exchange: string,
    symbolType: string,
    onResult: (items: unknown[]) => void,
  ): void;
  resolveSymbol(
    symbolName: string,
    onResolve: (info: TvSymbolInfo) => void,
    onError: (reason: string) => void,
  ): void;
  getBars(
    symbolInfo: TvSymbolInfo,
    resolution: TvResolution,
    periodParams: TvPeriodParams,
    onResult: (bars: TvBar[], meta: { noData: boolean }) => void,
    onError: (reason: string) => void,
  ): void;
  subscribeBars(
    symbolInfo: TvSymbolInfo,
    resolution: TvResolution,
    onTick: (bar: TvBar) => void,
    listenerGuid: string,
  ): void;
  unsubscribeBars(listenerGuid: string): void;
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Resolutions we expose in the TradingView toolbar. Sub-minute (seconds) is
 * intentionally excluded — GeckoTerminal cannot serve it reliably, and the
 * product requirement is no broken 15s/30s options.
 */
export const TV_SUPPORTED_RESOLUTIONS: TvResolution[] = [
  "1",
  "5",
  "15",
  "60",
  "240",
  "1D",
];

const RESOLUTION_MS: Record<CandleResolution, number> = {
  "15s": 15_000,
  "30s": 30_000,
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

/**
 * Map a TradingView resolution string to our backend CandleResolution.
 * Returns null for anything we don't serve (e.g. seconds), which lets callers
 * reject the symbol rather than silently mis-resolving.
 */
export function tvResolutionToCandle(res: TvResolution): CandleResolution | null {
  switch (res) {
    case "1":
      return "1m";
    case "5":
      return "5m";
    case "15":
      return "15m";
    case "60":
      return "1h";
    case "240":
      return "4h";
    case "1D":
    case "D":
    case "1440":
      return "1d";
    default:
      return null;
  }
}

/** Encode a chart symbol ticker carrying the mint and price/MC mode. */
export function encodeTicker(mint: string, marketCap: boolean): string {
  return marketCap ? `${mint}~mc` : mint;
}

/** Decode a ticker produced by {@link encodeTicker}. */
export function parseTicker(ticker: string): { mint: string; marketCap: boolean } {
  const marketCap = ticker.endsWith("~mc");
  const mint = marketCap ? ticker.slice(0, -3) : ticker;
  return { mint, marketCap };
}

/** Convert one backend candle (unix seconds) to a TradingView bar (ms). */
export function candleToBar(c: Candle): TvBar {
  return {
    time: c.t * 1000,
    open: c.o,
    high: c.h,
    low: c.l,
    close: c.c,
    volume: c.v,
  };
}

/**
 * Turn oldest-first candles into TradingView bars within the requested
 * [from, to) window (both unix seconds). The library is strict about ordering
 * and range, so we filter and sort defensively.
 */
export function candlesToBars(
  candles: Candle[],
  from: number,
  to: number,
): TvBar[] {
  return candles
    .filter((c) => c.t >= from && c.t < to)
    .sort((a, b) => a.t - b.t)
    .map(candleToBar);
}

/**
 * Choose a sensible price scale so small memecoin prices/MCs render with enough
 * precision. TradingView `pricescale` is 10^decimals.
 */
export function priceScaleFor(sampleValue: number): number {
  if (!Number.isFinite(sampleValue) || sampleValue <= 0) return 100_000_000;
  if (sampleValue >= 1000) return 100;
  if (sampleValue >= 1) return 10_000;
  if (sampleValue >= 0.0001) return 1_000_000;
  return 100_000_000;
}

// ── Datafeed factory ─────────────────────────────────────────────────────────

export interface DatafeedOptions {
  /** Display symbol (e.g. token symbol like "BONK"). */
  displaySymbol: string;
  /** A representative recent value used to pick the price scale. */
  sampleValue?: number;
}

/**
 * Build a Datafeed bound to a single token mint. The price/MC mode is carried
 * on the symbol ticker, so switching modes is a `setSymbol` on the widget.
 */
export function createDatafeed(
  mint: string,
  opts: DatafeedOptions,
): BlackPebbleDatafeed {
  const subscriptions = new Map<string, ReturnType<typeof setInterval>>();

  return {
    onReady(cb) {
      // Must be async per the datafeed contract.
      setTimeout(
        () =>
          cb({
            supported_resolutions: TV_SUPPORTED_RESOLUTIONS,
            supports_marks: true,
            supports_timescale_marks: true,
            supports_time: true,
          }),
        0,
      );
    },

    searchSymbols(_userInput, _exchange, _symbolType, onResult) {
      // Single-token charts: nothing to search.
      onResult([]);
    },

    resolveSymbol(symbolName, onResolve, onError) {
      const { mint: parsedMint, marketCap } = parseTicker(symbolName || mint);
      const useMint = parsedMint || mint;
      if (!useMint) {
        onError("unknown symbol");
        return;
      }
      const scale = priceScaleFor(opts.sampleValue ?? 0);
      const info: TvSymbolInfo = {
        name: opts.displaySymbol,
        ticker: encodeTicker(useMint, marketCap),
        description: marketCap
          ? `${opts.displaySymbol}: Market Cap`
          : opts.displaySymbol,
        type: "crypto",
        session: "24x7",
        timezone: "Etc/UTC",
        exchange: "BlackPebble",
        listed_exchange: "Solana",
        format: "price",
        minmov: 1,
        pricescale: scale,
        has_intraday: true,
        has_seconds: false,
        has_daily: true,
        visible_plots_set: "ohlcv",
        supported_resolutions: TV_SUPPORTED_RESOLUTIONS,
        volume_precision: 2,
        data_status: "streaming",
        bpMint: useMint,
        bpMarketCap: marketCap,
      };
      setTimeout(() => onResolve(info), 0);
    },

    async getBars(symbolInfo, resolution, periodParams, onResult, onError) {
      const candleRes = tvResolutionToCandle(resolution);
      if (!candleRes) {
        onError(`unsupported resolution: ${resolution}`);
        return;
      }
      try {
        const resp = await api.candlesRange(symbolInfo.bpMint, candleRes, {
          before: periodParams.to,
          countBack: periodParams.countBack,
          marketCap: symbolInfo.bpMarketCap,
        });
        if (!resp || resp.noData || resp.candles.length === 0) {
          onResult([], { noData: true });
          return;
        }
        const bars = candlesToBars(resp.candles, periodParams.from, periodParams.to);
        onResult(bars, { noData: bars.length === 0 });
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      }
    },

    subscribeBars(symbolInfo, resolution, onTick, listenerGuid) {
      const candleRes = tvResolutionToCandle(resolution);
      if (!candleRes) return;
      const pollMs = Math.max(4000, Math.min(RESOLUTION_MS[candleRes] / 2, 30_000));
      const tick = async () => {
        try {
          const resp = await api.candlesRange(symbolInfo.bpMint, candleRes, {
            countBack: 2,
            marketCap: symbolInfo.bpMarketCap,
          });
          const last = resp?.candles?.[resp.candles.length - 1];
          if (last) onTick(candleToBar(last));
        } catch {
          // Transient upstream errors are non-fatal for a live feed.
        }
      };
      void tick();
      subscriptions.set(listenerGuid, setInterval(tick, pollMs));
    },

    unsubscribeBars(listenerGuid) {
      const handle = subscriptions.get(listenerGuid);
      if (handle) {
        clearInterval(handle);
        subscriptions.delete(listenerGuid);
      }
    },
  };
}

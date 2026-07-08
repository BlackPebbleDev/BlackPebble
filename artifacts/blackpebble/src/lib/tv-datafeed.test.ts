import { describe, it, expect } from "vitest";
import {
  tvResolutionToCandle,
  encodeTicker,
  parseTicker,
  candleToBar,
  candlesToBars,
  priceScaleFor,
} from "./tv-datafeed";
import type { Candle } from "./api";

const c = (t: number, close: number): Candle => ({
  t,
  o: close,
  h: close,
  l: close,
  c: close,
  v: 1,
});

describe("tvResolutionToCandle", () => {
  it("maps TradingView resolutions to backend resolutions", () => {
    expect(tvResolutionToCandle("1")).toBe("1m");
    expect(tvResolutionToCandle("5")).toBe("5m");
    expect(tvResolutionToCandle("15")).toBe("15m");
    expect(tvResolutionToCandle("60")).toBe("1h");
    expect(tvResolutionToCandle("240")).toBe("4h");
    expect(tvResolutionToCandle("1D")).toBe("1d");
    expect(tvResolutionToCandle("D")).toBe("1d");
  });

  it("rejects unsupported (sub-minute) resolutions", () => {
    expect(tvResolutionToCandle("1S")).toBeNull();
    expect(tvResolutionToCandle("15S")).toBeNull();
    expect(tvResolutionToCandle("3")).toBeNull();
  });
});

describe("ticker encode/parse round-trip", () => {
  it("encodes price mode as the bare mint", () => {
    expect(encodeTicker("MINT123", false)).toBe("MINT123");
    expect(parseTicker("MINT123")).toEqual({ mint: "MINT123", marketCap: false });
  });

  it("encodes market-cap mode with a ~mc suffix", () => {
    expect(encodeTicker("MINT123", true)).toBe("MINT123~mc");
    expect(parseTicker("MINT123~mc")).toEqual({ mint: "MINT123", marketCap: true });
  });
});

describe("candleToBar", () => {
  it("converts unix seconds to ms and preserves OHLCV", () => {
    const bar = candleToBar({ t: 100, o: 1, h: 2, l: 0.5, c: 1.5, v: 9 });
    expect(bar).toEqual({
      time: 100_000,
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 9,
    });
  });
});

describe("candlesToBars", () => {
  it("filters to [from, to), sorts oldest-first, converts to ms", () => {
    const candles = [c(300, 3), c(100, 1), c(200, 2), c(50, 0.5), c(400, 4)];
    const bars = candlesToBars(candles, 100, 400);
    expect(bars.map((b) => b.time)).toEqual([100_000, 200_000, 300_000]);
  });

  it("returns empty when nothing falls in range", () => {
    expect(candlesToBars([c(10, 1), c(20, 2)], 100, 200)).toEqual([]);
  });
});

describe("priceScaleFor", () => {
  it("uses coarse scale for large values and fine scale for tiny ones", () => {
    expect(priceScaleFor(5000)).toBe(100);
    expect(priceScaleFor(5)).toBe(10_000);
    expect(priceScaleFor(0.01)).toBe(1_000_000);
    expect(priceScaleFor(0.00000001)).toBe(100_000_000);
  });

  it("falls back to the finest scale for invalid input", () => {
    expect(priceScaleFor(0)).toBe(100_000_000);
    expect(priceScaleFor(NaN)).toBe(100_000_000);
  });
});

import { describe, it, expect } from "vitest";
import { autoResolution, snapToCandle } from "./chart-candles";

const NOW = 1_800_000_000_000; // fixed "now" in ms
const min = (n: number) => n * 60_000;

describe("autoResolution", () => {
  it("defaults to 15m when age is unknown", () => {
    expect(autoResolution(null, NOW)).toBe("15m");
    expect(autoResolution(undefined, NOW)).toBe("15m");
  });

  it("defaults to 15m for a nonsensical future creation time", () => {
    expect(autoResolution(NOW + min(5), NOW)).toBe("15m");
  });

  it("uses 1m for tokens under 6 hours old (never broken sub-minute)", () => {
    expect(autoResolution(NOW - min(5), NOW)).toBe("1m");
    expect(autoResolution(NOW - min(30), NOW)).toBe("1m");
    expect(autoResolution(NOW - min(120), NOW)).toBe("1m");
    expect(autoResolution(NOW - min(359), NOW)).toBe("1m");
  });

  it("uses 5m from 6 to 24 hours", () => {
    expect(autoResolution(NOW - min(360), NOW)).toBe("5m");
    expect(autoResolution(NOW - min(1439), NOW)).toBe("5m");
  });

  it("never auto-selects above 15m for older tokens", () => {
    expect(autoResolution(NOW - min(1440), NOW)).toBe("15m");
    expect(autoResolution(NOW - min(60 * 24 * 30), NOW)).toBe("15m");
  });
});

describe("snapToCandle", () => {
  const times = [100, 200, 300, 500]; // 400 intentionally missing (quiet bucket)

  it("returns the exact candle when the trade lands on an open time", () => {
    expect(snapToCandle(times, 200)).toBe(200);
  });

  it("snaps to the candle at-or-before the trade", () => {
    expect(snapToCandle(times, 250)).toBe(200);
    expect(snapToCandle(times, 499)).toBe(300);
  });

  it("bridges missing buckets to the previous real candle", () => {
    expect(snapToCandle(times, 450)).toBe(300);
  });

  it("clamps trades after the last candle to the last candle", () => {
    expect(snapToCandle(times, 9_999)).toBe(500);
  });

  it("returns null for trades before the visible history", () => {
    expect(snapToCandle(times, 50)).toBeNull();
    expect(snapToCandle([], 50)).toBeNull();
  });
});

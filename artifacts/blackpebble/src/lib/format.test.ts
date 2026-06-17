import { describe, it, expect } from "vitest";
import {
  fmtPercent,
  fmtPercentSafe,
  isPercentSane,
  pnlColorSafe,
  PERCENT_SANITY_CEILING,
} from "./format";

describe("fmtPercentSafe — external 24h market change guard", () => {
  it("renders normal percentages like fmtPercent", () => {
    expect(fmtPercentSafe(2.55)).toBe("+2.55%");
    expect(fmtPercentSafe(-1.31)).toBe("-1.31%");
    expect(fmtPercentSafe(0)).toBe("0.00%");
  });

  it("renders large-but-plausible values normally (e.g. a real new-token pump)", () => {
    expect(fmtPercentSafe(273)).toBe("+273.00%");
    expect(fmtPercentSafe(99_999)).toBe("+99999.00%");
    // Exactly at the ceiling is still considered valid.
    expect(fmtPercentSafe(PERCENT_SANITY_CEILING)).toBe("+100000.00%");
  });

  it('flags impossible values (the USELESS/FARTCOIN bug) as "Data Error"', () => {
    expect(fmtPercentSafe(520_651)).toBe("Data Error");
    expect(fmtPercentSafe(520_063)).toBe("Data Error");
    expect(fmtPercentSafe(-200_000)).toBe("Data Error");
  });

  it('shows "—" when data is missing or non-finite', () => {
    expect(fmtPercentSafe(null)).toBe("—");
    expect(fmtPercentSafe(undefined)).toBe("—");
    expect(fmtPercentSafe(NaN)).toBe("—");
    expect(fmtPercentSafe(Infinity)).toBe("—");
  });
});

describe("isPercentSane", () => {
  it("accepts finite values within the ceiling", () => {
    expect(isPercentSane(0)).toBe(true);
    expect(isPercentSane(-99_999)).toBe(true);
    expect(isPercentSane(PERCENT_SANITY_CEILING)).toBe(true);
  });

  it("rejects out-of-range, null and non-finite values", () => {
    expect(isPercentSane(520_651)).toBe(false);
    expect(isPercentSane(null)).toBe(false);
    expect(isPercentSane(undefined)).toBe(false);
    expect(isPercentSane(NaN)).toBe(false);
  });
});

describe("pnlColorSafe — neutral colour for invalid/out-of-range values", () => {
  it("colours sane values like pnlColor", () => {
    expect(pnlColorSafe(2.55)).toBe("text-emerald-400");
    expect(pnlColorSafe(-1.31)).toBe("text-red-400");
    expect(pnlColorSafe(0)).toBe("text-muted-foreground");
  });

  it("renders impossible / missing values as neutral, never green/red", () => {
    expect(pnlColorSafe(520_651)).toBe("text-muted-foreground");
    expect(pnlColorSafe(null)).toBe("text-muted-foreground");
    expect(pnlColorSafe(NaN)).toBe("text-muted-foreground");
  });
});

describe("fmtPercent (unchanged baseline P&L formatter)", () => {
  it("still displays very large legitimate P&L without a ceiling", () => {
    // Position/portfolio P&L is intentionally NOT clamped — a paper memecoin
    // can legitimately exceed 1000x (100,000%).
    expect(fmtPercent(250_000)).toBe("+250000.00%");
  });
});

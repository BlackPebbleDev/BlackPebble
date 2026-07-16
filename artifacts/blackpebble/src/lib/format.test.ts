import { describe, it, expect } from "vitest";
import {
  fmtPercent,
  fmtPercentSafe,
  isPercentSane,
  pnlColorSafe,
  PERCENT_SANITY_CEILING,
  fmtSolMag,
  fmtSignedSolMag,
  fmtUsdSmart,
  solMagnitudeBody,
} from "./format";

describe("fmtPercentSafe - external 24h market change guard", () => {
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

describe("pnlColorSafe - neutral colour for invalid/out-of-range values", () => {
  it("colours sane values like pnlColor", () => {
    expect(pnlColorSafe(2.55)).toBe("text-success");
    expect(pnlColorSafe(-1.31)).toBe("text-danger");
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
    // Position/portfolio P&L is intentionally NOT clamped - a paper memecoin
    // can legitimately exceed 1000x (100,000%).
    expect(fmtPercent(250_000)).toBe("+250000.00%");
  });
});

// ── Phase 2: mobile financial formatting (magnitude-aware, no ellipsis) ──────

describe("solMagnitudeBody - magnitude-scaled precision", () => {
  it("compacts thousands with a K suffix", () => {
    expect(solMagnitudeBody(1240)).toBe("1.24K");
    expect(solMagnitudeBody(12_300)).toBe("12.3K");
    expect(solMagnitudeBody(124_000)).toBe("124K");
  });
  it("uses fewer decimals as magnitude grows", () => {
    expect(solMagnitudeBody(123.4)).toBe("123.4");
    expect(solMagnitudeBody(39.73)).toBe("39.73");
    expect(solMagnitudeBody(1.234)).toBe("1.234");
  });
  it("keeps meaningful precision below 1 without trailing-zero noise", () => {
    expect(solMagnitudeBody(0.0249)).toBe("0.0249");
    expect(solMagnitudeBody(0.0017)).toBe("0.0017");
    expect(solMagnitudeBody(0)).toBe("0");
  });
});

describe("fmtSolMag / fmtSignedSolMag", () => {
  it("never emits a partial/ellipsized number for a large negative P&L", () => {
    // The production -39.73... clip must render as a complete value.
    expect(fmtSignedSolMag(-39.73)).toBe("-39.73");
    expect(fmtSignedSolMag(-39.7312)).toBe("-39.73");
  });
  it("signs positive values and shows a bare 0 for zero", () => {
    expect(fmtSignedSolMag(1.234)).toBe("+1.234");
    expect(fmtSignedSolMag(0)).toBe("0");
  });
  it("handles null / non-finite as an em-dash placeholder", () => {
    expect(fmtSolMag(null)).toBe("—");
    expect(fmtSolMag(undefined)).toBe("—");
    expect(fmtSignedSolMag(NaN)).toBe("—");
  });
  it("compacts large positive values", () => {
    expect(fmtSignedSolMag(1240)).toBe("+1.24K");
  });
});

describe("fmtUsdSmart", () => {
  it("compacts large USD and keeps cents for small USD", () => {
    expect(fmtUsdSmart(3000)).toBe("$3.0K");
    expect(fmtUsdSmart(773.17)).toBe("$773.17");
    expect(fmtUsdSmart(2.03)).toBe("$2.03");
  });
  it("shows <$0.01 for a tiny nonzero balance rather than $0.00", () => {
    expect(fmtUsdSmart(0.004)).toBe("<$0.01");
    expect(fmtUsdSmart(0)).toBe("$0.00");
  });
  it("signs negatives and handles null", () => {
    expect(fmtUsdSmart(-2.03)).toBe("-$2.03");
    expect(fmtUsdSmart(null)).toBe("—");
  });
});

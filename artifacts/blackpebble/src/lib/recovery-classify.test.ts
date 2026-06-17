import { describe, it, expect } from "vitest";
import { formatUsd } from "./recovery-classify";

describe("formatUsd — fraction-digit range safety", () => {
  it("renders values >= 1000 without throwing a RangeError", () => {
    // Regression: minimumFractionDigits(2) once exceeded maximumFractionDigits(0)
    // for values >= 1000, which Intl/toLocaleString rejects with
    // "RangeError: maximumFractionDigits value is out of range." A single token
    // with marketCapUsd >= 1000 crashed the whole Wallet Cleaner subtree.
    expect(() => formatUsd(2073.23)).not.toThrow();
    expect(formatUsd(2073.23)).toBe("$2,073");
    expect(formatUsd(1000)).toBe("$1,000");
    expect(formatUsd(1_234_567)).toBe("$1,234,567");
  });

  it("keeps two decimals for sub-$1000 values", () => {
    expect(formatUsd(4.33)).toBe("$4.33");
    expect(formatUsd(999.99)).toBe("$999.99");
  });

  it("handles honest edge values", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
    expect(formatUsd(Number.NaN)).toBe("—");
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.005)).toBe("<$0.01");
    expect(() => formatUsd(-12.34)).not.toThrow();
  });
});

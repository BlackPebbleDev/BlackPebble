import { describe, it, expect } from "vitest";
import {
  worstStatus,
  freshnessStatus,
  latencyStatus,
  boolStatus,
  toCsv,
} from "./admin-ops";

describe("admin-ops status helpers", () => {
  it("rolls up to the most severe status", () => {
    expect(worstStatus(["healthy", "warning", "healthy"])).toBe("warning");
    expect(worstStatus(["healthy", "unknown"])).toBe("unknown");
    expect(worstStatus(["warning", "critical"])).toBe("critical");
    expect(worstStatus(["healthy", "healthy"])).toBe("healthy");
  });

  it("derives freshness from age (seconds or ms), unknown when absent", () => {
    const now = 1_700_000_000_000; // realistic fixed nowMs (~Nov 2023)
    expect(freshnessStatus(null, 60, 300, now)).toBe("unknown");
    expect(freshnessStatus(0, 60, 300, now)).toBe("unknown");
    // 10s ago (seconds input) → healthy
    expect(freshnessStatus(now / 1000 - 10, 60, 300, now)).toBe("healthy");
    // 120s ago → warning
    expect(freshnessStatus(now / 1000 - 120, 60, 300, now)).toBe("warning");
    // 600s ago → critical
    expect(freshnessStatus(now / 1000 - 600, 60, 300, now)).toBe("critical");
    // ms input, 120s ago → warning
    expect(freshnessStatus(now - 120_000, 60, 300, now)).toBe("warning");
  });

  it("maps latency + booleans to status", () => {
    expect(latencyStatus(null)).toBe("unknown");
    expect(latencyStatus(50)).toBe("healthy");
    expect(latencyStatus(300)).toBe("warning");
    expect(latencyStatus(2000)).toBe("critical");
    expect(boolStatus(undefined)).toBe("unknown");
    expect(boolStatus(true)).toBe("healthy");
    expect(boolStatus(false)).toBe("critical");
    expect(boolStatus(false, "warning")).toBe("warning");
  });
});

describe("toCsv", () => {
  it("returns empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("unions columns and escapes special characters (RFC 4180)", () => {
    const csv = toCsv([
      { a: 1, b: "x,y" },
      { a: 2, c: 'has "quote"' },
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("a,b,c");
    expect(lines[1]).toBe('1,"x,y",');
    expect(lines[2]).toBe('2,,"has ""quote"""');
  });

  it("serializes objects as JSON in a cell", () => {
    const csv = toCsv([{ a: { nested: true } }]);
    expect(csv).toBe('a\n"{""nested"":true}"');
  });
});

import { describe, it, expect } from "vitest";
import { ratePct } from "./admin-metrics.js";

describe("ratePct", () => {
  it("computes a one-decimal percentage", () => {
    expect(ratePct(1, 4)).toBe(25);
    expect(ratePct(1, 3)).toBe(33.3);
    expect(ratePct(2, 3)).toBe(66.7);
    expect(ratePct(5, 5)).toBe(100);
  });

  it("returns 0 for a non-positive or invalid whole", () => {
    expect(ratePct(3, 0)).toBe(0);
    expect(ratePct(3, -1)).toBe(0);
    expect(ratePct(Number.NaN, 5)).toBe(0);
    expect(ratePct(3, Number.NaN)).toBe(0);
  });
});

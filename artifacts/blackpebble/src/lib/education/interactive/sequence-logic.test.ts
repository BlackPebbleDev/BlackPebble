import { describe, it, expect } from "vitest";
import { gradeSequence, shuffleSteps } from "./sequence-logic";

describe("sequence-logic", () => {
  it("grades a perfect order", () => {
    const r = gradeSequence(["a", "b", "c"], ["a", "b", "c"]);
    expect(r).toEqual({ correct: 3, total: 3, perfect: true });
  });

  it("grades a partial order", () => {
    const r = gradeSequence(["a", "b", "c"], ["a", "c", "b"]);
    expect(r.correct).toBe(1);
    expect(r.perfect).toBe(false);
  });

  it("handles incomplete answers", () => {
    const r = gradeSequence(["a", "b", "c"], ["a"]);
    expect(r.correct).toBe(1);
    expect(r.total).toBe(3);
  });

  it("shuffles deterministically and preserves membership", () => {
    const items = ["a", "b", "c", "d", "e"];
    const a = shuffleSteps(items, 7);
    const b = shuffleSteps(items, 7);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([...items].sort());
  });
});

import { describe, it, expect } from "vitest";
import {
  resolveInsightContradictions,
  currentConcentrationNote,
} from "./real-trading-contradictions.js";
import type { BehaviorInsight } from "./real-trading-behavior.js";

function insight(
  key: string,
  over: Partial<BehaviorInsight> = {},
): BehaviorInsight {
  return {
    key,
    category: "pattern",
    title: key,
    description: "",
    severity: "info",
    confidence: 0.7,
    sampleSize: 20,
    evidenceCount: 10,
    ...over,
  };
}

describe("resolveInsightContradictions", () => {
  it("keeps the stronger side of a mutually exclusive pair (diamond hands vs early seller)", () => {
    const out = resolveInsightContradictions([
      insight("early_seller", { confidence: 0.75, evidenceCount: 12 }),
      insight("diamond_hands", { confidence: 0.5, evidenceCount: 3 }),
    ]);
    const keys = out.map((i) => i.key);
    expect(keys).toContain("early_seller");
    expect(keys).not.toContain("diamond_hands");
  });

  it("drops BOTH extremes when evidence is tied (neutral rather than contradictory)", () => {
    const out = resolveInsightContradictions([
      insight("scalper", { confidence: 0.7, evidenceCount: 10 }),
      insight("swing_trader", { confidence: 0.7, evidenceCount: 10 }),
    ]);
    expect(out).toHaveLength(0);
  });

  it("resolves disciplined vs impulsive to the stronger evidence", () => {
    const out = resolveInsightContradictions([
      insight("panic_seller", { confidence: 0.8, evidenceCount: 8 }),
      insight("disciplined_risk", { confidence: 0.6, evidenceCount: 2 }),
    ]);
    expect(out.map((i) => i.key)).toEqual(["panic_seller"]);
  });

  it("leaves non-conflicting insights untouched and preserves order", () => {
    const out = resolveInsightContradictions([
      insight("good_sizing"),
      insight("averages_down"),
      insight("high_conviction"),
    ]);
    expect(out.map((i) => i.key)).toEqual([
      "good_sizing",
      "averages_down",
      "high_conviction",
    ]);
  });

  it("handles a single side of a group with no conflict", () => {
    const out = resolveInsightContradictions([insight("scalper")]);
    expect(out.map((i) => i.key)).toEqual(["scalper"]);
  });
});

describe("currentConcentrationNote", () => {
  it("says concentrated (never diversified) at 100% current concentration", () => {
    const note = currentConcentrationNote(100, 1);
    expect(note).toMatch(/concentration/i);
    expect(note).not.toMatch(/diversif|spread/i);
  });

  it("says spread only when concentration is low and multiple positions exist", () => {
    expect(currentConcentrationNote(20, 4)).toMatch(/spread/i);
  });

  it("returns null (no claim) with a single low-concentration position", () => {
    expect(currentConcentrationNote(20, 1)).toBeNull();
  });

  it("returns null with no open positions (nothing current to describe)", () => {
    expect(currentConcentrationNote(100, 0)).toBeNull();
  });

  it("never emits both a concentrated and a spread note for one state", () => {
    for (let risk = 0; risk <= 100; risk += 5) {
      for (const count of [0, 1, 2, 5]) {
        const note = currentConcentrationNote(risk, count);
        if (note == null) continue;
        const concentrated = /increases current portfolio risk/i.test(note);
        const spread = /spread across multiple/i.test(note);
        expect(concentrated && spread).toBe(false);
      }
    }
  });
});

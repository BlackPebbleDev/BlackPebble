import { describe, it, expect } from "vitest";
import {
  selectPreviewSignals,
  isHigherBetter,
  DESCRIPTIVE_SIGNALS,
} from "./real-analysis-preview";
import type { RealTradingSignal } from "@/lib/api";

function sig(
  key: string,
  value: number,
  over: Partial<RealTradingSignal> = {},
): RealTradingSignal {
  return {
    key,
    value,
    confidence: 0.8,
    sampleSize: 20,
    tier: "high",
    evidence: [],
    previousValue: null,
    delta30d: null,
    ...over,
  };
}

describe("isHigherBetter / DESCRIPTIVE_SIGNALS", () => {
  it("marks style signals as descriptive (not graded)", () => {
    for (const k of ["risk", "patience", "conviction", "activity"]) {
      expect(DESCRIPTIVE_SIGNALS.has(k)).toBe(true);
      expect(isHigherBetter(k)).toBe(false);
    }
  });
  it("marks performance signals as higher-is-better", () => {
    for (const k of ["consistency", "discipline", "profitability"]) {
      expect(isHigherBetter(k)).toBe(true);
    }
  });
});

describe("selectPreviewSignals - intentional strongest/weakness/change mix", () => {
  it("picks strongest trait, key weakness and a change - not the three highest", () => {
    const signals = [
      sig("consistency", 90), // strongest graded
      sig("discipline", 85),
      sig("timing", 80),
      sig("profitability", 20), // weakest graded
      sig("risk", 75, {
        comparison: {
          status: "comparable",
          previousValue: 40,
          comparisonStart: 1,
          comparisonEnd: 2,
          delta: 35,
          previousSampleSize: 20,
        },
        delta30d: 35,
      }),
    ];
    const picked = selectPreviewSignals(signals).map((s) => s.key);
    expect(picked[0]).toBe("consistency"); // strongest
    expect(picked).toContain("profitability"); // key weakness
    expect(picked).toContain("risk"); // biggest trustworthy change
    // Not simply the three highest (would be consistency/discipline/timing).
    expect(picked).not.toEqual(["consistency", "discipline", "timing"]);
  });

  it("excludes insufficient-data signals from the preview", () => {
    const signals = [
      sig("consistency", 90),
      sig("discipline", 10, { tier: "insufficient" }),
      sig("timing", 70),
    ];
    const picked = selectPreviewSignals(signals).map((s) => s.key);
    expect(picked).not.toContain("discipline");
  });

  it("returns objects with scores identical to the source (matches full page)", () => {
    const signals = [sig("consistency", 63), sig("timing", 41)];
    const picked = selectPreviewSignals(signals);
    const src = new Map(signals.map((s) => [s.key, s.value]));
    for (const p of picked) expect(p.value).toBe(src.get(p.key));
  });

  it("never returns more than three signals", () => {
    const signals = Array.from({ length: 12 }, (_, i) =>
      sig(`k${i}`, 50 + i),
    );
    expect(selectPreviewSignals(signals).length).toBeLessThanOrEqual(3);
  });
});

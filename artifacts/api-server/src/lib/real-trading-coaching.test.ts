import { describe, it, expect } from "vitest";
import { buildCoachingContext, type CoachingInput } from "./real-trading-coaching.js";
import { classifySignal, type SignalWithDelta } from "./real-trading-signals.js";
import { computeHistoricalRisk } from "./real-trading-risk.js";
import type { BehaviorInsight } from "./real-trading-behavior.js";

function sig(
  key: string,
  value: number,
  over: Partial<SignalWithDelta> = {},
): SignalWithDelta {
  const direction =
    key === "risk" || key === "patience" || key === "conviction" || key === "diversification" || key === "activity"
      ? "descriptive"
      : "higher_better";
  const tier = over.tier ?? "high";
  return {
    key: key as SignalWithDelta["key"],
    value,
    confidence: 0.9,
    sampleSize: 30,
    tier,
    evidence: [],
    previousValue: null,
    delta30d: over.delta30d ?? null,
    direction,
    basis: "completed_round_trips",
    comparison: over.comparison ?? {
      status: "new",
      previousValue: null,
      comparisonStart: null,
      comparisonEnd: 0,
      delta: null,
      previousSampleSize: null,
    },
    detail: {
      classification: classifySignal(value, tier, direction),
      measures: "",
      expectedImpact: "",
      improvement: ["Do the thing"],
      limitations: [],
    },
    ...over,
  };
}

const emptyRisk = computeHistoricalRisk([], []);

describe("classifySignal", () => {
  it("grades higher_better signals by band", () => {
    expect(classifySignal(85, "high", "higher_better")).toBe("elite");
    expect(classifySignal(65, "high", "higher_better")).toBe("strong");
    expect(classifySignal(45, "high", "higher_better")).toBe("developing");
    expect(classifySignal(20, "high", "higher_better")).toBe("weak");
  });
  it("never grades descriptive signals", () => {
    expect(classifySignal(90, "high", "descriptive")).toBe("descriptive");
  });
  it("returns insufficient regardless of value when the tier is insufficient", () => {
    expect(classifySignal(90, "insufficient", "higher_better")).toBe("insufficient");
  });
});

describe("buildCoachingContext", () => {
  it("returns a single onboarding insight when confidence is insufficient", () => {
    const input: CoachingInput = {
      signals: [],
      insights: [],
      historicalRisk: emptyRisk,
      reportConfidence: "insufficient",
    };
    const ctx = buildCoachingContext(input);
    expect(ctx.insights).toHaveLength(1);
    expect(ctx.insights[0]!.key).toBe("need_more_data");
  });

  it("derives strengths, development areas and focus insights", () => {
    const input: CoachingInput = {
      signals: [
        sig("profitability", 30),
        sig("discipline", 25),
        sig("consistency", 82),
        sig("risk", 90), // descriptive - never a strength/weakness
      ],
      insights: [],
      historicalRisk: emptyRisk,
      reportConfidence: "high",
    };
    const ctx = buildCoachingContext(input);
    expect(ctx.developmentAreas.map((d) => d.key)).toContain("discipline");
    expect(ctx.strengths.map((s) => s.key)).toContain("consistency");
    expect(ctx.strengths.map((s) => s.key)).not.toContain("risk");
    // A high-priority focus insight for the weakest area.
    expect(ctx.insights.some((i) => i.key.startsWith("improve_"))).toBe(true);
    expect(ctx.insights.some((i) => i.priority === "high")).toBe(true);
  });

  it("surfaces the strongest area-to-watch behavior", () => {
    const behaviors: BehaviorInsight[] = [
      {
        key: "revenge_trading",
        category: "weakness",
        title: "Larger buys after losses",
        description: "d",
        severity: "warning",
        confidence: 0.7,
        sampleSize: 5,
        evidenceCount: 4,
        classification: "area_to_watch",
        guidance: "Cool down after a loss.",
      },
    ];
    const ctx = buildCoachingContext({
      signals: [sig("consistency", 70)],
      insights: behaviors,
      historicalRisk: emptyRisk,
      reportConfidence: "high",
    });
    expect(ctx.insights.some((i) => i.key === "behavior_revenge_trading")).toBe(true);
    expect(ctx.highConfidenceBehaviors.some((b) => b.key === "revenge_trading")).toBe(true);
  });

  it("tracks meaningful comparable changes only", () => {
    const ctx = buildCoachingContext({
      signals: [
        sig("profitability", 60, {
          delta30d: 12,
          comparison: {
            status: "comparable",
            previousValue: 48,
            comparisonStart: 1,
            comparisonEnd: 2,
            delta: 12,
            previousSampleSize: 10,
          },
        }),
        sig("timing", 50, {
          delta30d: 2,
          comparison: {
            status: "comparable",
            previousValue: 48,
            comparisonStart: 1,
            comparisonEnd: 2,
            delta: 2,
            previousSampleSize: 10,
          },
        }),
      ],
      insights: [],
      historicalRisk: emptyRisk,
      reportConfidence: "high",
    });
    expect(ctx.meaningfulChanges.map((c) => c.key)).toEqual(["profitability"]);
  });
});

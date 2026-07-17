import { describe, it, expect } from "vitest";
import {
  classifyTrend,
  directionalityOf,
  shouldWriteHistory,
  type MetricHistoryPoint,
} from "./real-trading-trends.js";

describe("directionalityOf", () => {
  it("defaults unknown metrics to descriptive", () => {
    expect(directionalityOf("something.unlisted")).toBe("descriptive");
    expect(directionalityOf("signal.timing")).toBe("higher_better");
    expect(directionalityOf("risk.max_drawdown_pct")).toBe("lower_better");
  });
});

describe("classifyTrend", () => {
  it("marks new when there is no previous value", () => {
    const r = classifyTrend(70, null, { metricKey: "signal.timing" });
    expect(r.direction).toBe("new");
  });

  it("marks insufficient_history below min sample", () => {
    const r = classifyTrend(70, 60, {
      metricKey: "signal.timing",
      currentSampleSize: 2,
      previousSampleSize: 10,
      minSampleSize: 5,
    });
    expect(r.direction).toBe("insufficient_history");
  });

  it("marks stable within threshold", () => {
    const r = classifyTrend(61, 60, { metricKey: "signal.timing", changeThreshold: 0.05 });
    expect(r.direction).toBe("stable");
  });

  it("improving/positive for higher_better going up", () => {
    const r = classifyTrend(80, 60, { metricKey: "signal.timing" });
    expect(r.direction).toBe("improving");
    expect(r.semantic).toBe("positive");
  });

  it("improving for lower_better going down", () => {
    const r = classifyTrend(20, 60, { metricKey: "risk.max_drawdown_pct" });
    expect(r.direction).toBe("improving");
    expect(r.semantic).toBe("positive");
  });

  it("never colors descriptive metrics", () => {
    const up = classifyTrend(100, 60, { metricKey: "activity.trades_per_week" });
    expect(up.direction).toBe("improving");
    expect(up.semantic).toBe("neutral");
    const down = classifyTrend(20, 60, { metricKey: "activity.unique_tokens" });
    expect(down.semantic).toBe("neutral");
  });

  it("marks not_comparable when current is missing", () => {
    const r = classifyTrend(null, 60, { metricKey: "signal.timing" });
    expect(r.direction).toBe("not_comparable");
  });
});

describe("shouldWriteHistory", () => {
  const latest: MetricHistoryPoint = {
    metricKey: "signal.timing",
    metricScope: "historical",
    valueNumeric: 60,
    sampleSize: 10,
    computedAt: 1000,
  };

  it("writes when nothing exists", () => {
    expect(shouldWriteHistory("signal.timing", null, 60)).toBe(true);
  });

  it("skips insignificant changes", () => {
    expect(shouldWriteHistory("signal.timing", latest, 61)).toBe(false);
  });

  it("writes material changes", () => {
    expect(shouldWriteHistory("signal.timing", latest, 80)).toBe(true);
  });

  it("never writes a null value", () => {
    expect(shouldWriteHistory("signal.timing", latest, null)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { PerfTimer, makeCorrelationId } from "./real-trading-perf.js";

describe("makeCorrelationId", () => {
  it("produces a prefixed id", () => {
    expect(makeCorrelationId("wallet")).toMatch(/^ti_/);
  });
});

describe("PerfTimer", () => {
  it("records stage durations with a controllable clock", async () => {
    let t = 0;
    const timer = new PerfTimer("w", () => t);
    await timer.stage("fetch", async () => {
      t += 100;
    });
    await timer.stage("parse", async () => {
      t += 50;
    });
    t += 10;
    timer.setCounters({ tradesAnalyzed: 5, cacheHit: true });
    const r = timer.report();
    expect(r.stages.fetch).toBe(100);
    expect(r.stages.parse).toBe(50);
    expect(r.totalMs).toBe(160);
    expect(r.counters.tradesAnalyzed).toBe(5);
    expect(r.counters.cacheHit).toBe(true);
    expect(r.correlationId).toMatch(/^ti_/);
  });

  it("times a stage even when it throws", async () => {
    let t = 0;
    const timer = new PerfTimer("w", () => t);
    await expect(
      timer.stage("boom", async () => {
        t += 30;
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    expect(timer.report().stages.boom).toBe(30);
  });
});

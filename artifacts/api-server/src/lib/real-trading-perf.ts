/**
 * Performance instrumentation for the analysis pipeline (Phase 2C, Part 21).
 *
 * A tiny stage timer that records per-stage durations and pipeline counters
 * under a correlation id. Production-safe: it never logs secrets, only stage
 * names, millisecond durations, and numeric counters. Pure/testable core.
 */

export interface PerfCounters {
  tradesAnalyzed?: number;
  candlesProcessed?: number;
  externalCalls?: number;
  providerFailures?: number;
  cacheHit?: boolean;
  enrichmentStatus?: string;
}

export interface PerfReport {
  correlationId: string;
  stages: Record<string, number>;
  totalMs: number;
  counters: PerfCounters;
}

/** FNV-ish short correlation id from wallet + time. Not security-sensitive. */
export function makeCorrelationId(seed: string): string {
  let h = 0x811c9dc5;
  const s = `${seed}:${Date.now()}:${Math.random()}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `ti_${(h >>> 0).toString(36)}`;
}

export class PerfTimer {
  readonly correlationId: string;
  private readonly startedAt: number;
  private readonly stages: Record<string, number> = {};
  private readonly counters: PerfCounters = {};
  private now: () => number;

  constructor(seed: string, now: () => number = () => Date.now()) {
    this.now = now;
    this.correlationId = makeCorrelationId(seed);
    this.startedAt = this.now();
  }

  /** Time an async stage, recording its duration under `name`. */
  async stage<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const t0 = this.now();
    try {
      return await fn();
    } finally {
      this.stages[name] = (this.stages[name] ?? 0) + (this.now() - t0);
    }
  }

  /** Record a stage duration directly (for sync/manually-timed sections). */
  record(name: string, ms: number): void {
    this.stages[name] = (this.stages[name] ?? 0) + Math.max(0, ms);
  }

  setCounters(c: PerfCounters): void {
    Object.assign(this.counters, c);
  }

  report(): PerfReport {
    return {
      correlationId: this.correlationId,
      stages: { ...this.stages },
      totalMs: this.now() - this.startedAt,
      counters: { ...this.counters },
    };
  }
}

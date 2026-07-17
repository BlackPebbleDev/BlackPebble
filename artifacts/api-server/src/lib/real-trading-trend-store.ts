/**
 * Append-only metric/behavior history store (Phase 2C, Part 15 + 16).
 *
 * Writes rows to `real_analysis_metric_history` only when a value has
 * MATERIALLY changed from the most recent stored point (dedup policy in
 * `shouldWriteHistory`), so history never grows on every refresh. Current and
 * historical metrics use separate scopes. Best-effort: never throws into the
 * analysis path.
 */

import { dbGet, dbRun } from "./database.js";
import { logger } from "./logger.js";
import {
  shouldWriteHistory,
  type MetricHistoryPoint,
  type MetricScope,
} from "./real-trading-trends.js";

export interface MetricSample {
  metricKey: string;
  scope: MetricScope;
  value: number | null;
  sampleSize: number;
  confidenceTier?: string | null;
}

/**
 * Record a batch of metric samples for a wallet, writing only materially
 * changed values. Returns the number of rows written.
 */
export async function recordMetricHistory(
  wallet: string,
  userId: number | null,
  samples: MetricSample[],
  computedAt: number,
  reconciliationId: number,
): Promise<number> {
  let written = 0;
  for (const s of samples) {
    if (s.value == null || !Number.isFinite(s.value)) continue;
    try {
      const latest = await dbGet<{
        value_numeric: number | null;
        sample_size: number;
        computed_at: number;
      }>(
        `SELECT value_numeric, sample_size, computed_at
           FROM real_analysis_metric_history
          WHERE wallet = $1 AND metric_key = $2 AND metric_scope = $3
          ORDER BY computed_at DESC LIMIT 1`,
        [wallet, s.metricKey, s.scope],
      );
      const latestPoint: MetricHistoryPoint | null = latest
        ? {
            metricKey: s.metricKey,
            metricScope: s.scope,
            valueNumeric: latest.value_numeric,
            sampleSize: latest.sample_size,
            computedAt: latest.computed_at,
          }
        : null;
      if (!shouldWriteHistory(s.metricKey, latestPoint, s.value)) continue;
      await dbRun(
        `INSERT INTO real_analysis_metric_history
           (wallet, user_id, metric_key, metric_scope, value_numeric,
            sample_size, confidence_tier, reconciliation_id, source_version,
            computed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (wallet, metric_key, metric_scope, computed_at)
         DO NOTHING`,
        [
          wallet,
          userId,
          s.metricKey,
          s.scope,
          s.value,
          s.sampleSize,
          s.confidenceTier ?? null,
          reconciliationId,
          1,
          computedAt,
        ],
      );
      written++;
    } catch (e) {
      logger.warn(
        { err: e, wallet, metric: s.metricKey },
        "Metric history write failed",
      );
    }
  }
  return written;
}

/** Read the most recent history points for a wallet/scope (for trend badges). */
export async function readRecentMetricHistory(
  wallet: string,
  metricKeys: string[],
  scope: MetricScope,
): Promise<Map<string, MetricHistoryPoint[]>> {
  const out = new Map<string, MetricHistoryPoint[]>();
  if (metricKeys.length === 0) return out;
  const { dbAll } = await import("./database.js");
  const results = await dbAll<{
    metric_key: string;
    value_numeric: number | null;
    sample_size: number;
    computed_at: number;
  }>(
    `SELECT metric_key, value_numeric, sample_size, computed_at
       FROM real_analysis_metric_history
      WHERE wallet = $1 AND metric_scope = $2 AND metric_key = ANY($3)
      ORDER BY computed_at DESC
      LIMIT 200`,
    [wallet, scope, metricKeys],
  );
  for (const r of results) {
    const list = out.get(r.metric_key) ?? [];
    list.push({
      metricKey: r.metric_key,
      metricScope: scope,
      valueNumeric: r.value_numeric,
      sampleSize: r.sample_size,
      computedAt: r.computed_at,
    });
    out.set(r.metric_key, list);
  }
  return out;
}

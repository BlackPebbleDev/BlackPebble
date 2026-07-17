/**
 * Durable historical market-candle cache (Phase 2C, Part 3).
 *
 * Reads/writes the additive `real_market_candles` table so entry/exit quality
 * and Trade Replay never refetch the same candles. Concurrency-safe upserts via
 * ON CONFLICT, bounded retention via `pruneStaleCandles`, and honest handling
 * of missing candles (an empty result, never fabricated rows).
 *
 * Pool-selection rule (documented): candles are cached per (chain, mint,
 * interval, source). The pool is resolved upstream by the trusted-quote
 * selection in `getBestPairs` (highest relevant liquidity on a trusted quote
 * asset), which is the SAME pool the token's live price/MC come from - so cached
 * candles never silently switch to an unrelated pool. `pair_address` is stored
 * for provenance when known.
 */

import { dbAll, dbRun } from "../database.js";
import { logger } from "../logger.js";
import type {
  CandleInterval,
  ChainId,
  DataConfidence,
  HistoricalCandle,
} from "./types.js";

/** Retention: candles older than this are eligible for pruning (90 days). */
export const CANDLE_RETENTION_SEC = 90 * 86400;

/** A row cached fresher than this is trusted without refetch (12h). */
export const CANDLE_FRESH_TTL_SEC = 12 * 3600;

interface CandleRow {
  candle_timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume_usd: number | null;
  liquidity_usd: number | null;
  market_cap_usd: number | null;
  fdv_usd: number | null;
  source: string;
  confidence: string | null;
  interval: string;
}

function rowToCandle(r: CandleRow): HistoricalCandle {
  return {
    timestamp: r.candle_timestamp,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volumeUsd: r.volume_usd,
    liquidityUsd: r.liquidity_usd,
    marketCapUsd: r.market_cap_usd,
    fdvUsd: r.fdv_usd,
    source: r.source,
    interval: r.interval as CandleInterval,
    confidence: (r.confidence as DataConfidence) ?? "medium",
  };
}

export interface CandleQuery {
  chain: ChainId;
  mint: string;
  interval: CandleInterval;
  start: number;
  end: number;
}

/** Read cached candles for a window, oldest first. Empty when none cached. */
export async function readCachedCandles(
  q: CandleQuery,
): Promise<HistoricalCandle[]> {
  const rows = await dbAll<CandleRow>(
    `SELECT candle_timestamp, open, high, low, close, volume_usd, liquidity_usd,
            market_cap_usd, fdv_usd, source, confidence, interval
       FROM real_market_candles
      WHERE chain = $1 AND mint = $2 AND interval = $3
        AND candle_timestamp >= $4 AND candle_timestamp <= $5
      ORDER BY candle_timestamp ASC`,
    [q.chain, q.mint, q.interval, Math.floor(q.start), Math.ceil(q.end)],
  );
  return rows.map(rowToCandle);
}

/** True when the cache already holds a fresh candle covering `timestamp`. */
export async function hasFreshCandleNear(
  chain: ChainId,
  mint: string,
  interval: CandleInterval,
  timestamp: number,
  toleranceSec: number,
): Promise<boolean> {
  const nowSec = Math.floor(Date.now() / 1000);
  const rows = await dbAll<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM real_market_candles
      WHERE chain = $1 AND mint = $2 AND interval = $3
        AND candle_timestamp BETWEEN $4 AND $5
        AND fetched_at >= $6`,
    [
      chain,
      mint,
      interval,
      Math.floor(timestamp - toleranceSec),
      Math.ceil(timestamp + toleranceSec),
      nowSec - CANDLE_FRESH_TTL_SEC,
    ],
  );
  return (rows[0]?.n ?? 0) > 0;
}

export interface UpsertCandlesInput {
  chain: ChainId;
  mint: string;
  pairAddress: string | null;
  interval: CandleInterval;
  candles: HistoricalCandle[];
}

/**
 * Concurrency-safe upsert of a batch of candles. Refreshes existing rows in
 * place (no duplicate growth) and stamps `fetched_at`. Batched into chunks to
 * keep parameter counts bounded.
 */
export async function upsertCandles(input: UpsertCandlesInput): Promise<number> {
  const { chain, mint, pairAddress, interval, candles } = input;
  if (candles.length === 0) return 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const CHUNK = 100;
  let written = 0;
  for (let i = 0; i < candles.length; i += CHUNK) {
    const chunk = candles.slice(i, i + CHUNK);
    const values: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const c of chunk) {
      values.push(
        `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`,
      );
      params.push(
        chain,
        mint,
        pairAddress,
        interval,
        Math.floor(c.timestamp),
        c.open,
        c.high,
        c.low,
        c.close,
        c.volumeUsd,
        c.liquidityUsd ?? null,
        c.marketCapUsd ?? null,
        c.source,
        nowSec,
      );
    }
    // Two unique indexes cover pair-known vs pair-null; use the matching
    // conflict target so upserts stay idempotent either way.
    const conflictTarget = pairAddress
      ? "(chain, mint, pair_address, interval, candle_timestamp, source)"
      : "(chain, mint, interval, candle_timestamp, source) WHERE pair_address IS NULL";
    try {
      await dbRun(
        `INSERT INTO real_market_candles
           (chain, mint, pair_address, interval, candle_timestamp,
            open, high, low, close, volume_usd, liquidity_usd, market_cap_usd,
            source, fetched_at)
         VALUES ${values.join(", ")}
         ON CONFLICT ${conflictTarget} DO UPDATE SET
           open = EXCLUDED.open,
           high = EXCLUDED.high,
           low = EXCLUDED.low,
           close = EXCLUDED.close,
           volume_usd = EXCLUDED.volume_usd,
           liquidity_usd = EXCLUDED.liquidity_usd,
           market_cap_usd = EXCLUDED.market_cap_usd,
           fetched_at = EXCLUDED.fetched_at`,
        params,
      );
      written += chunk.length;
    } catch (e) {
      logger.warn({ err: e, mint, interval }, "Market candle upsert failed");
    }
  }
  return written;
}

/** Bounded retention: delete candles older than the retention window. */
export async function pruneStaleCandles(
  retentionSec = CANDLE_RETENTION_SEC,
): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - retentionSec;
  await dbRun(`DELETE FROM real_market_candles WHERE candle_timestamp < $1`, [
    cutoff,
  ]);
}

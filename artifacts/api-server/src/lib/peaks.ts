import { dbAll, dbRun } from "./database.js";
import { getTokenStatsBatch } from "./prices.js";
import { logger } from "./logger.js";

/**
 * Per-token price/market-cap high-water mark ("ATH" for callout performance).
 *
 * IMPORTANT — honest semantics: this is the PEAK OBSERVED SINCE BLACKPEBBLE
 * STARTED TRACKING the token, not a true historical all-time high. We have no
 * historical OHLCV source, so we never fabricate a pre-tracking ATH. The peak
 * only ratchets upward as we observe live prices (on feed/profile/token views
 * and via a periodic cron over tokens that have active calls). Because every
 * observation also records the current value, ATH is always >= current.
 */

let schemaReady: Promise<void> | null = null;

export function ensurePeaksSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = dbRun(
      `CREATE TABLE IF NOT EXISTS token_price_peaks (
         mint TEXT PRIMARY KEY,
         peak_price_usd DOUBLE PRECISION,
         peak_market_cap_usd DOUBLE PRECISION,
         updated_at BIGINT NOT NULL
       )`,
    ).then(() => undefined);
  }
  return schemaReady;
}

export interface PeakObservation {
  mint: string;
  priceUsd: number | null;
  marketCapUsd: number | null;
}

export interface TokenPeak {
  peakPriceUsd: number | null;
  peakMarketCapUsd: number | null;
}

/**
 * Record live observations, keeping the max per mint. The GREATEST upsert means
 * concurrent writers never lower an existing peak. Best-effort: failures are
 * logged, never thrown, so they can't break a feed/profile read.
 */
export async function recordTokenPeaks(
  observations: PeakObservation[],
): Promise<void> {
  const valid = observations.filter(
    (o) =>
      o.mint &&
      ((o.priceUsd != null && Number.isFinite(o.priceUsd) && o.priceUsd > 0) ||
        (o.marketCapUsd != null &&
          Number.isFinite(o.marketCapUsd) &&
          o.marketCapUsd > 0)),
  );
  if (valid.length === 0) return;
  await ensurePeaksSchema();
  const now = Date.now();
  for (const o of valid) {
    try {
      await dbRun(
        `INSERT INTO token_price_peaks (mint, peak_price_usd, peak_market_cap_usd, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (mint) DO UPDATE SET
           peak_price_usd = GREATEST(
             COALESCE(token_price_peaks.peak_price_usd, 0),
             COALESCE(EXCLUDED.peak_price_usd, 0)
           ),
           peak_market_cap_usd = GREATEST(
             COALESCE(token_price_peaks.peak_market_cap_usd, 0),
             COALESCE(EXCLUDED.peak_market_cap_usd, 0)
           ),
           updated_at = EXCLUDED.updated_at`,
        [
          o.mint,
          o.priceUsd != null && o.priceUsd > 0 ? o.priceUsd : null,
          o.marketCapUsd != null && o.marketCapUsd > 0 ? o.marketCapUsd : null,
          now,
        ],
      );
    } catch (e) {
      logger.warn({ err: e, mint: o.mint }, "recordTokenPeaks upsert failed");
    }
  }
}

/** Batch-read peaks for a set of mints. Missing mints simply won't appear. */
export async function getTokenPeaks(
  mints: string[],
): Promise<Map<string, TokenPeak>> {
  const out = new Map<string, TokenPeak>();
  const unique = [...new Set(mints.filter(Boolean))];
  if (unique.length === 0) return out;
  await ensurePeaksSchema();
  try {
    const rows = await dbAll<{
      mint: string;
      peak_price_usd: number | null;
      peak_market_cap_usd: number | null;
    }>(
      `SELECT mint, peak_price_usd, peak_market_cap_usd
         FROM token_price_peaks
        WHERE mint = ANY($1::text[])`,
      [unique],
    );
    for (const r of rows) {
      out.set(r.mint, {
        peakPriceUsd: r.peak_price_usd,
        peakMarketCapUsd: r.peak_market_cap_usd,
      });
    }
  } catch (e) {
    logger.warn({ err: e }, "getTokenPeaks read failed");
  }
  return out;
}

/**
 * Cron tick: refresh peaks for tokens that have at least one recent, visible
 * call. This is what lets ATH keep climbing even when nobody is looking at the
 * token. Bounded to called tokens so it never fans out across all of DexScreener.
 */
export async function refreshActiveCallPeaks(): Promise<void> {
  try {
    await ensurePeaksSchema();
    // Tokens with a visible call in the last 30 days — the set whose reputation
    // we actually display. Older calls rarely change rank and aren't worth the
    // upstream calls every tick.
    const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    const rows = await dbAll<{ token_mint: string }>(
      `SELECT DISTINCT token_mint
         FROM callouts
        WHERE is_hidden_by_admin = FALSE
          AND is_test = FALSE
          AND created_at >= $1`,
      [cutoff],
    );
    const mints = rows.map((r) => r.token_mint).filter(Boolean);
    if (mints.length === 0) return;
    const stats = await getTokenStatsBatch(mints);
    const obs: PeakObservation[] = [];
    for (const [mint, s] of stats) {
      obs.push({
        mint,
        priceUsd: s.priceUsd,
        marketCapUsd: s.marketCapUsd,
      });
    }
    await recordTokenPeaks(obs);
    if (obs.length > 0) {
      logger.info({ count: obs.length }, "Token peaks refreshed");
    }
  } catch (e) {
    logger.error({ err: e }, "refreshActiveCallPeaks failed");
  }
}

/**
 * Compute an ATH multiple from a peak and a call's snapshotted price. Clamped to
 * be >= the live multiple so a freshly observed peak is never below current.
 */
export function athMultipleFrom(
  peak: TokenPeak | undefined,
  callPriceUsd: number | null,
  currentMultiple: number | null,
): number | null {
  if (callPriceUsd == null || callPriceUsd <= 0) return null;
  const peakPrice = peak?.peakPriceUsd ?? null;
  let ath =
    peakPrice != null && peakPrice > 0 ? peakPrice / callPriceUsd : null;
  if (currentMultiple != null && (ath == null || currentMultiple > ath)) {
    ath = currentMultiple;
  }
  return ath;
}

/**
 * Historical Risk Intelligence for Real Trading Analysis (Phase 2B, Part 4).
 *
 * This answers a DIFFERENT question than Current Portfolio Risk. Current risk
 * ("what is exposed right now?") comes from the live reconciled wallet. This
 * module answers "how has this trader historically taken and recovered from
 * risk?" and is reconstructed ENTIRELY from completed FIFO round trips plus buy
 * sizes. It is pure (no I/O) and fully unit-testable.
 *
 * Honesty rules baked in:
 *  - Everything here is HISTORICAL and reconstructed from swap history; it is
 *    not a brokerage-grade account equity curve. `limitations` states this.
 *  - Sample-size gating: below MIN_SAMPLES_FOR_SCORE closed trades the profile
 *    tier is "insufficient" and the caller must present it as such.
 *  - Percentage drawdown off a realized-P&L curve that can cross zero is
 *    ill-defined; it is only reported relative to a positive running peak and is
 *    null otherwise (never a fabricated number).
 */

import {
  classifyOutcome,
  median,
  stdDev,
  type ClosedRoundTrip,
  type ParsedSwapEvent,
} from "./real-trading-math.js";
import {
  confidenceTier,
  MIN_SAMPLES_FOR_SCORE,
  type ConfidenceTier,
} from "./real-trading-confidence.js";

/** A single peak-to-trough-to-recovery episode on the realized-equity curve. */
export interface DrawdownEpisode {
  /** Depth of the drawdown in SOL (peak equity - trough equity). */
  depthSol: number;
  /** Seconds from the peak to recovery, or to the last trade if unrecovered. */
  durationSec: number;
  /** Closed trades taken from the peak until recovery (or until last trade). */
  tradesToRecover: number;
  /** True when equity climbed back above the prior peak. */
  recovered: boolean;
}

export type RiskProfileTier =
  | "controlled"
  | "moderate"
  | "aggressive"
  | "highly_volatile"
  | "insufficient";

/** Transparent, explainable subcomponents behind the risk profile tier. */
export interface RiskProfileBreakdown {
  /** Result dispersion: stdDev of per-trade P&L / mean absolute trade P&L. */
  resultDispersion: number;
  /** Max drawdown as a multiple of the average winning trade (0 when no wins). */
  drawdownSeverity: number;
  /** Share (0-1) of total losses concentrated in the worst three trades. */
  tailLossConcentration: number;
}

export interface HistoricalRisk {
  sampleSize: number;
  confidence: number;
  confidenceTier: ConfidenceTier;

  // Drawdowns (realized-equity curve, in SOL).
  maxDrawdownSol: number;
  /** Only defined relative to a positive running peak; null otherwise. */
  maxDrawdownPercent: number | null;
  avgDrawdownSol: number;
  /** Distance below the all-time peak right now (0 when at a new high). */
  currentDrawdownSol: number;
  longestDrawdownSec: number;
  medianRecoverySec: number | null;
  medianTradesToRecover: number | null;
  drawdownCount: number;

  // Streaks.
  maxConsecutiveLosses: number;
  maxConsecutiveWins: number;
  /** Current run: positive = winning streak, negative = losing streak. */
  currentStreak: number;

  // Return quality.
  /** Sum of gains / sum of |losses|; null when there are no losses yet. */
  profitFactor: number | null;
  /** Mean realized P&L per completed round trip (SOL). */
  expectancySol: number;
  /** avgWin / avgLoss; null when either side is empty. */
  payoffRatio: number | null;

  // Volatility.
  resultVolatilitySol: number;
  downsideVolatilitySol: number;
  /** Coefficient of variation of buy sizes (0 when < 2 meaningful buys). */
  positionSizeVolatility: number;

  // Tail concentration (0-1).
  tailLossConcentration: number;
  tailGainConcentration: number;

  // Overall, explainable profile.
  profileTier: RiskProfileTier;
  profileBreakdown: RiskProfileBreakdown;

  limitations: string[];
}

const DRAWDOWN_EPSILON_SOL = 1e-4;

/**
 * Walk the chronological realized-equity curve and extract drawdown episodes.
 * An episode opens when equity first dips below a peak and closes when a new
 * peak is reached (recovered) or the series ends (unrecovered).
 */
export function computeDrawdownEpisodes(
  closed: ClosedRoundTrip[],
): { episodes: DrawdownEpisode[]; maxDrawdownSol: number; maxDrawdownPercent: number | null; currentDrawdownSol: number } {
  const sorted = [...closed].sort((a, b) => a.sellTime - b.sellTime);
  const episodes: DrawdownEpisode[] = [];
  let running = 0;
  let peak = 0;
  let peakTime = sorted[0]?.buyTime ?? 0;
  let peakIndex = -1;
  let maxDrawdownSol = 0;
  let maxDrawdownPercent: number | null = null;
  let inDrawdown = false;
  let troughSol = 0;

  for (let i = 0; i < sorted.length; i++) {
    running += sorted[i]!.realizedPnlSol;
    const time = sorted[i]!.sellTime;
    if (running > peak - DRAWDOWN_EPSILON_SOL && running >= peak) {
      // New peak (or matched it): close any open episode as recovered.
      if (inDrawdown) {
        episodes.push({
          depthSol: peak - troughSol,
          durationSec: Math.max(0, time - peakTime),
          tradesToRecover: i - peakIndex,
          recovered: true,
        });
        inDrawdown = false;
      }
      peak = running;
      peakTime = time;
      peakIndex = i;
    } else {
      const dd = peak - running;
      if (dd > DRAWDOWN_EPSILON_SOL) {
        if (!inDrawdown) {
          inDrawdown = true;
          troughSol = running;
        }
        troughSol = Math.min(troughSol, running);
        if (dd > maxDrawdownSol) maxDrawdownSol = dd;
        if (peak > 0) {
          const pct = (dd / peak) * 100;
          if (maxDrawdownPercent == null || pct > maxDrawdownPercent) {
            maxDrawdownPercent = pct;
          }
        }
      }
    }
  }

  // Close a still-open drawdown at series end as unrecovered.
  if (inDrawdown) {
    const lastTime = sorted[sorted.length - 1]!.sellTime;
    episodes.push({
      depthSol: peak - troughSol,
      durationSec: Math.max(0, lastTime - peakTime),
      tradesToRecover: sorted.length - 1 - peakIndex,
      recovered: false,
    });
  }

  const currentDrawdownSol = Math.max(0, peak - running);
  return { episodes, maxDrawdownSol, maxDrawdownPercent, currentDrawdownSol };
}

/** Longest run of consecutive wins and losses (breakevens reset both runs). */
export function computeStreaks(closed: ClosedRoundTrip[]): {
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  currentStreak: number;
} {
  const sorted = [...closed].sort((a, b) => a.sellTime - b.sellTime);
  let maxWins = 0;
  let maxLosses = 0;
  let winRun = 0;
  let lossRun = 0;
  let current = 0;
  for (const c of sorted) {
    const outcome = classifyOutcome(c.realizedPnlSol);
    if (outcome === "win") {
      winRun++;
      lossRun = 0;
      current = current >= 0 ? current + 1 : 1;
    } else if (outcome === "loss") {
      lossRun++;
      winRun = 0;
      current = current <= 0 ? current - 1 : -1;
    } else {
      winRun = 0;
      lossRun = 0;
      current = 0;
    }
    if (winRun > maxWins) maxWins = winRun;
    if (lossRun > maxLosses) maxLosses = lossRun;
  }
  return {
    maxConsecutiveWins: maxWins,
    maxConsecutiveLosses: maxLosses,
    currentStreak: current,
  };
}

/** Share (0-1) of the total magnitude concentrated in the largest `n` items. */
function tailConcentration(magnitudes: number[], n: number): number {
  if (magnitudes.length === 0) return 0;
  const total = magnitudes.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const topN = [...magnitudes].sort((a, b) => b - a).slice(0, n);
  return topN.reduce((a, b) => a + b, 0) / total;
}

/**
 * Build the full Historical Risk Intelligence model from completed round trips
 * plus the wallet's swap events (for position-size volatility). Pure.
 */
export function computeHistoricalRisk(
  closed: ClosedRoundTrip[],
  events: ParsedSwapEvent[],
): HistoricalRisk {
  const sampleSize = closed.length;
  const confidence = Math.max(0, Math.min(1, sampleSize / 20));
  const tier = confidenceTier(confidence, sampleSize);

  const wins = closed.filter((c) => classifyOutcome(c.realizedPnlSol) === "win");
  const losses = closed.filter(
    (c) => classifyOutcome(c.realizedPnlSol) === "loss",
  );
  const gainAmounts = wins.map((w) => w.realizedPnlSol);
  const lossAmounts = losses.map((l) => Math.abs(l.realizedPnlSol));
  const results = closed.map((c) => c.realizedPnlSol);

  const sumGains = gainAmounts.reduce((a, b) => a + b, 0);
  const sumLosses = lossAmounts.reduce((a, b) => a + b, 0);
  const avgWin = gainAmounts.length ? sumGains / gainAmounts.length : 0;
  const avgLoss = lossAmounts.length ? sumLosses / lossAmounts.length : 0;

  const { episodes, maxDrawdownSol, maxDrawdownPercent, currentDrawdownSol } =
    computeDrawdownEpisodes(closed);
  const recovered = episodes.filter((e) => e.recovered);
  const streaks = computeStreaks(closed);

  const buySizes = events
    .filter((e) => e.side === "buy" && e.solAmount > 0)
    .map((e) => e.solAmount);
  const buyMean = buySizes.length
    ? buySizes.reduce((a, b) => a + b, 0) / buySizes.length
    : 0;
  const positionSizeVolatility =
    buySizes.length >= 2 && buyMean > 0 ? stdDev(buySizes) / buyMean : 0;

  const resultVolatilitySol = stdDev(results);
  const downsideVolatilitySol = stdDev(losses.map((l) => l.realizedPnlSol));
  const expectancySol = results.length
    ? results.reduce((a, b) => a + b, 0) / results.length
    : 0;

  const tailLoss = tailConcentration(lossAmounts, 3);
  const tailGain = tailConcentration(gainAmounts, 3);

  // Explainable profile subcomponents.
  const meanAbs =
    results.length > 0
      ? results.reduce((a, b) => a + Math.abs(b), 0) / results.length
      : 0;
  const resultDispersion = meanAbs > 0 ? resultVolatilitySol / meanAbs : 0;
  const drawdownSeverity = avgWin > 0 ? maxDrawdownSol / avgWin : 0;
  const breakdown: RiskProfileBreakdown = {
    resultDispersion,
    drawdownSeverity,
    tailLossConcentration: tailLoss,
  };

  const profileTier = classifyRiskProfile(sampleSize, breakdown);

  const limitations: string[] = [
    "Reconstructed from on-chain swap history, not a brokerage account equity curve.",
    "Only completed round trips are included; open positions and transfers are excluded.",
  ];
  if (maxDrawdownPercent == null) {
    limitations.push(
      "Percentage drawdown is unavailable because realized equity never rose above zero.",
    );
  }
  if (losses.length === 0) {
    limitations.push("No losing round trips yet, so loss-based ratios are limited.");
  }

  return {
    sampleSize,
    confidence,
    confidenceTier: tier,
    maxDrawdownSol,
    maxDrawdownPercent,
    avgDrawdownSol: episodes.length
      ? episodes.reduce((s, e) => s + e.depthSol, 0) / episodes.length
      : 0,
    currentDrawdownSol,
    longestDrawdownSec: episodes.reduce(
      (m, e) => Math.max(m, e.durationSec),
      0,
    ),
    medianRecoverySec: recovered.length
      ? median(recovered.map((e) => e.durationSec))
      : null,
    medianTradesToRecover: recovered.length
      ? median(recovered.map((e) => e.tradesToRecover))
      : null,
    drawdownCount: episodes.length,
    maxConsecutiveLosses: streaks.maxConsecutiveLosses,
    maxConsecutiveWins: streaks.maxConsecutiveWins,
    currentStreak: streaks.currentStreak,
    profitFactor: sumLosses > 0 ? sumGains / sumLosses : null,
    expectancySol,
    payoffRatio: avgLoss > 0 && avgWin > 0 ? avgWin / avgLoss : null,
    resultVolatilitySol,
    downsideVolatilitySol,
    positionSizeVolatility,
    tailLossConcentration: tailLoss,
    tailGainConcentration: tailGain,
    profileTier,
    profileBreakdown: breakdown,
    limitations,
  };
}

/**
 * Map explainable subcomponents onto a risk-profile tier. This is deliberately
 * simple and transparent (no hidden weights): a trader is "highly volatile"
 * when results swing wildly AND drawdowns are deep AND losses are tail-heavy,
 * and "controlled" when all three are low. Thresholds are documented constants.
 */
export function classifyRiskProfile(
  sampleSize: number,
  b: RiskProfileBreakdown,
): RiskProfileTier {
  if (sampleSize < MIN_SAMPLES_FOR_SCORE) return "insufficient";
  let points = 0;
  // Dispersion: >1.5 means the typical swing exceeds the typical result size.
  if (b.resultDispersion > 1.5) points += 2;
  else if (b.resultDispersion > 1.0) points += 1;
  // Drawdown severity: worst equity dip large relative to an average win.
  if (b.drawdownSeverity > 4) points += 2;
  else if (b.drawdownSeverity > 2) points += 1;
  // Tail loss concentration: most losses in a few trades.
  if (b.tailLossConcentration > 0.7) points += 2;
  else if (b.tailLossConcentration > 0.5) points += 1;

  if (points >= 5) return "highly_volatile";
  if (points >= 3) return "aggressive";
  if (points >= 1) return "moderate";
  return "controlled";
}

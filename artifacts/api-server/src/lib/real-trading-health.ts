/**
 * Portfolio Quality scoring for Real Trading Analysis.
 * Evaluates portfolio structure: concentration, diversification, dead
 * positions, and cleanliness.
 *
 * Naming note: this is intentionally NOT called "Wallet Health" in the UI —
 * that name belongs to the Wallet Cleanup utility's hygiene score (spam /
 * empty accounts / fake-value tokens). The two measure different things.
 * Internal field names keep the walletHealth key for API compatibility.
 */

import { currentConcentrationNote } from "./real-trading-contradictions.js";
import type { OpenPosition, TradingMetrics } from "./real-trading-math.js";

export interface WalletHealthBreakdown {
  score: number;
  deadPositions: number;
  dustPositions: number;
  concentrationRisk: number;
  diversification: number;
  portfolioCleanliness: number;
  notes: string[];
}

const DUST_THRESHOLD_SOL = 0.001;

export function computeWalletHealth(
  openPositions: OpenPosition[],
  metrics: TradingMetrics,
): WalletHealthBreakdown {
  const notes: string[] = [];
  let deadPositions = 0;
  let dustPositions = 0;

  for (const p of openPositions) {
    const value = p.currentValueSol ?? p.costBasisSol;
    if (value < DUST_THRESHOLD_SOL) {
      dustPositions++;
    }
    if (
      p.currentPriceSol != null &&
      p.currentPriceSol <= 0 &&
      p.costBasisSol > 0.01
    ) {
      deadPositions++;
    }
  }

  // Concentration: lower Herfindahl = better (invert for score).
  const concentrationRisk = Math.round(metrics.holdingConcentration * 100);
  const concentrationScore = Math.max(0, 100 - concentrationRisk);

  const diversification = metrics.diversificationScore;

  // Cleanliness: ratio of meaningful positions vs dust/dead.
  const total = openPositions.length || 1;
  const cleanRatio = 1 - (deadPositions + dustPositions) / total;
  const portfolioCleanliness = Math.round(Math.max(0, cleanRatio * 100));

  if (deadPositions > 0) {
    notes.push(
      `${deadPositions} position${deadPositions > 1 ? "s" : ""} may be inactive or worthless.`,
    );
  }
  if (dustPositions > 2) {
    notes.push(
      `${dustPositions} dust positions detected - consider consolidating.`,
    );
  }
  // Concentration vs diversification describe the SAME current holdings, so
  // exactly one (at most) may appear. Historical trading breadth is NOT phrased
  // as current diversification here - that was the source of the contradiction
  // where "well diversified" showed alongside 100% current concentration.
  const concentrationNote = currentConcentrationNote(
    concentrationRisk,
    openPositions.length,
  );
  if (concentrationNote) notes.push(concentrationNote);
  if (notes.length === 0) {
    notes.push("Portfolio appears organized with balanced exposure.");
  }

  const score = Math.round(
    concentrationScore * 0.3 +
      diversification * 0.3 +
      portfolioCleanliness * 0.25 +
      Math.min(100, metrics.uniqueTokensTraded * 5) * 0.15,
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    deadPositions,
    dustPositions,
    concentrationRisk,
    diversification,
    portfolioCleanliness,
    notes,
  };
}

/**
 * Deterministic contradiction-resolution layer for Real Trading Analysis.
 *
 * The UI must never present two opposite statements about the same trader in
 * the same analysis (e.g. "well diversified" while current concentration is
 * 100%, or "diamond hands" alongside "sells winners early"). This module groups
 * insights into mutually exclusive families and, within each family, keeps the
 * single statement with the strongest VERIFIED evidence and suppresses the
 * weaker one. When two conflicting statements are evidence-tied, BOTH extremes
 * are dropped so the page stays neutral rather than self-contradictory.
 *
 * Pure - no I/O, fully testable.
 */

import type { BehaviorInsight } from "./real-trading-behavior.js";

/**
 * Mutually exclusive groups. Two insights sharing a group cannot both be shown.
 * Covers: scalper vs long-term holder, profit-taker vs diamond hands,
 * disciplined vs impulsive, and consistent-sizing vs erratic-sizing.
 */
export const MUTUALLY_EXCLUSIVE_GROUPS: Record<string, string> = {
  // Hold style: quick flips vs multi-day holds.
  scalper: "hold_style",
  swing_trader: "hold_style",
  // Exit style: takes profits fast vs holds through drawdowns.
  early_seller: "exit_style",
  diamond_hands: "exit_style",
  // Discipline: measured decision-making vs panic exits.
  disciplined_risk: "discipline_style",
  panic_seller: "discipline_style",
};

/** Verified strength of an insight: observations that matched x internal trust. */
function evidenceStrength(i: BehaviorInsight): number {
  return Math.max(0, i.evidenceCount) * Math.max(0, Math.min(1, i.confidence));
}

/** Two strengths are "tied" when within 15% of the larger one. */
function isTie(a: number, b: number): boolean {
  const larger = Math.max(a, b);
  if (larger <= 0) return true;
  return Math.abs(a - b) < 0.15 * larger;
}

/**
 * Resolve contradictory behavior insights. Returns a filtered list preserving
 * the original ordering; grouped conflicts collapse to the strongest survivor
 * (or drop entirely when evidence is tied).
 */
export function resolveInsightContradictions(
  insights: BehaviorInsight[],
): BehaviorInsight[] {
  const byGroup = new Map<string, BehaviorInsight[]>();
  const ungrouped: BehaviorInsight[] = [];
  for (const i of insights) {
    const g = MUTUALLY_EXCLUSIVE_GROUPS[i.key];
    if (!g) {
      ungrouped.push(i);
      continue;
    }
    const list = byGroup.get(g) ?? [];
    list.push(i);
    byGroup.set(g, list);
  }

  const kept: BehaviorInsight[] = [...ungrouped];
  for (const list of byGroup.values()) {
    if (list.length === 1) {
      kept.push(list[0]!);
      continue;
    }
    const sorted = [...list].sort(
      (a, b) => evidenceStrength(b) - evidenceStrength(a),
    );
    const top = sorted[0]!;
    const second = sorted[1]!;
    // Evidence-tied conflict: drop both extremes to stay neutral.
    if (isTie(evidenceStrength(top), evidenceStrength(second))) continue;
    kept.push(top);
  }

  const order = new Map(insights.map((i, idx) => [i.key, idx]));
  return kept.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
}

/**
 * Resolve the current-portfolio structure notes so they can never contradict.
 * "Concentrated" and "diversified" describe the SAME current holdings, so at
 * most one may appear. `concentrationRisk` is the current Herfindahl-based
 * percentage (0-100); `openPositionCount` is the number of verified current
 * positions. Historical breadth (many tokens traded over time) is a separate
 * scope and is never phrased as current diversification here.
 */
export function currentConcentrationNote(
  concentrationRisk: number,
  openPositionCount: number,
): string | null {
  if (openPositionCount <= 0) return null;
  if (concentrationRisk > 60) {
    return "High concentration in a few tokens increases current portfolio risk.";
  }
  if (concentrationRisk <= 35 && openPositionCount >= 2) {
    return "Your current holdings are spread across multiple tokens.";
  }
  return null;
}

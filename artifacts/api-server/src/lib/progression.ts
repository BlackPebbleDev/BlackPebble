/**
 * Progression — the single, centralized source for "what an achievement is
 * worth". Any future XP / level / season / score system MUST read its point
 * values and contributions from here rather than hardcoding their own, so the
 * whole reputation surface stays consistent as it grows.
 *
 * Today it powers two things:
 *   • the badge contribution to the Trust Score (`badgeTrustContribution`)
 *   • a forward-looking total achievement score (`achievementScore`)
 *
 * It is intentionally dependency-light (only the `BadgeRarity` type) so it can
 * be imported anywhere without pulling in DB/IO.
 */

import type { BadgeRarity } from "./badges.js";

/** Point value of a single earned achievement, by rarity. */
export const RARITY_POINTS: Record<BadgeRarity, number> = {
  common: 10,
  rare: 25,
  epic: 50,
  legendary: 100,
};

/** Total achievement score for a set of earned rarities. */
export function achievementScore(earnedRarities: BadgeRarity[]): number {
  return earnedRarities.reduce(
    (sum, r) => sum + (RARITY_POINTS[r] ?? RARITY_POINTS.common),
    0,
  );
}

/**
 * Badge contribution to the 100-pt Trust Score (0–10). Centralized here so the
 * Trust Score and any future scoring share one definition. Behaviour is the
 * historical one: linear up to a 5-badge cap.
 */
export const BADGE_TRUST_CAP = 5;
export const BADGE_TRUST_MAX_POINTS = 10;

export function badgeTrustContribution(earnedBadgeCount: number): number {
  return (
    (Math.min(earnedBadgeCount, BADGE_TRUST_CAP) / BADGE_TRUST_CAP) *
    BADGE_TRUST_MAX_POINTS
  );
}

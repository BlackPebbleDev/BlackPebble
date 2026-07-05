/**
 * BlackPebble TRADING PROGRESSION tiers (display side).
 *
 * This is ONE of three separate identity axes and must never be conflated with
 * the others:
 *   1. Account status  - Guest | Member        (see lib/account-status.ts)
 *   2. Role badges     - Founder, BP Team, …    (see components/official-badge.tsx)
 *   3. Trading progression - THIS FILE           (earned by trading performance)
 *
 * The progression vocabulary below is deliberately distinct from account-status
 * ("Member") and role names ("Verified Trader") so a progression label can never
 * be mistaken for membership or a role. There is no "Premium" - paid membership
 * does not exist on BlackPebble.
 *
 * IMPORTANT - this is a DISPLAY-ONLY relabel layer. The thresholds below mirror
 * the server's TIERS table in `artifacts/api-server/src/lib/trading.ts`
 * (graduationTier) and MUST stay in lockstep with it. The server is the single
 * source of truth for an account's stored tier; these client thresholds exist
 * only so list views can render a tier badge directly from a row's realized P&L
 * without an extra round-trip. Changing a display name never changes any
 * calculation, stored value, or rank.
 *
 *   legacy key   threshold (SOL)   progression display name
 *   ----------   ---------------   ------------------------
 *   legend       >= 1000           Black Label
 *   diamond      >= 300            Elite
 *   gold         >= 100            Gold
 *   silver       >= 25             Silver
 *   bronze       >= 5              Bronze
 *   (none)       base              Rookie
 *
 * "Rookie" is the base progression rank every account carries, so a progression
 * badge is always present and never disappears from a user's identity.
 */

export type TierName =
  | "Black Label"
  | "Elite"
  | "Gold"
  | "Silver"
  | "Bronze"
  | "Rookie";

const TIER_THRESHOLDS: { name: TierName; min: number }[] = [
  { name: "Black Label", min: 1000 },
  { name: "Elite", min: 300 },
  { name: "Gold", min: 100 },
  { name: "Silver", min: 25 },
  { name: "Bronze", min: 5 },
];

/** Map an all-time realized P&L (in SOL) to a tier name. Base tier is Rookie. */
export function tierFromRealizedPnl(realizedPnlSol: number): TierName {
  if (Number.isFinite(realizedPnlSol)) {
    for (const t of TIER_THRESHOLDS) {
      if (realizedPnlSol >= t.min) return t.name;
    }
  }
  return "Rookie";
}

export interface TierMeta {
  name: TierName;
  /**
   * Tailwind classes for the pill variant: color, background tint, and
   * optional glow for the upper tiers. Pill shape (rounded-full) is in
   * TierBadge.
   */
  className: string;
  /**
   * Text-only color class - no background, no glow.
   * Used by the "plain" variant for inline / dense surfaces (e.g. feed cards).
   */
  textClass: string;
  /** Prestige indicator glyph. */
  glyph: string;
}

const BLACK_LABEL_META: TierMeta = {
  name: "Black Label",
  className:
    "text-zinc-100 bg-zinc-100/10 shadow-[0_0_8px_rgba(244,244,245,0.25)]",
  textClass: "text-zinc-200",
  glyph: "◆",
};

const ELITE_META: TierMeta = {
  name: "Elite",
  className:
    "text-violet-300 bg-violet-400/10 shadow-[0_0_8px_rgba(167,139,250,0.3)]",
  textClass: "text-violet-300/90",
  glyph: "◈",
};

const GOLD_META: TierMeta = {
  name: "Gold",
  className:
    "text-amber-400 bg-amber-400/10 shadow-[0_0_6px_rgba(251,191,36,0.2)]",
  textClass: "text-amber-400/90",
  glyph: "◈",
};

const SILVER_META: TierMeta = {
  name: "Silver",
  className: "text-slate-200 bg-slate-300/10",
  textClass: "text-slate-300/90",
  glyph: "◈",
};

const BRONZE_META: TierMeta = {
  name: "Bronze",
  className: "text-orange-400 bg-orange-400/10",
  textClass: "text-orange-400/90",
  glyph: "◈",
};

const ROOKIE_META: TierMeta = {
  name: "Rookie",
  className: "text-muted-foreground bg-muted/40",
  textClass: "text-muted-foreground/70",
  glyph: "◦",
};

/**
 * Resolve badge metadata for a tier name. Accepts both the legacy server keys
 * (legend/diamond/gold/silver/bronze) and the progression display names
 * (case-insensitive). Anything unknown - including "none"/"unranked"/empty —
 * resolves to the base Rookie tier so a progression badge is always shown.
 */
const TIER_META: Record<string, TierMeta> = {
  // Legacy server/DB keys
  legend: BLACK_LABEL_META,
  diamond: ELITE_META,
  gold: GOLD_META,
  silver: SILVER_META,
  bronze: BRONZE_META,
  none: ROOKIE_META,
  unranked: ROOKIE_META,
  // Progression display-name keys (for client-derived tiers)
  "black label": BLACK_LABEL_META,
  elite: ELITE_META,
  rookie: ROOKIE_META,
};

/** Resolve badge metadata for a tier name (case-insensitive). */
export function tierMeta(tier: string | null | undefined): TierMeta {
  const key = (tier ?? "").toLowerCase().trim();
  if (key === "") return ROOKIE_META;
  return TIER_META[key] ?? ROOKIE_META;
}

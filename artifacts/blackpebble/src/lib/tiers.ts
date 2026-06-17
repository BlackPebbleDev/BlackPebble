/**
 * BlackPebble reputation tier system (display side).
 *
 * IMPORTANT — this is a DISPLAY-ONLY relabel layer. The thresholds below mirror
 * the server's TIERS table in `artifacts/api-server/src/lib/trading.ts`
 * (graduationTier) and MUST stay in lockstep with it. The server is the source
 * of truth for an account's stored tier; these client thresholds exist only so
 * list views (e.g. the leaderboard) can render a tier badge directly from a
 * row's realized P&L without an extra round-trip.
 *
 * The server/DB still store the legacy keys ("Legend", "Diamond", "Gold",
 * "Silver", "Bronze"); those keys are mapped here to the official BlackPebble
 * display names. Changing a display name never changes any calculation.
 *
 *   legacy key   threshold (SOL)   official display name
 *   ----------   ---------------   --------------------
 *   legend       >= 1000           Black Label
 *   diamond      >= 300            Elite
 *   gold         >= 100            Premium
 *   silver       >= 25            Pro
 *   bronze       >= 5             Verified
 *   (none)       base              Member
 *
 * "Member" is the base tier every account carries, so a tier is always present
 * and never disappears from a user's identity.
 */

export type TierName =
  | "Black Label"
  | "Elite"
  | "Premium"
  | "Pro"
  | "Verified"
  | "Member";

const TIER_THRESHOLDS: { name: TierName; min: number }[] = [
  { name: "Black Label", min: 1000 },
  { name: "Elite", min: 300 },
  { name: "Premium", min: 100 },
  { name: "Pro", min: 25 },
  { name: "Verified", min: 5 },
];

/** Map an all-time realized P&L (in SOL) to a tier name. Base tier is Member. */
export function tierFromRealizedPnl(realizedPnlSol: number): TierName {
  if (Number.isFinite(realizedPnlSol)) {
    for (const t of TIER_THRESHOLDS) {
      if (realizedPnlSol >= t.min) return t.name;
    }
  }
  return "Member";
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
   * Text-only color class — no background, no glow.
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

const PREMIUM_META: TierMeta = {
  name: "Premium",
  className:
    "text-amber-400 bg-amber-400/10 shadow-[0_0_6px_rgba(251,191,36,0.2)]",
  textClass: "text-amber-400/90",
  glyph: "◈",
};

const PRO_META: TierMeta = {
  name: "Pro",
  className: "text-sky-300 bg-sky-400/10 shadow-[0_0_6px_rgba(125,211,252,0.2)]",
  textClass: "text-sky-300/90",
  glyph: "◈",
};

const VERIFIED_META: TierMeta = {
  name: "Verified",
  className: "text-slate-300 bg-slate-300/10",
  textClass: "text-slate-400",
  glyph: "◈",
};

const MEMBER_META: TierMeta = {
  name: "Member",
  className: "text-muted-foreground bg-muted/40",
  textClass: "text-muted-foreground/70",
  glyph: "◦",
};

/**
 * Resolve badge metadata for a tier name. Accepts both the legacy server keys
 * (legend/diamond/gold/silver/bronze) and the official display names
 * (case-insensitive). Anything unknown — including "none"/empty — resolves to
 * the base Member tier so a tier is always shown.
 */
const TIER_META: Record<string, TierMeta> = {
  // Legacy server/DB keys
  legend: BLACK_LABEL_META,
  diamond: ELITE_META,
  gold: PREMIUM_META,
  silver: PRO_META,
  bronze: VERIFIED_META,
  none: MEMBER_META,
  unranked: MEMBER_META,
  // Official display-name keys (for client-derived tiers)
  "black label": BLACK_LABEL_META,
  elite: ELITE_META,
  premium: PREMIUM_META,
  pro: PRO_META,
  verified: VERIFIED_META,
  member: MEMBER_META,
};

/** Resolve badge metadata for a tier name (case-insensitive). */
export function tierMeta(tier: string | null | undefined): TierMeta {
  const key = (tier ?? "").toLowerCase().trim();
  if (key === "") return MEMBER_META;
  return TIER_META[key] ?? MEMBER_META;
}

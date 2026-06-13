/**
 * Leaderboard tier system (display side).
 *
 * The thresholds below MUST stay in lockstep with the server's TIERS table in
 * `artifacts/api-server/src/lib/trading.ts` (graduationTier). The server is the
 * source of truth for an account's stored tier; these client thresholds exist
 * only so list views (e.g. the leaderboard) can render a tier badge directly
 * from a row's realized P&L without an extra round-trip.
 *
 * Display name: the server/DB stores "Legend" for the top tier but it renders
 * as "Elite" on the client. Both "legend" and "elite" keys resolve to Elite.
 */

export type TierName =
  | "Elite"
  | "Diamond"
  | "Gold"
  | "Silver"
  | "Bronze"
  | "Unranked";

const TIER_THRESHOLDS: { name: TierName; min: number }[] = [
  { name: "Elite", min: 1000 },
  { name: "Diamond", min: 300 },
  { name: "Gold", min: 100 },
  { name: "Silver", min: 25 },
  { name: "Bronze", min: 5 },
];

/** Map an all-time realized P&L (in SOL) to a tier name. */
export function tierFromRealizedPnl(realizedPnlSol: number): TierName {
  if (Number.isFinite(realizedPnlSol)) {
    for (const t of TIER_THRESHOLDS) {
      if (realizedPnlSol >= t.min) return t.name;
    }
  }
  return "Unranked";
}

export interface TierMeta {
  name: TierName;
  /**
   * Tailwind classes for the pill: color, background tint, and optional glow
   * for Gold and above. The pill shape (rounded-full) lives in TierBadge itself.
   */
  className: string;
  /** Prestige indicator glyph. Empty string for Unranked (badge hidden). */
  glyph: string;
}

const ELITE_META: TierMeta = {
  name: "Elite",
  className:
    "text-violet-300 bg-violet-400/10 shadow-[0_0_8px_rgba(167,139,250,0.3)]",
  glyph: "◈",
};

const TIER_META: Record<string, TierMeta> = {
  legend: ELITE_META,
  elite: ELITE_META,
  diamond: {
    name: "Diamond",
    className:
      "text-sky-300 bg-sky-400/10 shadow-[0_0_6px_rgba(125,211,252,0.2)]",
    glyph: "◈",
  },
  gold: {
    name: "Gold",
    className:
      "text-amber-400 bg-amber-400/10 shadow-[0_0_6px_rgba(251,191,36,0.2)]",
    glyph: "◈",
  },
  silver: {
    name: "Silver",
    className: "text-slate-300 bg-slate-300/10",
    glyph: "◈",
  },
  bronze: {
    name: "Bronze",
    className: "text-amber-700 bg-amber-900/20",
    glyph: "◈",
  },
  unranked: {
    name: "Unranked",
    className: "",
    glyph: "",
  },
};

/** Resolve badge metadata for a tier name (case-insensitive; "none" → Unranked). */
export function tierMeta(tier: string | null | undefined): TierMeta {
  const key = (tier ?? "").toLowerCase();
  if (key === "none" || key === "") return TIER_META.unranked;
  return TIER_META[key] ?? TIER_META.unranked;
}

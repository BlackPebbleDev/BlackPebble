/**
 * Leaderboard tier system (display side).
 *
 * The thresholds below MUST stay in lockstep with the server's TIERS table in
 * `artifacts/api-server/src/lib/trading.ts` (graduationTier). The server is the
 * source of truth for an account's stored tier; these client thresholds exist
 * only so list views (e.g. the leaderboard) can render a tier badge directly
 * from a row's realized P&L without an extra round-trip.
 */

export type TierName =
  | "Legend"
  | "Diamond"
  | "Gold"
  | "Silver"
  | "Bronze"
  | "Unranked";

const TIER_THRESHOLDS: { name: TierName; min: number }[] = [
  { name: "Legend", min: 1000 },
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
  /** Placeholder badge styling (border + text + subtle fill) until real art. */
  className: string;
  /** Glyph stand-in for a badge image. */
  glyph: string;
}

const TIER_META: Record<string, TierMeta> = {
  legend: {
    name: "Legend",
    className: "border-violet-400/50 text-violet-300 bg-violet-400/10",
    glyph: "★",
  },
  diamond: {
    name: "Diamond",
    className: "border-sky-400/50 text-sky-300 bg-sky-400/10",
    glyph: "◆",
  },
  gold: {
    name: "Gold",
    className: "border-amber-400/50 text-amber-300 bg-amber-400/10",
    glyph: "●",
  },
  silver: {
    name: "Silver",
    className: "border-zinc-300/50 text-zinc-200 bg-zinc-300/10",
    glyph: "●",
  },
  bronze: {
    name: "Bronze",
    className: "border-amber-700/50 text-amber-600 bg-amber-700/10",
    glyph: "●",
  },
  unranked: {
    name: "Unranked",
    className: "border-border text-muted-foreground bg-transparent",
    glyph: "—",
  },
};

/** Resolve badge metadata for a tier name (case-insensitive; "none"→Unranked). */
export function tierMeta(tier: string | null | undefined): TierMeta {
  const key = (tier ?? "").toLowerCase();
  if (key === "none" || key === "") return TIER_META.unranked;
  return TIER_META[key] ?? TIER_META.unranked;
}

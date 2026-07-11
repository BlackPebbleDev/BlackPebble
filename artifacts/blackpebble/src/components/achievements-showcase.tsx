import { useState } from "react";
import { Award, Check, Loader2, Share2, Sparkles } from "lucide-react";
import type { BadgeEntry, BadgeRarity } from "@/lib/api";
import { RARITY_META, iconForBadge, rarityOf } from "@/components/achievement-badge";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Premium collectible Achievements showcase for the public profile.
 *
 * Design intent: a tight, overlapping spread of struck-coin medallions - a
 * trophy shelf, not a badge grid. Only EARNED achievements are shown (locked
 * ones stay a surprise), in earned order (newest first). No rarity counters or
 * category groupings clutter the top. Tapping a coin opens a compact spotlight
 * detail card for that achievement.
 */

/**
 * Per-rarity "metal" finish for the medallions. Each is a struck-coin face
 * (radial metal gradient), a bezel (highlight top / shadow bottom + ring + soft
 * glow), an engraved inner ring, a conic metallic sheen, and an emblem color.
 * This is the collectible art direction expressed in pure CSS so it scales
 * crisply at any size and stays on-brand.
 */
interface Metal {
  face: string;
  bezel: string;
  innerRing: string;
  sheen: string;
  icon: string;
}

const SHEEN =
  "conic-gradient(from 210deg at 50% 50%, rgba(255,255,255,0.34), rgba(255,255,255,0) 70deg, rgba(255,255,255,0.12) 190deg, rgba(255,255,255,0) 290deg)";

const METALS: Record<BadgeRarity, Metal> = {
  common: {
    face: "radial-gradient(circle at 34% 26%, #aeb7c4 0%, #5c646f 46%, #2b3038 82%, #191d23 100%)",
    bezel:
      "inset 0 1.5px 1px rgba(255,255,255,0.4), inset 0 -2px 3px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.55), 0 0 0 1px rgba(148,163,184,0.45), 0 0 10px rgba(148,163,184,0.14)",
    innerRing:
      "inset 0 0 0 1px rgba(203,213,225,0.28), inset 0 1px 2px rgba(0,0,0,0.4)",
    sheen: SHEEN,
    icon: "#eef2f7",
  },
  rare: {
    face: "radial-gradient(circle at 34% 26%, #bae6fd 0%, #3b82f6 46%, #1e3a8a 82%, #0b1a38 100%)",
    bezel:
      "inset 0 1.5px 1px rgba(255,255,255,0.45), inset 0 -2px 3px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.55), 0 0 0 1px rgba(56,189,248,0.55), 0 0 16px rgba(56,189,248,0.4)",
    innerRing:
      "inset 0 0 0 1px rgba(125,211,252,0.4), inset 0 1px 2px rgba(0,0,0,0.4)",
    sheen: SHEEN,
    icon: "#eff8ff",
  },
  epic: {
    face: "radial-gradient(circle at 34% 26%, #e9d5ff 0%, #8b5cf6 46%, #5b21b6 82%, #2a1150 100%)",
    bezel:
      "inset 0 1.5px 1px rgba(255,255,255,0.45), inset 0 -2px 3px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.55), 0 0 0 1px rgba(167,139,250,0.6), 0 0 18px rgba(167,139,250,0.45)",
    innerRing:
      "inset 0 0 0 1px rgba(216,180,254,0.45), inset 0 1px 2px rgba(0,0,0,0.4)",
    sheen: SHEEN,
    icon: "#f8f2ff",
  },
  legendary: {
    face: "radial-gradient(circle at 34% 26%, #fde68a 0%, #d4af37 46%, #7a5312 82%, #452c06 100%)",
    bezel:
      "inset 0 1.5px 1px rgba(255,255,255,0.5), inset 0 -2px 3px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.55), 0 0 0 1px rgba(251,191,36,0.6), 0 0 20px rgba(251,191,36,0.5)",
    innerRing:
      "inset 0 0 0 1px rgba(253,230,138,0.5), inset 0 1px 2px rgba(0,0,0,0.4)",
    sheen: SHEEN,
    icon: "#fffdf5",
  },
};

const PRESTIGE_NOTE: Record<BadgeRarity, string> = {
  common: "Earned milestone",
  rare: "Rare achievement",
  epic: "Epic milestone",
  legendary: "Legendary prestige",
};

/** The struck-coin medallion face. Non-interactive; wrapped by tokens + detail. */
function Medallion({
  badge,
  size,
  overflowLabel,
}: {
  badge?: BadgeEntry;
  size: number;
  overflowLabel?: string;
}) {
  const rarity = badge ? rarityOf(badge) : "common";
  const m = METALS[rarity];
  const Icon = badge ? iconForBadge(badge) : Award;
  const inset = Math.max(2, Math.round(size * 0.09));
  const iconPx = Math.round(size * 0.42);
  return (
    <span
      className="relative inline-flex flex-shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: m.face, boxShadow: m.bezel }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{ inset, boxShadow: m.innerRing }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full opacity-60 mix-blend-overlay"
        style={{ background: m.sheen }}
      />
      {overflowLabel ? (
        <span
          className="relative font-mono font-bold tabular-nums text-white [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.55))]"
          style={{ fontSize: Math.round(size * 0.3), color: m.icon }}
        >
          {overflowLabel}
        </span>
      ) : (
        <Icon
          strokeWidth={2.25}
          className="relative [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.55))]"
          style={{ width: iconPx, height: iconPx, color: m.icon }}
        />
      )}
    </span>
  );
}

/** A tappable coin in the overlapping spread. */
function AchievementToken({
  badge,
  size,
  step,
  selected,
  onSelect,
  justUnlocked,
}: {
  badge: BadgeEntry;
  size: number;
  step: number;
  selected: boolean;
  onSelect: (key: string) => void;
  justUnlocked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(badge.key)}
      data-testid={`achievement-token-${badge.key}`}
      aria-pressed={selected}
      aria-label={`${badge.name} (${RARITY_META[rarityOf(badge)].label})`}
      style={{ marginLeft: -step }}
      className={cn(
        "group relative rounded-full outline-none transition-transform duration-200 will-change-transform",
        "hover:z-20 focus-visible:z-20",
        selected
          ? "z-20 -translate-y-1 scale-110"
          : "z-0 hover:-translate-y-1 hover:scale-110 focus-visible:-translate-y-1 focus-visible:scale-110",
        justUnlocked && "animate-pulse",
      )}
    >
      <Medallion badge={badge} size={size} />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-[3px] rounded-full ring-2 transition-opacity",
          selected
            ? "opacity-100 ring-accent/80 shadow-[0_0_16px_-2px_rgba(212,175,55,0.55)]"
            : "opacity-0 ring-white/40 group-hover:opacity-70 group-focus-visible:opacity-70",
        )}
      />
      {justUnlocked && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-[3px] rounded-full ring-2 ring-amber-400/80"
        />
      )}
    </button>
  );
}

/** Compact spotlight card for the selected coin. */
function AchievementDetailPanel({
  badge,
  onShare,
}: {
  badge: BadgeEntry;
  onShare?: (badge: BadgeEntry) => void;
}) {
  const rarity = rarityOf(badge);
  const meta = RARITY_META[rarity];
  return (
    <div
      data-testid="achievement-detail"
      className={cn(
        "mt-5 flex items-start gap-4 rounded-2xl border bg-gradient-to-br from-card via-card to-secondary/20 p-4",
        meta.border,
      )}
    >
      <Medallion badge={badge} size={64} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span
            data-testid="achievement-detail-name"
            className="text-sm font-semibold text-foreground"
          >
            {badge.name}
          </span>
          {onShare && (
            <button
              type="button"
              onClick={() => onShare(badge)}
              data-testid={`share-achievement-${badge.key}`}
              aria-label={`Share ${badge.name}`}
              className="flex-shrink-0 rounded-full border border-border/60 p-1.5 text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider",
              meta.text,
            )}
          >
            {PRESTIGE_NOTE[rarity]}
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <Check className="h-3 w-3 text-success" />
            {badge.earnedAt != null ? `Earned ${timeAgo(badge.earnedAt)}` : "Earned"}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {badge.description}
        </p>
        {badge.globalEarnedPercent != null && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
            <Sparkles className="h-3 w-3 text-accent/70" />
            Held by{" "}
            {badge.globalEarnedPercent < 1
              ? badge.globalEarnedPercent.toFixed(1)
              : Math.round(badge.globalEarnedPercent)}
            % of traders
          </div>
        )}
      </div>
    </div>
  );
}

/** Newest-first by earned timestamp; untimestamped unlocks keep stable order last. */
function byEarnedOrder(a: BadgeEntry, b: BadgeEntry): number {
  const ta = a.earnedAt;
  const tb = b.earnedAt;
  if (ta != null && tb != null) return tb - ta;
  if (ta != null) return -1;
  if (tb != null) return 1;
  return 0;
}

// Resting coin size (px) and how far each coin overlaps the previous one. Kept
// small + tight so the spread reads as a compact collectible strip, not a grid.
const COIN_SIZE = 40;
const OVERLAP = Math.round(COIN_SIZE * 0.32);
// Cap the resting spread so it stays ~2 rows; extra unlocks fold behind a "+N"
// coin that reveals the full collection on tap.
const MAX_VISIBLE = 13;

interface AchievementsShowcaseProps {
  badges: BadgeEntry[];
  isLoading: boolean;
  /** Keys freshly unlocked this session (shimmer celebration). */
  justUnlocked?: Set<string>;
  /** Provided only on the owner's own profile - enables share affordance. */
  onShare?: (badge: BadgeEntry) => void;
}

export function AchievementsShowcase({
  badges,
  isLoading,
  justUnlocked,
  onShare,
}: AchievementsShowcaseProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Earned only (locked stay a surprise), newest unlock first.
  const earned = badges.filter((b) => b.earned).sort(byEarnedOrder);
  const earnedCount = earned.length;

  const overflow = !showAll && earnedCount > MAX_VISIBLE;
  const shown = overflow ? earned.slice(0, MAX_VISIBLE - 1) : earned;
  const hiddenCount = earnedCount - shown.length;

  const selected =
    (selectedKey && earned.find((b) => b.key === selectedKey)) ||
    earned[0] ||
    null;

  return (
    <div className="mt-6">
      {/* Clean, subtle header - no rarity counters, no categories */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            Achievements
          </h2>
        </div>
        {!isLoading && earnedCount > 0 && (
          <span className="text-xs font-medium text-muted-foreground">
            <span className="font-semibold text-foreground">{earnedCount}</span>{" "}
            earned
          </span>
        )}
      </div>

      <div
        data-testid="achievements-card"
        className="rounded-2xl bg-card p-4 shadow-card md:p-5"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : earnedCount === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">
            No achievements earned yet.
          </p>
        ) : (
          <>
            {/* Overlapping collectible spread (1-2 rows) */}
            <div
              data-testid="achievement-cluster"
              className="flex flex-wrap"
              style={{ paddingLeft: OVERLAP + 4, rowGap: 14 }}
            >
              {shown.map((b) => (
                <AchievementToken
                  key={b.key}
                  badge={b}
                  size={COIN_SIZE}
                  step={OVERLAP}
                  selected={selected?.key === b.key}
                  onSelect={setSelectedKey}
                  justUnlocked={justUnlocked?.has(b.key)}
                />
              ))}
              {overflow && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  data-testid="achievement-show-all"
                  aria-label={`Show ${hiddenCount} more achievements`}
                  style={{ marginLeft: -OVERLAP }}
                  className="group relative z-0 rounded-full outline-none transition-transform duration-200 hover:z-20 hover:-translate-y-1 hover:scale-110 focus-visible:z-20"
                >
                  <Medallion size={COIN_SIZE} overflowLabel={`+${hiddenCount}`} />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-[3px] rounded-full ring-2 ring-white/40 opacity-0 transition-opacity group-hover:opacity-70"
                  />
                </button>
              )}
            </div>

            {showAll && earnedCount > MAX_VISIBLE && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                data-testid="achievement-show-less"
                className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-accent"
              >
                Show less
              </button>
            )}

            {/* Spotlight detail for the active coin */}
            {selected && (
              <AchievementDetailPanel badge={selected} onShare={onShare} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

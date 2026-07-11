import { useState } from "react";
import {
  Award,
  Check,
  ChevronDown,
  Loader2,
  Lock,
  Share2,
  Sparkles,
} from "lucide-react";
import type { BadgeEntry, BadgeRarity } from "@/lib/api";
import { RARITY_META, iconForBadge, rarityOf } from "@/components/achievement-badge";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Premium collectible Achievements showcase for the public profile.
 *
 * Design intent: a compact "trophy spread" of circular medallions rather than a
 * bulky grid of admin-style cards. Earned achievements read like a reputation
 * layer you want to browse; locked ones tuck away behind a compact drawer so
 * the section stays tight.
 *
 * Ordering: achievements are shown strictly in EARNED ORDER (newest unlock
 * first), never grouped by category. Unlocks that have no `earnedAt` timestamp
 * yet fall to the end of the earned list in their original stable server order,
 * which acts as a deterministic fallback until real timestamps exist.
 */

const RARITY_ORDER: BadgeRarity[] = ["legendary", "epic", "rare", "common"];

type Size = "sm" | "md" | "lg";

const SIZE_RING: Record<Size, string> = {
  sm: "h-11 w-11",
  md: "h-14 w-14",
  lg: "h-16 w-16",
};
const SIZE_ICON: Record<Size, string> = {
  sm: "h-[18px] w-[18px]",
  md: "h-6 w-6",
  lg: "h-7 w-7",
};

/** Newest-first by earned timestamp; untimestamped unlocks keep stable order last. */
function byEarnedOrder(a: BadgeEntry, b: BadgeEntry): number {
  const ta = a.earnedAt;
  const tb = b.earnedAt;
  if (ta != null && tb != null) return tb - ta;
  if (ta != null) return -1;
  if (tb != null) return 1;
  return 0;
}

/** The circular medallion visual (no interactivity) shared by tokens + detail. */
function MedallionVisual({
  badge,
  size = "md",
}: {
  badge: BadgeEntry;
  size?: Size;
}) {
  const rarity = rarityOf(badge);
  const meta = RARITY_META[rarity];
  const Icon = iconForBadge(badge);
  const earned = badge.earned;
  const foil = earned && (rarity === "epic" || rarity === "legendary");
  return (
    <span
      className={cn(
        "relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 transition-all",
        SIZE_RING[size],
        earned
          ? cn(meta.ring, meta.medallion, meta.glow)
          : "bg-secondary/20 ring-border/30",
      )}
    >
      {foil && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-3 -top-3 h-7 w-7 rotate-45 rounded-full opacity-50 blur-md",
            rarity === "legendary" ? "bg-amber-300/50" : "bg-violet-400/40",
          )}
        />
      )}
      <Icon
        className={cn(
          SIZE_ICON[size],
          earned ? meta.text : "text-muted-foreground/40",
        )}
      />
      {!earned && (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background p-0.5">
          <Lock className="h-2.5 w-2.5 text-muted-foreground/60" />
        </span>
      )}
    </span>
  );
}

/** A single tappable medallion in the cluster / locked drawer. */
function AchievementToken({
  badge,
  selected,
  onSelect,
  justUnlocked,
  size = "md",
}: {
  badge: BadgeEntry;
  selected: boolean;
  onSelect: (key: string) => void;
  justUnlocked?: boolean;
  size?: Size;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(badge.key)}
      data-testid={`achievement-token-${badge.key}`}
      aria-pressed={selected}
      aria-label={`${badge.name} (${RARITY_META[rarityOf(badge)].label}${
        badge.earned ? ", earned" : ", locked"
      })`}
      className={cn(
        "group relative rounded-full outline-none transition-transform duration-200 will-change-transform",
        "hover:-translate-y-0.5 hover:scale-105 focus-visible:-translate-y-0.5 focus-visible:scale-105",
        selected && "-translate-y-0.5 scale-105",
        !badge.earned && "opacity-60 hover:opacity-100",
        justUnlocked && "animate-pulse",
      )}
    >
      <MedallionVisual badge={badge} size={size} />
      {/* Selected / focus ring: gold brand accent brings the token forward */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-1 rounded-full ring-2 transition-opacity",
          selected
            ? "opacity-100 ring-accent/70 shadow-[0_0_16px_-2px_rgba(212,175,55,0.5)]"
            : "opacity-0 ring-accent/40 group-hover:opacity-60 group-focus-visible:opacity-60",
        )}
      />
      {justUnlocked && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-amber-400/70"
        />
      )}
    </button>
  );
}

/** Compact progress numbers - strip noisy decimals, keep small fractions. */
function formatProgress(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n >= 10 ? Math.round(n).toString() : n.toFixed(1);
}

/** Inline, premium detail reveal for the currently selected achievement. */
function AchievementDetailPanel({
  badge,
  onShare,
}: {
  badge: BadgeEntry;
  onShare?: (badge: BadgeEntry) => void;
}) {
  const rarity = rarityOf(badge);
  const meta = RARITY_META[rarity];
  const earned = badge.earned;
  const progress = badge.progress;
  const showProgress =
    !earned && !!progress && progress.target > 0;
  const pct =
    showProgress && progress
      ? Math.min(100, Math.round((progress.current / progress.target) * 100))
      : 0;

  return (
    <div
      data-testid="achievement-detail"
      className={cn(
        "mt-4 rounded-2xl border bg-gradient-to-br p-4 transition-colors",
        earned
          ? cn(meta.border, "from-card via-card to-secondary/20", meta.glow)
          : "border-border/50 from-secondary/15 to-transparent",
      )}
    >
      <div className="flex items-start gap-3.5">
        <MedallionVisual badge={badge} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="achievement-detail-name"
              className={cn(
                "text-sm font-semibold",
                earned ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {badge.name}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                meta.chip,
              )}
            >
              {meta.label}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium">
            {earned ? (
              <>
                <Check className="h-3 w-3 text-success" />
                <span className="text-muted-foreground">
                  {badge.earnedAt != null
                    ? `Earned ${timeAgo(badge.earnedAt)}`
                    : "Earned"}
                </span>
              </>
            ) : (
              <>
                <Lock className="h-3 w-3 text-muted-foreground/60" />
                <span className="text-muted-foreground/70">Locked</span>
              </>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {badge.description}
          </p>

          {showProgress && progress && (
            <div className="mt-2.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/40">
                <div
                  className="h-full rounded-full bg-muted-foreground/50 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] font-medium tabular-nums text-muted-foreground/60">
                {formatProgress(progress.current)} /{" "}
                {formatProgress(progress.target)}
              </div>
            </div>
          )}

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

        {earned && onShare && (
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
    </div>
  );
}

interface AchievementsShowcaseProps {
  badges: BadgeEntry[];
  isLoading: boolean;
  /** Keys freshly unlocked this session (shimmer celebration). */
  justUnlocked?: Set<string>;
  /** Provided only on the owner's own profile - enables share affordance. */
  onShare?: (badge: BadgeEntry) => void;
}

/**
 * The full section: compact header (count + %), a premium medallion cluster in
 * earned order, an inline detail reveal for the active medallion, and a
 * collapsed locked drawer. No category grouping anywhere.
 */
export function AchievementsShowcase({
  badges,
  isLoading,
  justUnlocked,
  onShare,
}: AchievementsShowcaseProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showLocked, setShowLocked] = useState(false);

  // Hidden achievements stay invisible until earned (no name/hint leak).
  const visible = badges.filter((b) => b.earned || !b.hidden);
  const earned = visible.filter((b) => b.earned).sort(byEarnedOrder);
  const locked = visible.filter((b) => !b.earned);
  const total = visible.length;
  const earnedCount = earned.length;
  const pct = total > 0 ? Math.round((earnedCount / total) * 100) : 0;

  const rarityCounts = earned.reduce<Record<BadgeRarity, number>>(
    (acc, b) => {
      const r = rarityOf(b);
      acc[r] = (acc[r] ?? 0) + 1;
      return acc;
    },
    { common: 0, rare: 0, epic: 0, legendary: 0 },
  );

  // Default the reveal to the most recent unlock so the panel is never empty.
  const selected =
    (selectedKey && visible.find((b) => b.key === selectedKey)) ||
    earned[0] ||
    null;

  return (
    <div className="mt-6">
      {/* Section header */}
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            Achievements
          </h2>
        </div>
        {!isLoading && total > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-foreground">
              {earnedCount}
              <span className="text-muted-foreground"> of {total}</span>
            </span>
            <span className="font-semibold tabular-nums text-accent">
              {pct}%
            </span>
          </div>
        )}
      </div>

      <div
        data-testid="achievements-card"
        className="rounded-2xl bg-card p-4 shadow-card md:p-5"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : total === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No achievements available.
          </p>
        ) : (
          <>
            {/* Slim progress bar + rarity mix */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/40">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            {earnedCount > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {RARITY_ORDER.filter((r) => rarityCounts[r] > 0).map((r) => (
                  <span
                    key={r}
                    data-testid={`rarity-chip-${r}`}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      RARITY_META[r].chip,
                    )}
                  >
                    {rarityCounts[r]} {RARITY_META[r].label}
                  </span>
                ))}
              </div>
            )}

            {/* Earned medallion cluster (newest first) */}
            {earnedCount > 0 ? (
              <>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Recent unlocks
                  </span>
                </div>
                <div
                  data-testid="achievement-cluster"
                  className="mt-2 flex flex-wrap gap-2.5 sm:gap-3"
                >
                  {earned.map((b) => (
                    <AchievementToken
                      key={b.key}
                      badge={b}
                      selected={selected?.key === b.key}
                      onSelect={setSelectedKey}
                      justUnlocked={justUnlocked?.has(b.key)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No achievements unlocked yet.
              </p>
            )}

            {/* Inline detail reveal for the active medallion */}
            {selected && (
              <AchievementDetailPanel badge={selected} onShare={onShare} />
            )}

            {/* Locked, tucked behind a compact drawer */}
            {locked.length > 0 && (
              <div className="mt-4 border-t border-border/40 pt-4">
                <button
                  type="button"
                  onClick={() => setShowLocked((v) => !v)}
                  data-testid="toggle-locked-achievements"
                  aria-expanded={showLocked}
                  className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  <span className="flex items-center gap-1.5">
                    <Lock className="h-3 w-3" />
                    Locked · {locked.length}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      showLocked && "rotate-180",
                    )}
                  />
                </button>
                {showLocked && (
                  <div
                    data-testid="locked-cluster"
                    className="mt-3 flex flex-wrap gap-2.5"
                  >
                    {locked.map((b) => (
                      <AchievementToken
                        key={b.key}
                        badge={b}
                        size="sm"
                        selected={selected?.key === b.key}
                        onSelect={setSelectedKey}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

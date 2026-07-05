import {
  Award,
  Lock,
  TrendingUp,
  BarChart2,
  BarChart3,
  DollarSign,
  Trophy,
  Megaphone,
  Flame,
  Star,
  Target,
  ScrollText,
  BookOpen,
  UserCheck,
  Bookmark,
  Coins,
  Sparkles,
  Eraser,
  Wand2,
  Users,
  Rocket,
  Crosshair,
  Crown,
  Gem,
  Shield,
  Medal,
  Zap,
  Share2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BadgeEntry, BadgeRarity } from "@/lib/api";

/**
 * Achievement badge - a collectible tile (one of three identity axes). Earned
 * achievements are tinted by rarity with a metallic medallion + glow; locked
 * ones are greyed with a lock overlay so the catalog reads like a collection to
 * complete. This is purely the achievement axis - never conflate with role
 * badges or progression tiers.
 *
 * Sizing note (Task #55): the tile is intentionally compact/dense so a full
 * catalogue reads like a trophy case rather than a sparse grid. Touch target
 * stays comfortable via the medallion + the whole-tile tap area.
 */

/** Resolve a server icon-name hint to a lucide component. */
const ICONS: Record<string, LucideIcon> = {
  TrendingUp,
  BarChart2,
  BarChart3,
  DollarSign,
  Trophy,
  Megaphone,
  Flame,
  Star,
  Target,
  ScrollText,
  BookOpen,
  UserCheck,
  Bookmark,
  Coins,
  Sparkles,
  Eraser,
  Wand2,
  Users,
  Rocket,
  Crosshair,
  Crown,
  Gem,
  Shield,
  Medal,
  Zap,
  Award,
};

interface RarityStyle {
  label: string;
  /** Icon + label color when earned. */
  text: string;
  /** Medallion ring color when earned. */
  ring: string;
  /** Medallion background tint when earned (flat fallback). */
  iconBg: string;
  /** Metallic medallion gradient when earned. */
  medallion: string;
  /** Card glow when earned. */
  glow: string;
  /** Card border accent when earned. */
  border: string;
  /** Small rarity chip classes. */
  chip: string;
}

export const RARITY_META: Record<BadgeRarity, RarityStyle> = {
  common: {
    label: "Common",
    text: "text-zinc-300",
    ring: "ring-zinc-500/40",
    iconBg: "bg-zinc-500/10",
    medallion: "bg-gradient-to-br from-zinc-600/40 to-zinc-800/20",
    glow: "",
    border: "border-border/60",
    chip: "bg-zinc-800/60 text-zinc-300 border-zinc-600/40",
  },
  rare: {
    label: "Rare",
    text: "text-sky-300",
    ring: "ring-sky-500/45",
    iconBg: "bg-sky-500/10",
    medallion: "bg-gradient-to-br from-sky-400/30 to-sky-700/10",
    glow: "shadow-[0_0_12px_rgba(56,189,248,0.18)]",
    border: "border-sky-600/30",
    chip: "bg-sky-950/50 text-sky-300 border-sky-600/40",
  },
  epic: {
    label: "Epic",
    text: "text-violet-300",
    ring: "ring-violet-500/50",
    iconBg: "bg-violet-500/10",
    medallion: "bg-gradient-to-br from-violet-400/30 to-fuchsia-700/10",
    glow: "shadow-[0_0_14px_rgba(167,139,250,0.22)]",
    border: "border-violet-600/30",
    chip: "bg-violet-950/50 text-violet-300 border-violet-600/40",
  },
  legendary: {
    label: "Legendary",
    text: "text-amber-300",
    ring: "ring-amber-400/55",
    iconBg: "bg-amber-400/10",
    medallion: "bg-gradient-to-br from-amber-300/35 to-amber-600/10",
    glow: "shadow-[0_0_16px_rgba(251,191,36,0.28)]",
    border: "border-amber-500/35",
    chip: "bg-amber-950/50 text-amber-300 border-amber-500/40",
  },
};

export function rarityOf(badge: BadgeEntry): BadgeRarity {
  return badge.rarity ?? "common";
}

interface AchievementBadgeProps {
  badge: BadgeEntry;
  className?: string;
  /** Briefly shimmer this tile to celebrate a fresh unlock (self profile). */
  justUnlocked?: boolean;
  /** When provided, an earned tile shows a share entry point. */
  onShare?: (badge: BadgeEntry) => void;
}

export function AchievementBadge({
  badge,
  className,
  justUnlocked,
  onShare,
}: AchievementBadgeProps) {
  const rarity = rarityOf(badge);
  const meta = RARITY_META[rarity];
  const Icon = ICONS[badge.icon] ?? Award;
  const earned = badge.earned;
  const progress = badge.progress;
  // Show a progress bar only for unearned, count-based badges with a real
  // target and some progress to display.
  const showProgress =
    !earned && !!progress && progress.target > 0 && progress.current > 0;
  // Higher rarities get a faint corner sheen to read as collectible/foil.
  const foil = earned && (rarity === "epic" || rarity === "legendary");

  return (
    <div
      title={badge.description}
      data-testid={`achievement-${badge.key}`}
      className={cn(
        "group relative flex flex-col items-center overflow-hidden rounded-lg border px-2 py-2.5 text-center transition-all",
        earned
          ? cn(meta.border, "bg-card", meta.glow)
          : "border-border/30 bg-secondary/10",
        justUnlocked &&
          "animate-pulse ring-2 ring-amber-400/70 shadow-[0_0_18px_rgba(251,191,36,0.35)]",
        className,
      )}
    >
      {foil && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-6 -top-6 h-12 w-12 rotate-45 rounded-full opacity-40 blur-md",
            rarity === "legendary" ? "bg-amber-300/40" : "bg-violet-400/30",
          )}
        />
      )}
      {earned && onShare && (
        <button
          type="button"
          onClick={() => onShare(badge)}
          data-testid={`share-achievement-${badge.key}`}
          aria-label={`Share ${badge.name}`}
          className="absolute right-1 top-1 z-10 rounded-full p-1 text-muted-foreground/60 opacity-0 transition-all hover:bg-secondary/60 hover:text-foreground group-hover:opacity-100"
        >
          <Share2 className="h-3 w-3" />
        </button>
      )}
      <div
        className={cn(
          "relative mb-1.5 flex h-9 w-9 items-center justify-center rounded-full ring-1",
          earned
            ? cn(meta.ring, meta.medallion)
            : "ring-border/30 bg-secondary/30",
        )}
      >
        <Icon
          className={cn(
            "h-[18px] w-[18px]",
            earned ? meta.text : "text-muted-foreground/40",
          )}
        />
        {!earned && (
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background p-0.5">
            <Lock className="h-2.5 w-2.5 text-muted-foreground/60" />
          </span>
        )}
      </div>
      <div
        className={cn(
          "line-clamp-2 text-[11px] font-semibold leading-tight",
          earned ? "text-foreground" : "text-muted-foreground/60",
        )}
      >
        {badge.name}
      </div>
      <div
        className={cn(
          "mt-0.5 text-[8px] font-semibold uppercase tracking-wider",
          earned ? meta.text : "text-muted-foreground/40",
        )}
      >
        {meta.label}
      </div>
      {showProgress && (
        <div className="mt-1.5 w-full">
          <div className="h-1 w-full overflow-hidden rounded-full bg-secondary/40">
            <div
              className="h-full rounded-full bg-muted-foreground/50 transition-all"
              style={{
                width: `${Math.min(100, Math.round((progress!.current / progress!.target) * 100))}%`,
              }}
            />
          </div>
          <div className="mt-0.5 text-[8px] font-medium tabular-nums text-muted-foreground/50">
            {formatProgress(progress!.current)} /{" "}
            {formatProgress(progress!.target)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact progress numbers - strip noisy decimals, keep small fractions. */
function formatProgress(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n >= 10 ? Math.round(n).toString() : n.toFixed(1);
}

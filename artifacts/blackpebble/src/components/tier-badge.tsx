import { tierMeta } from "@/lib/tiers";
import { cn } from "@/lib/utils";

/**
 * Prestige tier indicator. Two variants:
 *
 * - "pill" (default) - rounded-full pill with subtle background tint and glow
 *   on Gold and above. Used in leaderboard cards, profile headers, etc.
 *
 * - "plain" - bare text with tier color only; no background, no border, no
 *   glow. Used in dense surfaces like feed cards where a pill would clutter.
 *
 * Every account carries at least the base "Rookie" progression tier, so this
 * never returns null - a tier is always shown. This is the trading-progression
 * axis only; it is distinct from account status (Guest/Member) and role badges.
 * Display order convention: Official badge(s) → TierBadge.
 */
export function TierBadge({
  tier,
  size = "md",
  variant = "pill",
  className,
}: {
  tier: string | null | undefined;
  size?: "sm" | "md";
  /** "pill" = rounded badge with bg/glow; "plain" = color-only text, no box */
  variant?: "pill" | "plain";
  className?: string;
}) {
  const meta = tierMeta(tier);

  if (variant === "plain") {
    return (
      <span
        data-testid={`tier-badge-${meta.name.toLowerCase()}`}
        className={cn(
          "inline-flex items-center gap-[3px] font-medium whitespace-nowrap text-[11px]",
          meta.textClass,
          className,
        )}
      >
        <span aria-hidden className="text-[9px] leading-none opacity-70">
          {meta.glyph}
        </span>
        {meta.name}
      </span>
    );
  }

  return (
    <span
      data-testid={`tier-badge-${meta.name.toLowerCase()}`}
      className={cn(
        "inline-flex items-center gap-[3px] rounded-full font-semibold tracking-wide whitespace-nowrap",
        size === "sm"
          ? "px-1.5 py-px text-[10px]"
          : "px-2 py-0.5 text-[11px]",
        meta.className,
        className,
      )}
    >
      <span aria-hidden className="text-[8px] leading-none opacity-75">
        {meta.glyph}
      </span>
      {meta.name}
    </span>
  );
}

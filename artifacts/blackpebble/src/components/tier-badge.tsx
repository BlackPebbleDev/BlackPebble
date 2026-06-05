import { tierMeta } from "@/lib/tiers";
import { cn } from "@/lib/utils";

/**
 * Tier badge for the leaderboard / portfolio. Uses placeholder glyph + styling
 * keyed on the tier (Bronze/Silver/Gold/Diamond/Legend, else "Unranked").
 * Swap the glyph for badge artwork here once real assets exist.
 */
export function TierBadge({
  tier,
  size = "md",
  className,
}: {
  tier: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = tierMeta(tier);
  return (
    <span
      data-testid={`tier-badge-${meta.name.toLowerCase()}`}
      className={cn(
        "inline-flex items-center gap-1.5 border font-medium whitespace-nowrap",
        size === "sm"
          ? "px-1.5 py-0.5 text-[10px]"
          : "px-2 py-1 text-xs",
        meta.className,
        className,
      )}
    >
      <span aria-hidden className="leading-none">
        {meta.glyph}
      </span>
      {meta.name}
    </span>
  );
}

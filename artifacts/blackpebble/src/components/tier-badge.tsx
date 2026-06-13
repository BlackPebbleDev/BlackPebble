import { tierMeta } from "@/lib/tiers";
import { cn } from "@/lib/utils";

/**
 * Premium prestige tier badge. Renders as a compact rounded pill with a
 * subtle background tint and glow on Gold and above. Returns null for
 * Unranked users so no badge clutters the UI.
 *
 * Display order: Official badge(s) → TierBadge.
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
  if (meta.name === "Unranked") return null;

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

import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type MetricTone =
  | "default"
  | "positive"
  | "negative"
  | "warning"
  | "accent"
  | "muted";

const TONE_CLASSES: Record<MetricTone, string> = {
  default: "text-foreground",
  positive: "text-success",
  negative: "text-danger",
  warning: "text-warning",
  accent: "text-accent",
  muted: "text-muted-foreground",
};

/**
 * Direction meaning for a change badge. A raw +/- is not enough: for a
 * lower-is-better signal (e.g. Risk Appetite) a decrease is an improvement, so
 * the badge must colour by MEANING, not by sign.
 */
export type DeltaDirection = "up-good" | "down-good" | "neutral";

export interface DeltaInfo {
  /** Numeric change (currentScore - previousScore). */
  value: number;
  /** How to interpret the sign. */
  direction?: DeltaDirection;
  /**
   * When set, the badge shows this text instead of a number (e.g. "New",
   * "Low data"). Used when a trustworthy prior comparison does not exist.
   */
  label?: string;
}

/**
 * Small change chip. Colours by MEANING (direction), not raw sign, and never
 * overlaps the label (label owns the flexible space, chip is shrink-0).
 */
function DeltaChip({ delta }: { delta: DeltaInfo }) {
  // Non-numeric status badge (New / Low data): neutral, muted styling.
  if (delta.label) {
    return (
      <span className="shrink-0 inline-flex items-center rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
        {delta.label}
      </span>
    );
  }
  if (delta.value === 0) return null;
  const up = delta.value > 0;
  const dir = delta.direction ?? "up-good";
  const good =
    dir === "neutral" ? null : dir === "up-good" ? up : !up;
  const toneClass =
    good == null
      ? "bg-white/[0.06] text-muted-foreground"
      : good
        ? "bg-success/10 text-success"
        : "bg-danger/10 text-danger";
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        toneClass,
      )}
    >
      {up ? (
        <ArrowUpRight className="w-3 h-3" />
      ) : (
        <ArrowDownRight className="w-3 h-3" />
      )}
      {Math.abs(delta.value)}
    </span>
  );
}

export interface MetricTileProps {
  label: string;
  value: React.ReactNode;
  /** Optional secondary line rendered under the value (e.g. USD equivalent). */
  sub?: React.ReactNode;
  /**
   * Optional change chip. Accepts a bare number (legacy: treated as up-good)
   * or a DeltaInfo for direction-aware, status-aware badges.
   */
  delta?: number | DeltaInfo | null;
  tone?: MetricTone;
  size?: "sm" | "md" | "lg";
  /**
   * Explanation of what the metric means. Shown in a BlackPebble-styled
   * rounded info box on hover (desktop) and always available via the info dot.
   */
  hint?: string;
  /** Makes the tile a button (mobile-friendly tap target for detail views). */
  onClick?: () => void;
  /** Visually marks the tile as opened/active (for accordions). */
  active?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * BlackPebble's reusable premium metric tile.
 *
 * Mobile-first rules (Phase 2):
 * - Labels never use a destructive ellipsis: they wrap to at most two lines.
 * - Values never ellipsize: they use tabular numerals and responsive sizing so
 *   an exact financial number is always readable at 360px.
 * - Change chips colour by meaning (direction) and never overlap the label.
 */
export function MetricTile({
  label,
  value,
  sub,
  delta,
  tone = "default",
  size = "md",
  hint,
  onClick,
  active,
  className,
  "data-testid": testId,
}: MetricTileProps) {
  const deltaInfo: DeltaInfo | null =
    delta == null ? null : typeof delta === "number" ? { value: delta } : delta;

  const clickable = onClick != null;

  const tile = (
    <div
      data-testid={testId}
      className={cn(
        "rounded-xl bg-surface-2 border border-white/[0.05]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        "transition-colors",
        clickable && "cursor-pointer hover:border-white/[0.12] active:border-accent/40",
        active && "border-accent/40 bg-surface-3",
        !clickable && "hover:border-white/[0.09]",
        size === "sm" ? "px-3 py-2.5" : size === "lg" ? "px-4 py-3.5 sm:px-5 sm:py-4" : "px-3.5 py-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="stat-label !whitespace-normal leading-tight line-clamp-2 min-w-0">
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {deltaInfo != null && <DeltaChip delta={deltaInfo} />}
          {(hint || clickable) && (
            <Info className="w-3 h-3 text-muted-foreground/50" aria-hidden />
          )}
        </div>
      </div>
      <div
        className={cn(
          "stat-value mt-1 tabular-nums leading-tight break-words",
          size === "sm"
            ? "text-base"
            : size === "lg"
              ? "text-xl sm:text-2xl md:text-3xl"
              : "text-lg sm:text-xl",
          TONE_CLASSES[tone],
        )}
      >
        {value}
      </div>
      {sub != null && (
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
          {sub}
        </div>
      )}
    </div>
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-left w-full"
        aria-expanded={active ? true : undefined}
      >
        {tile}
      </button>
    );
  }

  if (!hint) return tile;

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>{tile}</TooltipTrigger>
      <TooltipContent
        sideOffset={8}
        className="rounded-xl bg-surface-3 border border-white/[0.08] shadow-card px-3.5 py-2.5 max-w-[280px] text-foreground"
      >
        <div className="stat-label mb-1">{label}</div>
        <p className="text-xs text-foreground/90 leading-relaxed normal-case">
          {hint}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

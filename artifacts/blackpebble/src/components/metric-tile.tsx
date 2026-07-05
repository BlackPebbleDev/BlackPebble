import { ArrowDownRight, ArrowUpRight } from "lucide-react";
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

/** Small green/red chip used for period-over-period change. */
function DeltaChip({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        up
          ? "bg-success/10 text-success"
          : "bg-danger/10 text-danger",
      )}
    >
      {up ? (
        <ArrowUpRight className="w-3 h-3" />
      ) : (
        <ArrowDownRight className="w-3 h-3" />
      )}
      {Math.abs(delta)}
    </span>
  );
}

export interface MetricTileProps {
  label: string;
  value: React.ReactNode;
  /** Optional secondary line rendered under the value (e.g. USD equivalent). */
  sub?: React.ReactNode;
  /** Optional signed change chip (e.g. 30-day delta). */
  delta?: number | null;
  tone?: MetricTone;
  size?: "sm" | "md" | "lg";
  /**
   * Explanation of what the metric means. Shown in a BlackPebble-styled
   * rounded info box on hover (not a browser-native tooltip).
   */
  hint?: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * BlackPebble's reusable premium metric tile.
 *
 * Designed to sit INSIDE a parent `bg-card` container: the tile surface is one
 * step darker (`surface-2`), with a soft border and a subtle top highlight so
 * groups of tiles read as a clean instrument panel rather than rows of text.
 */
export function MetricTile({
  label,
  value,
  sub,
  delta,
  tone = "default",
  size = "md",
  hint,
  className,
  "data-testid": testId,
}: MetricTileProps) {
  const tile = (
    <div
      data-testid={testId}
      className={cn(
        "rounded-xl bg-surface-2 border border-white/[0.05]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        "transition-colors hover:border-white/[0.09]",
        size === "sm" ? "px-3 py-2.5" : size === "lg" ? "px-5 py-4" : "px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="stat-label truncate">{label}</span>
        {delta != null && <DeltaChip delta={delta} />}
      </div>
      <div
        className={cn(
          "stat-value mt-1 truncate",
          size === "sm" ? "text-lg" : size === "lg" ? "text-2xl md:text-3xl" : "text-xl",
          TONE_CLASSES[tone],
        )}
      >
        {value}
      </div>
      {sub != null && (
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
          {sub}
        </div>
      )}
    </div>
  );

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

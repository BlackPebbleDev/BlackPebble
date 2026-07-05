import { CHART_RANGES, type ChartRange } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";

/**
 * Pill-shaped time-range selector shared by BlackPebble's time-series charts
 * (Portfolio equity, Trading Analysis P&L). Purely presentational - the parent
 * owns the selected range and filters its own data.
 */
export function ChartRangeToggle({
  value,
  onChange,
  className,
}: {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-surface-2 border border-white/[0.05] p-0.5",
        className,
      )}
      role="tablist"
      aria-label="Chart time range"
    >
      {CHART_RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          role="tab"
          aria-selected={value === r.key}
          onClick={() => onChange(r.key)}
          data-testid={`chart-range-${r.key}`}
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
            value === r.key
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

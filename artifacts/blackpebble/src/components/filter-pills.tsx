import { cn } from "@/lib/utils";

/**
 * The single source of truth for filter / category navigation across the app —
 * Feed, Markets, Leaderboards, and any future filterable surface. Modeled on the
 * Markets filter style: rounded-full pills, gold active state, muted inactive
 * state, identical radius / height / spacing, responsive wrapping, and NO
 * horizontal scrolling. Every filter system should use this so they stay
 * visually identical.
 */

export interface FilterOption<T extends string> {
  id: T;
  label: string;
}

interface FilterPillsProps<T extends string> {
  options: readonly FilterOption<T>[];
  value: T;
  onChange: (id: T) => void;
  /** "md" (px-4 py-2) for primary navs; "sm" (px-3.5 py-1.5) for sub-filters. */
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
  /** Per-pill data-testid becomes `${testIdPrefix}-${id}`. */
  testIdPrefix?: string;
}

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
  className,
  testIdPrefix,
}: FilterPillsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${o.id}` : undefined}
            className={cn(
              "font-medium rounded-full border transition-colors whitespace-nowrap",
              size === "md" ? "px-4 py-2 text-sm" : "px-3.5 py-1.5 text-sm",
              active
                ? "border-accent text-accent bg-accent/10"
                : "border-border text-muted-foreground hover:text-foreground hover:border-accent/40",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

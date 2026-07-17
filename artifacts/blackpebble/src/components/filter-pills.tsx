import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The single source of truth for filter / category navigation across the app —
 * Feed, Markets, Leaderboards, and any future filterable surface. Modeled on the
 * Markets filter style: rounded-full pills, gold active state, muted inactive
 * state, identical radius / height / spacing, and one shared compact size.
 *
 * Two layout modes:
 *   • wrap (default) — small groups wrap onto a second row.
 *   • scroll — large groups stay on ONE row and scroll horizontally with the
 *     scrollbar hidden and a subtle edge fade that only appears when there is
 *     more content off-screen (so pills are never abruptly cut off).
 */

export interface FilterOption<T extends string> {
  id: T;
  label: string;
}

interface FilterPillsProps<T extends string> {
  options: readonly FilterOption<T>[];
  value: T;
  onChange: (id: T) => void;
  /** "md" (px-3 py-1.5) for primary navs; "sm" (px-2.5 py-1) for sub-filters. */
  size?: "sm" | "md";
  /**
   * When true, keep the pills on ONE row and scroll horizontally (scrollbar
   * hidden, edge fade) instead of wrapping to multiple rows. Use for large
   * filter groups so the layout stays compact and premium (Design System v2).
   */
  scroll?: boolean;
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
  scroll = false,
  ariaLabel,
  className,
  testIdPrefix,
}: FilterPillsProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });

  const updateFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setFade({
      left: scrollLeft > 1,
      right: scrollLeft + clientWidth < scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    if (!scroll) return;
    updateFade();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateFade, { passive: true });
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateFade);
      ro.disconnect();
    };
  }, [scroll, updateFade, options.length]);

  const pills = (
    <div
      ref={scroll ? scrollRef : undefined}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex gap-2",
        scroll ? "overflow-x-auto no-scrollbar flex-nowrap" : "flex-wrap",
        !scroll && className,
      )}
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
              "font-medium rounded-full border transition-colors whitespace-nowrap flex-shrink-0",
              size === "md" ? "px-3 py-1.5 text-[13px]" : "px-2.5 py-1 text-xs",
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

  if (!scroll) return pills;

  // Scroll mode: wrap so edge fades can overlay without affecting layout.
  return (
    <div className={cn("relative", className)}>
      {pills}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent transition-opacity duration-150",
          fade.left ? "opacity-100" : "opacity-0",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent transition-opacity duration-150",
          fade.right ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

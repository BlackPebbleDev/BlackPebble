import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one page-title pattern (DESIGN_SYSTEM.md §2.2): accent icon, dominant
 * tracking-tight title, optional meta/action row, one muted supporting line,
 * optional right-aligned actions. Every page uses this instead of rolling its
 * own header.
 *
 * Layout:
 *   [gold icon] Title                    [actions — desktop-friendly]
 *   [meta row: LIVE / Updated / refresh]   ← optional, full-width under title
 *   subtitle
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  meta,
  actions,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  /** Supporting line under the title (and meta, when present). */
  subtitle?: React.ReactNode;
  /**
   * Secondary row under the title — LIVE indicators, compact refresh, etc.
   * Keeps the title row clean on mobile so actions don't crowd the icon+title.
   */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 sm:mb-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <Icon className="w-7 h-7 text-accent flex-shrink-0" aria-hidden />
            )}
            {/* Design System v2: professional app title (~30px mobile, ~36px
                desktop), one consistent weight everywhere. */}
            <h1 className="text-3xl md:text-[2.25rem] font-bold tracking-tight leading-tight">
              {title}
            </h1>
          </div>
          {meta && (
            <div className="flex items-center gap-2 min-w-0 mt-1.5">{meta}</div>
          )}
          {subtitle && (
            <div className="text-sm text-muted-foreground mt-1">{subtitle}</div>
          )}
        </div>
        {actions && <div className="flex-shrink-0 pt-0.5">{actions}</div>}
      </div>
    </div>
  );
}

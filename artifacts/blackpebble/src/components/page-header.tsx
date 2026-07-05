import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one page-title pattern (DESIGN_SYSTEM.md §2.2): accent icon, dominant
 * tracking-tight title, one muted supporting line, optional right-aligned
 * actions. Every page uses this instead of rolling its own header.
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1">
            {Icon && <Icon className="w-7 h-7 text-accent flex-shrink-0" />}
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {title}
            </h1>
          </div>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex-shrink-0 pt-1">{actions}</div>}
      </div>
    </div>
  );
}

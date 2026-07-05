import type { LucideIcon } from "lucide-react";
import { Rss } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one empty-state pattern (DESIGN_SYSTEM.md §2.16): card surface, muted
 * icon, confident one-line headline, one supporting sentence, optional
 * single action. Copy should be contextual, never apologetic.
 */
export function EmptyState({
  icon: Icon = Rss,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-card shadow-card text-center py-16 px-6",
        className,
      )}
    >
      <Icon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
      <p className="text-foreground font-medium mb-1">{title}</p>
      <p className="text-muted-foreground text-sm max-w-sm mx-auto">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

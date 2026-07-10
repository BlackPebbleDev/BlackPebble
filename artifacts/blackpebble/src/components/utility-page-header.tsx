import { Link } from "wouter";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UtilityMeta } from "@/lib/utilities-meta";

/**
 * Shared header for Utility detail pages.
 *
 *   ← Utilities
 *   [gold icon] Title          [optional actions]
 *   subtitle
 *
 * Title wraps on mobile (no truncate / nowrap) so long names like
 * "Community Campaigns" stay readable without horizontal overflow. The icon
 * stays aligned to the first line of the title via items-start.
 */
export function UtilityPageHeader({
  utility,
  subtitle,
  actions,
  className,
}: {
  utility: UtilityMeta;
  /** Override the default landing-card description when the page needs a longer blurb. */
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const Icon: LucideIcon = utility.icon;
  return (
    <div className={cn("space-y-3", className)}>
      <Link
        href="/utilities"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-accent"
        data-testid="link-back-utilities"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Utilities
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex min-w-0 items-start gap-3">
            <Icon
              className="mt-1 h-7 w-7 flex-shrink-0 text-accent"
              aria-hidden
            />
            {/* No truncate / nowrap — long titles wrap cleanly on mobile. */}
            <h1 className="min-w-0 text-3xl font-bold tracking-tight md:text-4xl">
              {utility.title}
            </h1>
          </div>
          <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {subtitle ?? utility.description}
          </div>
        </div>
        {actions && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

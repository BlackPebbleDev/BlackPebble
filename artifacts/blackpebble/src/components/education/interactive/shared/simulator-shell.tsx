import { type ReactNode } from "react";
import {
  Lightbulb,
  RotateCcw,
  SlidersHorizontal,
  Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for every Academy simulator: title, optional simple/advanced
 * mode toggle, reset, guided-example and practice controls, an accessible live
 * region for results, an assumptions slot, and related-action CTAs. Modules
 * supply their own inputs/outputs as children so the interaction surface stays
 * consistent across the whole Academy.
 */
export function SimulatorShell({
  title,
  description,
  icon: Icon = Target,
  mode,
  onReset,
  onGuidedExample,
  onPractice,
  practiceLabel = "Practice challenge",
  children,
  assumptions,
  relatedActions,
  completed,
  testId,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  mode?: {
    advanced: boolean;
    onChange: (advanced: boolean) => void;
  };
  onReset?: () => void;
  onGuidedExample?: () => void;
  onPractice?: () => void;
  practiceLabel?: string;
  children: ReactNode;
  assumptions?: ReactNode;
  relatedActions?: ReactNode;
  completed?: boolean;
  testId?: string;
}) {
  return (
    <section
      className="rounded-2xl border border-accent/20 bg-card shadow-card"
      data-testid={testId}
      aria-label={title}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
          <h3 className="m-0 truncate text-sm font-semibold text-foreground">
            {title}
          </h3>
          {completed ? (
            <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
              Done
            </span>
          ) : null}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {mode ? (
            <button
              type="button"
              onClick={() => mode.onChange(!mode.advanced)}
              aria-pressed={mode.advanced}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                mode.advanced
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
              data-testid={testId ? `${testId}-mode` : undefined}
            >
              <SlidersHorizontal className="h-3 w-3" aria-hidden />
              {mode.advanced ? "Advanced" : "Simple"}
            </button>
          ) : null}
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              data-testid={testId ? `${testId}-reset` : undefined}
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Reset
            </button>
          ) : null}
        </div>
      </header>

      {description ? (
        <p className="border-b border-border/60 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}

      <div className="p-4" aria-live="polite">
        {children}
      </div>

      {(onGuidedExample || onPractice) && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {onGuidedExample ? (
            <button
              type="button"
              onClick={onGuidedExample}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              data-testid={testId ? `${testId}-guided` : undefined}
            >
              <Lightbulb className="h-3.5 w-3.5 text-accent" aria-hidden />
              Guided example
            </button>
          ) : null}
          {onPractice ? (
            <button
              type="button"
              onClick={onPractice}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              data-testid={testId ? `${testId}-practice` : undefined}
            >
              <Target className="h-3.5 w-3.5 text-accent" aria-hidden />
              {practiceLabel}
            </button>
          ) : null}
        </div>
      )}

      {(assumptions || relatedActions) && (
        <div className="space-y-3 border-t border-border/60 px-4 py-3">
          {assumptions}
          {relatedActions ? (
            <div className="flex flex-wrap gap-2">{relatedActions}</div>
          ) : null}
        </div>
      )}
    </section>
  );
}

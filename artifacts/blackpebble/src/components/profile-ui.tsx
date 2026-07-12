import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Shared BlackPebble profile/portfolio UI primitives.
 *
 * These are the building blocks of the Public Profile design language
 * (Reputation Passport, Trader DNA, Call Trophy Case). They live here so the
 * private Portfolio ("my trading headquarters") can reuse the EXACT same
 * section headers, panels, stat tiles, info hints and proof chips - making both
 * pages read as two views of the same product rather than separate apps.
 */

/** Uppercase section heading with a small accent icon. */
export function SectionHeader({
  icon: Icon,
  title,
  action,
  className,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  /** Optional trailing control (range toggle, link, count, ...). */
  action?: React.ReactNode;
  /** Extra classes on the wrapper (e.g. section rhythm overrides). */
  className?: string;
  /** "muted" de-emphasises a secondary section (lighter icon + title). */
  tone?: "default" | "muted";
}) {
  const muted = tone === "muted";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 mb-2 mt-6",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn("w-4 h-4", muted ? "text-muted-foreground" : "text-accent")}
        />
        <h2
          className={cn(
            "text-sm font-semibold uppercase tracking-wider",
            muted ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

/** Dark-glass panel wrapper used by the compact profile/portfolio sections. */
export function PanelCard({
  children,
  testId,
  className,
}: {
  children: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn("rounded-2xl bg-card shadow-card p-4 md:p-5", className)}
    >
      {children}
    </div>
  );
}

/**
 * Subtle beginner-education affordance: a small info icon that opens a short
 * "what this means" popover on tap (mobile friendly, unlike hover tooltips).
 * Kept tiny so pro users are never slowed down.
 */
export function InfoHint({ title, text }: { title: string; text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What is ${title}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex flex-shrink-0 items-center justify-center text-muted-foreground/50 transition-colors hover:text-accent"
        >
          <Info className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {text}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Compact icon stat card used across Trader DNA, the Call Trophy Case and the
 * private Portfolio analytics. Gives the numbers a premium "insight" feel
 * instead of a flat table row. `sub` adds a small secondary line under the
 * value; `hint` adds a beginner info popover next to the label.
 */
export function MiniStat({
  icon: Icon,
  label,
  value,
  valueClass,
  sub,
  hint,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  sub?: React.ReactNode;
  hint?: { title: string; text: string };
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_1px_2px_rgba(0,0,0,0.35)] transition-colors">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="w-3 h-3 flex-shrink-0 text-accent" />}
        <span className="truncate">{label}</span>
        {hint && <InfoHint title={hint.title} text={hint.text} />}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-base font-semibold tabular-nums text-foreground",
          valueClass,
        )}
      >
        {value}
      </div>
      {sub != null && (
        <div className="mt-0.5 text-[10px] text-muted-foreground/70">{sub}</div>
      )}
    </div>
  );
}

export type ChipTone = "up" | "down" | "accent" | "muted";

/** Small social-proof pill for snapshot proof strips. */
export function ProofChip({
  icon: Icon,
  children,
  tone = "muted",
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  tone?: ChipTone;
}) {
  const toneCls =
    tone === "up"
      ? "text-success"
      : tone === "down"
        ? "text-danger"
        : tone === "accent"
          ? "text-accent"
          : "text-foreground";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/30 px-2.5 py-1 text-xs font-medium">
      {Icon && (
        <Icon
          className={cn(
            "w-3 h-3 flex-shrink-0",
            tone === "accent" ? "text-accent" : "text-muted-foreground",
          )}
        />
      )}
      <span className={cn("whitespace-nowrap", toneCls)}>{children}</span>
    </span>
  );
}

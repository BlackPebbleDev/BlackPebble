/**
 * Small presentational building blocks shared across Trade Planner sections.
 * Keeping them here lets future planner modules reuse the same look without
 * copy-pasting Tailwind. Brand: black surfaces, gold accent for active state
 * only, mono for numbers.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/** A titled card that wraps each planner section. */
export function SectionCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("border border-border bg-card p-4 sm:p-5", className)}
    >
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle ? (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Two-or-more option segmented control. Active option uses the gold accent. */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex w-full border border-border bg-background p-0.5 rounded-md"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 min-h-9 px-3 text-sm font-medium rounded-[5px] transition-colors",
              active
                ? "bg-accent/15 text-accent border border-accent/40"
                : "text-muted-foreground border border-transparent hover:text-foreground",
            )}
            data-testid={`toggle-${opt.value}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Labeled text input with optional unit suffix and inline error message. */
export function PlannerField({
  label,
  value,
  onChange,
  placeholder,
  unit,
  error,
  hint,
  optional,
  action,
  inputMode = "decimal",
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  unit?: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  action?: { label: string; onClick: () => void };
  inputMode?: "decimal" | "text";
  testId?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="flex items-center gap-2">
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="normal-case text-[10px] text-accent transition-colors hover:text-accent/80"
            >
              {action.label}
            </button>
          ) : null}
          {optional ? <span className="normal-case">Optional</span> : null}
        </span>
      </label>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            "h-11 font-mono text-base pr-12",
            error && "border-red-500/60 focus-visible:ring-red-500/40",
          )}
          aria-invalid={error ? true : undefined}
          data-testid={testId}
        />
        {unit ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-red-400" data-testid={`${testId}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Label + value stat. Value is mono. `tone` only ever uses green/red for P&L. */
export function Stat({
  label,
  value,
  tone = "default",
  emphasis,
}: {
  label: string;
  value: string;
  tone?: "default" | "profit" | "loss" | "accent";
  emphasis?: boolean;
}) {
  const toneClass =
    tone === "profit"
      ? "text-emerald-400"
      : tone === "loss"
        ? "text-red-400"
        : tone === "accent"
          ? "text-accent"
          : "text-foreground";
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-[11px] uppercase leading-tight tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-mono tabular-nums break-words",
          emphasis ? "text-lg font-semibold" : "text-sm",
          toneClass,
        )}
      >
        {value}
      </div>
    </div>
  );
}

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared input primitives for Academy interactive modules. Consistent styling,
 * labels, accessibility, and numeric sanitization so every simulator behaves
 * the same. Keep these focused — do not over-abstract one-off elements.
 */

/** Parse a loose decimal string into a finite number (0 on failure). */
export function parseNum(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  testId,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  testId?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label
        htmlFor={id}
        className="text-[11px] font-medium text-muted-foreground"
      >
        {label}
      </label>
      <div className="flex items-center rounded-lg border border-border bg-surface-2 focus-within:border-accent/50">
        {prefix ? (
          <span className="pl-2.5 text-xs text-muted-foreground">{prefix}</span>
        ) : null}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          data-testid={testId}
          className="w-full bg-transparent px-2.5 py-2 text-sm text-foreground outline-none disabled:opacity-50"
        />
        {suffix ? (
          <span className="pr-2.5 text-xs text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
      {hint ? (
        <span className="text-[10px] text-muted-foreground/70">{hint}</span>
      ) : null}
    </div>
  );
}

export function RangeField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  display,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  display?: string;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
        <label htmlFor={id}>{label}</label>
        <span className="font-mono tabular-nums text-foreground">
          {display ?? value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[hsl(var(--accent))]"
        data-testid={testId}
      />
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedChoice<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label?: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <span className="text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
      ) : null}
      <div
        role="group"
        aria-label={label}
        className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5"
        data-testid={testId}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              value === opt.value
                ? "bg-accent/15 text-accent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      data-testid={testId}
      className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <span
        className={cn(
          "relative h-5 w-9 rounded-full border transition-colors",
          checked ? "border-accent/50 bg-accent/30" : "border-border bg-surface-2",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-foreground transition-all motion-reduce:transition-none",
            checked ? "left-4" : "left-0.5",
          )}
        />
      </span>
      {label}
    </button>
  );
}

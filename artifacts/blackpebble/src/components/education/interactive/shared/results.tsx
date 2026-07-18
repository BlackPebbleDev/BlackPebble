import { AlertTriangle, CheckCircle2, Info, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared output primitives for Academy interactive modules. */

export function signedTone(value: number): string {
  if (value > 0) return "text-success";
  if (value < 0) return "text-destructive";
  return "text-foreground";
}

export function Metric({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: string;
  testId?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-card/60 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 truncate font-mono text-sm font-semibold tabular-nums",
          tone ?? "text-foreground",
        )}
        data-testid={testId}
      >
        {value}
      </div>
    </div>
  );
}

export function MetricGrid({
  children,
  cols = 2,
}: {
  children: React.ReactNode;
  cols?: 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        cols === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2",
      )}
    >
      {children}
    </div>
  );
}

export function Headline({
  label,
  value,
  sub,
  tone,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  testId?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface-2 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-mono text-2xl font-bold tabular-nums",
          tone ?? "text-foreground",
        )}
        data-testid={testId}
      >
        {value}
      </div>
      {sub ? (
        <div className={cn("text-sm font-semibold tabular-nums", tone)}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

type NoteTone = "info" | "warning" | "success";

const NOTE_STYLES: Record<
  NoteTone,
  { border: string; bg: string; text: string; Icon: typeof Info }
> = {
  info: {
    border: "border-border/60",
    bg: "bg-card/60",
    text: "text-muted-foreground",
    Icon: Info,
  },
  warning: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    text: "text-amber-200/90",
    Icon: AlertTriangle,
  },
  success: {
    border: "border-success/30",
    bg: "bg-success/10",
    text: "text-success",
    Icon: CheckCircle2,
  },
};

export function Note({
  tone = "info",
  children,
  testId,
}: {
  tone?: NoteTone;
  children: React.ReactNode;
  testId?: string;
}) {
  const s = NOTE_STYLES[tone];
  const { Icon } = s;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed",
        s.border,
        s.bg,
        s.text,
      )}
      data-testid={testId}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Assumptions({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      <span className="font-semibold text-foreground/80">Assumptions: </span>
      {children}
    </p>
  );
}

export function FormulaNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-2 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}

/** A compact horizontal step timeline (entry -> exit -> now, etc). */
export function StepTimeline({
  steps,
}: {
  steps: { label: string; value: string }[];
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
      <div className="flex items-center justify-between gap-2 text-center text-[11px]">
        {steps.map((step, i) => (
          <div key={i} className="contents">
            <div className="min-w-0 flex-1">
              <div className="text-muted-foreground">{step.label}</div>
              <div className="truncate font-mono text-foreground">
                {step.value}
              </div>
            </div>
            {i < steps.length - 1 ? (
              <ArrowRight
                className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
                aria-hidden
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

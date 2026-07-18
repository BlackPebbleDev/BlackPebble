import { useMemo, useState } from "react";
import { Check, ListOrdered, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  gradeSequence,
  shuffleSteps,
  type SequenceConfig,
  type SequenceStep,
} from "@/lib/education/interactive/sequence-logic";
import type { InteractiveModuleProps } from "../contract";

/**
 * "Put the steps in order" interaction. The reader taps steps in the order they
 * think is correct; each tap assigns the next position. Then they check and see
 * which positions were right. Config-driven so one component powers any ordered
 * process (transaction flow, launch lifecycle, safe-trade routine, ...).
 */

const DEFAULT_CONFIG: SequenceConfig = {
  prompt: "Put the steps of a safe first trade in order.",
  steps: [
    { id: "learn", label: "Learn the basics", detail: "Understand price, risk, and wallets" },
    { id: "paper", label: "Paper trade first", detail: "Practice with simulated funds" },
    { id: "plan", label: "Plan the trade", detail: "Set entry, stop, and target" },
    { id: "size", label: "Size the position", detail: "Risk only what you can lose" },
    { id: "review", label: "Review before signing", detail: "Check the token and amount" },
  ],
};

export function SequenceBuilder({
  config,
  onEvent,
  onComplete,
}: InteractiveModuleProps<SequenceConfig>) {
  const cfg = config?.steps?.length ? config : DEFAULT_CONFIG;
  const correctIds = useMemo(() => cfg.steps.map((s) => s.id), [cfg.steps]);
  const shuffled = useMemo<SequenceStep[]>(
    () => shuffleSteps(cfg.steps, cfg.steps.length + 3),
    [cfg.steps],
  );

  const [chosen, setChosen] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [started, setStarted] = useState(false);

  function pick(id: string) {
    if (checked || chosen.includes(id)) return;
    if (!started) {
      setStarted(true);
      onEvent({ type: "interacted" });
    }
    setChosen((prev) => [...prev, id]);
  }

  function undo() {
    if (checked) return;
    setChosen((prev) => prev.slice(0, -1));
  }

  function check() {
    setChecked(true);
    onComplete({ completionType: "sequence" });
  }

  function reset() {
    setChosen([]);
    setChecked(false);
  }

  const result = checked ? gradeSequence(correctIds, chosen) : null;
  const stepById = (id: string) => cfg.steps.find((s) => s.id === id);

  return (
    <section
      className="rounded-2xl border border-accent/20 bg-card shadow-card"
      aria-label="Order the steps"
      data-testid="sequence-builder"
    >
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <ListOrdered className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
        <h3 className="m-0 text-sm font-semibold text-foreground">
          Put it in order
        </h3>
      </header>
      {cfg.prompt ? (
        <p className="border-b border-border/60 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {cfg.prompt}
        </p>
      ) : null}

      <div className="space-y-4 p-4">
        {/* Your order */}
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Your order
          </div>
          {chosen.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface-2/50 px-3 py-4 text-center text-xs text-muted-foreground">
              Tap the steps below in order
            </div>
          ) : (
            <ol className="space-y-1.5">
              {chosen.map((id, i) => {
                const step = stepById(id);
                const isRight = checked && correctIds[i] === id;
                const isWrong = checked && correctIds[i] !== id;
                return (
                  <li
                    key={id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                      isRight && "border-success/40 bg-success/10",
                      isWrong && "border-destructive/40 bg-destructive/10",
                      !checked && "border-border bg-surface-2",
                    )}
                  >
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {step?.label}
                    </span>
                    {isRight ? <Check className="h-4 w-4 flex-shrink-0 text-success" aria-hidden /> : null}
                    {isWrong ? <X className="h-4 w-4 flex-shrink-0 text-destructive" aria-hidden /> : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Remaining options */}
        {!checked ? (
          <div className="flex flex-wrap gap-2">
            {shuffled
              .filter((s) => !chosen.includes(s.id))
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pick(s.id)}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/40"
                  data-testid={`sequence-option-${s.id}`}
                >
                  {s.label}
                </button>
              ))}
          </div>
        ) : null}

        {result ? (
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-medium",
              result.perfect
                ? "border-success/30 bg-success/10 text-success"
                : "border-warning/30 bg-warning/10 text-warning",
            )}
            data-testid="sequence-result"
          >
            {result.perfect
              ? "Perfect order!"
              : `${result.correct} of ${result.total} in the right place. Review the highlights above.`}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!checked ? (
            <>
              <button
                type="button"
                onClick={check}
                disabled={chosen.length !== correctIds.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
                data-testid="sequence-check"
              >
                Check order
              </button>
              {chosen.length > 0 ? (
                <button
                  type="button"
                  onClick={undo}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Undo
                </button>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              data-testid="sequence-retry"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Try again
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

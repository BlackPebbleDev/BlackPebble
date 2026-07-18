import { useState } from "react";
import { Check, X, RotateCcw, ShieldQuestion, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isRoundCorrect,
  scoreScenario,
  type ScenarioRound,
} from "@/lib/education/interactive/scenario-logic";

/**
 * Shared renderer for decision-exercise modules. Presents fictional, clearly
 * labelled scenarios and asks the user to classify or choose. Provides
 * immediate feedback, per-round explanations, retry, and completion. Never
 * trains the user to approve real requests — all context is simulated.
 */
export function ScenarioShell({
  title,
  description,
  rounds,
  onComplete,
  onEvent,
  icon: Icon = ShieldQuestion,
  testId = "scenario",
}: {
  title: string;
  description?: string;
  rounds: ScenarioRound[];
  onComplete?: () => void;
  onEvent?: (type: "started" | "answered" | "completed", detail?: string) => void;
  icon?: typeof ShieldQuestion;
  testId?: string;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const [started, setStarted] = useState(false);

  const round = rounds[index];
  const selected = answers[round?.id ?? ""] ?? [];
  const isRevealed = !!revealed[round?.id ?? ""];

  function ensureStarted() {
    if (!started) {
      setStarted(true);
      onEvent?.("started");
    }
  }

  function toggle(optionId: string) {
    if (isRevealed) return;
    ensureStarted();
    setAnswers((prev) => {
      const current = prev[round.id] ?? [];
      if (round.multi) {
        const next = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
        return { ...prev, [round.id]: next };
      }
      return { ...prev, [round.id]: [optionId] };
    });
  }

  function submit() {
    if (selected.length === 0) return;
    setRevealed((prev) => ({ ...prev, [round.id]: true }));
    onEvent?.("answered", round.id);
    if (index === rounds.length - 1) {
      setFinished(true);
      onEvent?.("completed");
      onComplete?.();
    }
  }

  function reset() {
    setIndex(0);
    setAnswers({});
    setRevealed({});
    setFinished(false);
  }

  if (finished) {
    const score = scoreScenario(rounds, answers);
    return (
      <div
        className="rounded-2xl border border-accent/20 bg-card p-5 text-center shadow-card"
        data-testid={`${testId}-summary`}
      >
        <Icon className="mx-auto h-8 w-8 text-accent" aria-hidden />
        <div className="mt-2 text-lg font-bold text-foreground">
          {score.correct} / {score.total}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Learning exercise complete. There is not always a single perfect
          decision — focus on the reasoning.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          data-testid={`${testId}-retry`}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Try again
        </button>
      </div>
    );
  }

  if (!round) return null;

  return (
    <section
      className="rounded-2xl border border-accent/20 bg-card shadow-card"
      aria-label={title}
      data-testid={testId}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
          <h3 className="m-0 truncate text-sm font-semibold text-foreground">
            {title}
          </h3>
        </div>
        <span className="flex-shrink-0 text-[11px] text-muted-foreground">
          {index + 1} / {rounds.length}
        </span>
      </header>

      {description ? (
        <p className="border-b border-border/60 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}

      <div className="space-y-3 p-4">
        {round.context ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
              {round.fictionLabel ?? "Simulated example — not real"}
            </div>
            <p className="whitespace-pre-line text-sm text-foreground/90">
              {round.context}
            </p>
          </div>
        ) : null}

        <p className="text-sm font-medium text-foreground">{round.prompt}</p>
        {round.multi ? (
          <p className="text-[11px] text-muted-foreground">Select all that apply.</p>
        ) : null}

        <div role="group" className="space-y-2">
          {round.options.map((opt) => {
            const isSelected = selected.includes(opt.id);
            const showState = isRevealed && (isSelected || opt.correct);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggle(opt.id)}
                aria-pressed={isSelected}
                disabled={isRevealed}
                data-testid={`${testId}-option-${opt.id}`}
                className={cn(
                  "flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  !isRevealed && isSelected
                    ? "border-accent/50 bg-accent/10 text-foreground"
                    : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
                  showState && opt.correct && "border-success/50 bg-success/10 text-success",
                  showState && !opt.correct && isSelected && "border-destructive/50 bg-destructive/10 text-destructive",
                )}
              >
                <span className="min-w-0">
                  {opt.label}
                  {isRevealed && opt.note ? (
                    <span className="mt-0.5 block text-[11px] opacity-80">
                      {opt.note}
                    </span>
                  ) : null}
                </span>
                {showState && opt.correct ? (
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
                ) : null}
                {showState && !opt.correct && isSelected ? (
                  <X className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>

        {isRevealed ? (
          <div
            className={cn(
              "rounded-lg border p-3 text-xs leading-relaxed",
              isRoundCorrect(round, selected)
                ? "border-success/30 bg-success/10 text-success"
                : "border-amber-500/30 bg-amber-500/10 text-amber-200/90",
            )}
            data-testid={`${testId}-explanation`}
          >
            {round.explanation}
          </div>
        ) : null}

        <div className="flex justify-end">
          {isRevealed ? (
            index < rounds.length - 1 ? (
              <button
                type="button"
                onClick={() => setIndex((v) => v + 1)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
                data-testid={`${testId}-next`}
              >
                Next <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={selected.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
              data-testid={`${testId}-submit`}
            >
              Submit
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

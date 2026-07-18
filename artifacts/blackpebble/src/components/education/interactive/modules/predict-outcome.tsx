import { useState } from "react";
import { Check, RotateCcw, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InteractiveModuleProps } from "../contract";

/**
 * Predict-then-reveal. The reader is shown a short scenario and must *commit* to
 * a prediction before seeing the outcome. Forcing a choice first (the
 * "generation effect") makes the correct answer far stickier than passively
 * reading it — and unlike reveal cards, there is a right answer with feedback.
 * Fully config-driven so one component powers many lessons.
 */

interface PredictOption {
  label: string;
  correct?: boolean;
  /** Shown after answering to explain what actually happens for this choice. */
  result: string;
}

interface PredictOutcomeConfig {
  scenario?: string;
  question?: string;
  options?: PredictOption[];
  takeaway?: string;
}

const DEFAULT_CONFIG: Required<Pick<PredictOutcomeConfig, "scenario" | "question" | "options">> = {
  scenario:
    "Trevor wants to buy $100 of a thin, low-liquidity token and sets slippage to 1%.",
  question: "What is the most likely outcome?",
  options: [
    {
      label: "He pays exactly $100 of tokens",
      result: "Unlikely on a thin pool — his own order moves the price as it fills.",
    },
    {
      label: "His order fails or fills for noticeably fewer tokens",
      correct: true,
      result:
        "Right. On low liquidity, price impact is large, so a tight 1% slippage often makes the order fail — or it fills at a worse price.",
    },
    {
      label: "He gets more tokens than expected",
      result: "Price impact works against a buyer, not for them.",
    },
  ],
};

export function PredictOutcome({
  config,
  onEvent,
  onComplete,
}: InteractiveModuleProps<PredictOutcomeConfig>) {
  const scenario = config?.scenario ?? DEFAULT_CONFIG.scenario;
  const question = config?.question ?? DEFAULT_CONFIG.question;
  const options = config?.options?.length ? config.options : DEFAULT_CONFIG.options;
  const takeaway = config?.takeaway;

  const [choice, setChoice] = useState<number | null>(null);
  const answered = choice !== null;
  const gotItRight = answered && !!options[choice!]?.correct;

  function pick(i: number) {
    if (answered) return;
    setChoice(i);
    onEvent({ type: "interacted" });
    onComplete({ completionType: "prediction" });
  }

  function reset() {
    setChoice(null);
    onEvent({ type: "reset" });
  }

  return (
    <section
      className="rounded-2xl border border-accent/20 bg-card shadow-card"
      aria-label="Predict the outcome"
      data-testid="predict-outcome"
    >
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <Target className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
        <h3 className="m-0 text-sm font-semibold text-foreground">
          Predict the outcome
        </h3>
      </header>

      <div className="space-y-3 p-4">
        <p className="rounded-xl border border-border/60 bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-foreground">
          {scenario}
        </p>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {question}
        </p>

        <div className="space-y-2">
          {options.map((opt, i) => {
            const isChoice = choice === i;
            const showCorrect = answered && opt.correct;
            const showWrongChoice = answered && isChoice && !opt.correct;
            return (
              <button
                key={i}
                type="button"
                onClick={() => pick(i)}
                disabled={answered}
                aria-pressed={isChoice}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-xl border p-3 text-left transition-colors",
                  !answered && "border-border bg-surface-2 hover:border-accent/40",
                  showCorrect && "border-success/50 bg-success/[0.08]",
                  showWrongChoice && "border-destructive/50 bg-destructive/[0.08]",
                  answered && !opt.correct && !isChoice && "border-border bg-surface-2 opacity-60",
                )}
                data-testid={`predict-option-${i}`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {showCorrect ? (
                    <Check className="h-3.5 w-3.5 flex-shrink-0 text-success" aria-hidden />
                  ) : showWrongChoice ? (
                    <X className="h-3.5 w-3.5 flex-shrink-0 text-destructive" aria-hidden />
                  ) : null}
                  {opt.label}
                </span>
                {answered ? (
                  <span className="bp-anim-rise text-xs leading-relaxed text-muted-foreground">
                    {opt.result}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {answered ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span
              className={cn(
                "text-xs font-semibold",
                gotItRight ? "text-success" : "text-warning",
              )}
            >
              {gotItRight ? "Nice — that's right." : "Not quite — see the highlighted answer."}
            </span>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              data-testid="predict-reset"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Try again
            </button>
          </div>
        ) : null}

        {answered && takeaway ? (
          <p className="bp-anim-rise rounded-xl border border-accent/20 bg-accent/[0.05] px-3 py-2.5 text-xs leading-relaxed text-foreground/90">
            {takeaway}
          </p>
        ) : null}
      </div>
    </section>
  );
}

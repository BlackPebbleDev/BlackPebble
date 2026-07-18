import { useState } from "react";
import { Check, X, RotateCcw, GraduationCap, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LessonQuiz } from "@/lib/education/types";
import {
  isAnswerCorrect,
  scoreQuiz,
  correctAnswerIndices,
} from "@/lib/education/interactive/quiz-logic";

/**
 * Lightweight knowledge-check renderer over the LessonQuiz seam. Supports
 * single-choice, boolean, and multiple-choice questions with per-question
 * explanations, retry, and a final score. Completion fires on submission of the
 * last question (a perfect score is not required to complete).
 */
export function QuizShell({
  quiz,
  onComplete,
  onEvent,
  testId = "quiz",
}: {
  quiz: LessonQuiz;
  onComplete?: () => void;
  onEvent?: (type: "started" | "answered" | "completed") => void;
  testId?: string;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const [started, setStarted] = useState(false);

  const question = quiz.questions[index];
  const isMulti = (question?.kind ?? "single") === "multiple";
  const selected = answers[question?.id ?? ""] ?? [];
  const isRevealed = !!revealed[question?.id ?? ""];
  const correctSet = new Set(question ? correctAnswerIndices(question) : []);

  function ensureStarted() {
    if (!started) {
      setStarted(true);
      onEvent?.("started");
    }
  }

  function toggleOption(optionIndex: number) {
    if (isRevealed) return;
    ensureStarted();
    setAnswers((prev) => {
      const current = prev[question.id] ?? [];
      if (isMulti) {
        const next = current.includes(optionIndex)
          ? current.filter((i) => i !== optionIndex)
          : [...current, optionIndex];
        return { ...prev, [question.id]: next };
      }
      return { ...prev, [question.id]: [optionIndex] };
    });
  }

  function submit() {
    if (selected.length === 0) return;
    setRevealed((prev) => ({ ...prev, [question.id]: true }));
    onEvent?.("answered");
    if (index === quiz.questions.length - 1) {
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
    const score = scoreQuiz(quiz.questions, answers);
    const pct = Math.round(score.ratio * 100);
    return (
      <div
        className="rounded-2xl border border-accent/20 bg-card p-5 text-center shadow-card"
        data-testid={`${testId}-summary`}
      >
        <GraduationCap className="mx-auto h-8 w-8 text-accent" aria-hidden />
        <div className="mt-2 text-lg font-bold text-foreground">
          {score.correct} / {score.total} correct
        </div>
        <div className="text-sm text-muted-foreground">{pct}% this attempt</div>
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

  if (!question) return null;

  return (
    <section
      className="rounded-2xl border border-accent/20 bg-card shadow-card"
      aria-label={quiz.title ?? "Knowledge check"}
      data-testid={testId}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-accent" aria-hidden />
          <h3 className="m-0 text-sm font-semibold text-foreground">
            {quiz.title ?? "Knowledge check"}
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {index + 1} / {quiz.questions.length}
        </span>
      </header>

      <div className="space-y-3 p-4">
        <p className="text-sm font-medium text-foreground">{question.prompt}</p>
        {isMulti ? (
          <p className="text-[11px] text-muted-foreground">Select all that apply.</p>
        ) : null}

        <div role="group" className="space-y-2">
          {question.options.map((opt, i) => {
            const isSelected = selected.includes(i);
            const isCorrect = correctSet.has(i);
            const showState = isRevealed && (isSelected || isCorrect);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleOption(i)}
                aria-pressed={isSelected}
                disabled={isRevealed}
                data-testid={`${testId}-option-${i}`}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  !isRevealed && isSelected
                    ? "border-accent/50 bg-accent/10 text-foreground"
                    : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
                  showState && isCorrect && "border-success/50 bg-success/10 text-success",
                  showState && !isCorrect && isSelected && "border-destructive/50 bg-destructive/10 text-destructive",
                )}
              >
                <span className="min-w-0">{opt}</span>
                {showState && isCorrect ? (
                  <Check className="h-4 w-4 flex-shrink-0" aria-hidden />
                ) : null}
                {showState && !isCorrect && isSelected ? (
                  <X className="h-4 w-4 flex-shrink-0" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>

        {isRevealed ? (
          <div
            className={cn(
              "rounded-lg border p-3 text-xs leading-relaxed",
              isAnswerCorrect(question, selected)
                ? "border-success/30 bg-success/10 text-success"
                : "border-amber-500/30 bg-amber-500/10 text-amber-200/90",
            )}
            data-testid={`${testId}-explanation`}
          >
            <span className="font-semibold">
              {isAnswerCorrect(question, selected) ? "Correct. " : "Not quite. "}
            </span>
            {question.explanation}
          </div>
        ) : null}

        <div className="flex justify-end">
          {isRevealed ? (
            index < quiz.questions.length - 1 ? (
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
              Check answer
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

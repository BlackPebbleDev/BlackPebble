import { Link } from "wouter";
import { ArrowRight, PartyPopper, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { lessonPath } from "@/lib/education/routes";
import type { RelatedLessonRef } from "@/lib/education/normalize";

const CONFETTI = [
  { left: "8%", delay: "0s", cls: "text-accent" },
  { left: "22%", delay: "0.12s", cls: "text-success" },
  { left: "38%", delay: "0.05s", cls: "text-warning" },
  { left: "54%", delay: "0.2s", cls: "text-accent" },
  { left: "68%", delay: "0.09s", cls: "text-success" },
  { left: "82%", delay: "0.16s", cls: "text-warning" },
  { left: "92%", delay: "0.03s", cls: "text-accent" },
];

/**
 * Celebration shown the moment a lesson is completed. It rewards *real*
 * understanding (finishing the lesson) with a warm, low-key moment and, most
 * importantly, removes the "what now?" question by surfacing the next lesson
 * prominently. Confetti is decorative and disabled under reduced motion (CSS).
 */
export function LessonCelebration({
  next,
  pathTitle,
  pathCompleted,
  pathTotal,
  className,
}: {
  next?: RelatedLessonRef;
  pathTitle?: string;
  pathCompleted?: number;
  pathTotal?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bp-anim-pop relative overflow-hidden rounded-2xl border border-success/30 bg-success/[0.07] p-5",
        className,
      )}
      role="status"
      data-testid="lesson-celebration"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-full" aria-hidden>
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className={cn("bp-confetti-piece absolute top-0 h-2 w-1.5 rounded-sm", c.cls)}
            style={{ left: c.left, animationDelay: c.delay, backgroundColor: "currentColor" }}
          />
        ))}
      </div>

      <div className="relative flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-success/15">
          <PartyPopper className="h-5 w-5 text-success" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-foreground">Lesson complete</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Nice work. You understand this one. Keep the momentum going.
          </p>

          {pathTitle && pathTotal ? (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-success" aria-hidden /> {pathTitle}
                </span>
                <span>
                  {pathCompleted} of {pathTotal}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-success transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${Math.round(((pathCompleted ?? 0) / pathTotal) * 100)}%` }}
                />
              </div>
            </div>
          ) : null}

          {next ? (
            <Link
              href={lessonPath(next.categoryId, next.slug)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
              data-testid="celebration-next"
            >
              Next: {next.title}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import { Link } from "wouter";
import { Check, Circle, Flag, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressRing } from "./progress-ring";
import { lessonPath } from "@/lib/education/routes";
import type { Milestone } from "@/lib/education/milestones";
import type { RelatedLessonRef } from "@/lib/education/normalize";

/**
 * The learner's journey at a glance: a visual map of the beginner path with
 * completed checkpoints filled in, plus milestone rewards for real learning
 * actions. Designed to make progress feel earned and to always answer
 * "what should I do next?".
 */
export function AcademyJourney({
  pathTitle,
  pathSlug,
  steps,
  isCompleted,
  resumeIndex,
  pct,
  milestones,
}: {
  pathTitle: string;
  pathSlug: string;
  steps: RelatedLessonRef[];
  isCompleted: (slug: string) => boolean;
  resumeIndex: number;
  pct: number;
  milestones: Milestone[];
}) {
  const earned = milestones.filter((m) => m.done).length;
  const nextMilestone = milestones.find((m) => m.next);

  return (
    <section
      className="rounded-2xl bg-card p-4 shadow-card sm:p-5"
      aria-label="Your learning journey"
      data-testid="academy-journey"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ProgressRing value={pct} tone={pct >= 100 ? "success" : "accent"} size={48} />
          <div>
            <h2 className="text-base font-semibold text-foreground sm:text-lg">
              Your journey
            </h2>
            <p className="text-xs text-muted-foreground">
              {pct >= 100
                ? "Beginner Essentials complete — nicely done."
                : `${pct}% through ${pathTitle}`}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Trophy className="h-3 w-3 text-accent" aria-hidden /> {earned}/{milestones.length}
        </span>
      </div>

      {/* Checkpoint track */}
      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar" aria-hidden>
        {steps.map((step, i) => {
          const done = isCompleted(step.slug);
          const isCurrent = i === resumeIndex;
          return (
            <Link
              key={step.slug}
              href={lessonPath(step.categoryId, step.slug)}
              title={step.title}
              className={cn(
                "flex h-7 min-w-7 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-colors",
                done
                  ? "border-success/40 bg-success/15 text-success"
                  : isCurrent
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface-2 text-muted-foreground hover:border-accent/40",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </Link>
          );
        })}
      </div>

      {/* Next goal */}
      {nextMilestone ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/[0.05] px-3.5 py-2.5">
          <Flag className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 text-xs">
            <span className="font-semibold text-foreground">Next goal: </span>
            <span className="text-muted-foreground">
              {nextMilestone.label} — {nextMilestone.description}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/25 bg-success/[0.07] px-3.5 py-2.5 text-xs text-foreground">
          <Sparkles className="h-4 w-4 flex-shrink-0 text-success" aria-hidden />
          Every milestone earned. You've got the fundamentals down.
        </div>
      )}

      {/* Milestones */}
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {milestones.map((m) => (
          <li
            key={m.id}
            className={cn(
              "flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs",
              m.done ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {m.done ? (
              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-success" aria-hidden />
            ) : (
              <Circle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40" aria-hidden />
            )}
            <span className={cn(m.done && "font-medium")}>{m.label}</span>
          </li>
        ))}
      </ul>

      <Link
        href={`/learn/path/${pathSlug}`}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent/80"
      >
        View the full path
      </Link>
    </section>
  );
}

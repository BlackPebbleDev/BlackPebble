import { useEffect, useMemo } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  GraduationCap,
  Home,
  PlayCircle,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { getLearningPath } from "@/lib/education/learning-paths";
import { getLessonRef } from "@/lib/education/registry";
import { academyHomePath, lessonPath } from "@/lib/education/routes";
import { usePathMeta } from "@/lib/education/use-academy-meta";
import { useAcademyProgress } from "@/lib/education/use-progress";
import {
  DifficultyBadge,
  EstimatedTime,
} from "@/components/education/lesson-meta";
import {
  trackAcademyPathStarted,
  trackAcademyPathStepViewed,
  trackAcademyPathCompleted,
  trackAcademyViewed,
} from "@/lib/analytics";
import type { RelatedLessonRef } from "@/lib/education/normalize";

export default function LearnPathPage({
  params,
}: {
  params: { slug: string };
}) {
  const path = getLearningPath(params.slug);
  usePathMeta(path);
  const progress = useAcademyProgress();

  const steps = useMemo<RelatedLessonRef[]>(
    () =>
      (path?.lessonSlugs ?? [])
        .map((slug) => getLessonRef(slug))
        .filter((r): r is RelatedLessonRef => !!r),
    [path],
  );

  const completedCount = useMemo(
    () => steps.filter((s) => progress.isLessonCompleted(s.slug)).length,
    [steps, progress],
  );
  const total = steps.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  // First not-yet-completed step is the resume target; fall back to the first.
  const resumeIndex = steps.findIndex((s) => !progress.isLessonCompleted(s.slug));
  const resume = resumeIndex >= 0 ? steps[resumeIndex] : steps[0];
  const started = !!(path && progress.getPathProgress(path.id)?.started);

  useEffect(() => {
    if (path) {
      trackAcademyViewed({ sourceSurface: "learning-path", learningPathId: path.id });
    }
  }, [path]);

  // Mark the path completed once every step is done (fires once per session).
  useEffect(() => {
    if (path && total > 0 && completedCount === total) {
      progress.markPathCompleted(path.id);
      trackAcademyPathCompleted({
        learningPathId: path.id,
        completionType: "path",
      });
    }
  }, [path, total, completedCount, progress]);

  if (!path) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
          <GraduationCap className="h-6 w-6 text-accent" aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-foreground">Path not found</h1>
        <p className="text-sm text-muted-foreground">
          That learning path does not exist. Browse the Academy to find a topic.
        </p>
        <Link
          href={academyHomePath()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/15"
        >
          Back to Academy
        </Link>
      </div>
    );
  }

  function onStart() {
    if (!path || !resume) return;
    progress.markPathStarted(path.id);
    trackAcademyPathStarted({ learningPathId: path.id, difficulty: path.difficulty });
  }

  function onStepClick(step: RelatedLessonRef, index: number) {
    if (!path) return;
    trackAcademyPathStepViewed({
      learningPathId: path.id,
      stepId: step.slug,
      lessonSlug: step.slug,
      categoryId: step.categoryId,
      sourceSurface: "learning-path",
    });
    void index;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-5 sm:py-6 md:px-6 pb-24 md:pb-10 min-w-0">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <li>
            <Link href={academyHomePath()} className="hover:text-foreground">
              <span className="inline-flex items-center gap-1">
                <Home className="h-3 w-3" aria-hidden /> Academy
              </span>
            </Link>
          </li>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <li className="truncate text-foreground" aria-current="page">
            {path.title}
          </li>
        </ol>
      </nav>

      <PageHeader
        icon={GraduationCap}
        title={path.title}
        subtitle={<p>{path.description}</p>}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <DifficultyBadge difficulty={path.difficulty} />
        <EstimatedTime minutes={path.estimatedMinutes} />
        <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {path.audience}
        </span>
        <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {total} lessons
        </span>
      </div>

      {/* Progress + resume */}
      <div className="rounded-2xl bg-card p-4 shadow-card sm:p-5">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-foreground">
            {completedCount} of {total} complete
          </span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Path progress"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {resume ? (
            <Link
              href={lessonPath(resume.categoryId, resume.slug)}
              onClick={onStart}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/15"
              data-testid="path-resume"
            >
              <PlayCircle className="h-4 w-4" aria-hidden />
              {completedCount === 0
                ? "Start path"
                : completedCount === total
                  ? "Review path"
                  : `Resume: ${resume.title}`}
            </Link>
          ) : null}
          {started && completedCount > 0 && completedCount < total ? (
            <Link
              href={lessonPath(steps[0].categoryId, steps[0].slug)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Start over
            </Link>
          ) : null}
        </div>
      </div>

      {/* Outcomes */}
      {path.outcomes.length > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/60 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground/80">
            <Target className="h-3.5 w-3.5 text-accent" aria-hidden /> By the end you'll be able to
          </div>
          <ul className="space-y-1.5">
            {path.outcomes.map((o, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden />
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Step sequence */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/80">
          Lesson sequence
        </h2>
        <ol className="space-y-2">
          {steps.map((step, i) => {
            const done = progress.isLessonCompleted(step.slug);
            const isCurrent = i === resumeIndex;
            return (
              <li key={step.slug}>
                <Link
                  href={lessonPath(step.categoryId, step.slug)}
                  onClick={() => onStepClick(step, i)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-card/60 px-3 py-3 transition-colors hover:border-accent/30",
                    isCurrent ? "border-accent/40" : "border-border/60",
                  )}
                  data-testid={`path-step-${step.slug}`}
                >
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-semibold text-muted-foreground">
                    {done ? (
                      <Check className="h-4 w-4 text-accent" aria-hidden />
                    ) : (
                      <span aria-hidden>{i + 1}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {step.title}
                    </span>
                    {isCurrent ? (
                      <span className="text-[11px] font-medium text-accent">
                        Current step
                      </span>
                    ) : null}
                  </span>
                  {done ? (
                    <Check className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
                  ) : (
                    <Circle className="h-4 w-4 flex-shrink-0 text-muted-foreground/40" aria-hidden />
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Final action */}
      {path.finalActionPath ? (
        <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4 sm:p-5">
          <div className="text-sm font-semibold text-foreground">
            Ready to apply it?
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Finish by practicing with no real funds at risk.
          </p>
          <Link
            href={path.finalActionPath}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            data-testid="path-final-action"
          >
            {path.finalActionLabel ?? "Continue"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

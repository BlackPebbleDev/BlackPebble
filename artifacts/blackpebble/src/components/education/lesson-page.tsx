import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  ExternalLink,
  Home,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  academyHomePath,
  categoryPath,
  lessonPath,
} from "@/lib/education/routes";
import { LessonCalloutBox } from "@/components/education/lesson-body";
import {
  ChainScopeBadge,
  DifficultyBadge,
  EstimatedTime,
  LessonKindBadge,
} from "@/components/education/lesson-meta";
import { getChain } from "@/lib/education/chains";
import {
  InteractiveModule,
  hasInteractiveModule,
} from "@/components/education/interactive/registry";
import {
  trackAcademyInteractiveStarted,
  trackAcademyRelatedFeatureClicked,
  trackAcademyRelatedLessonClicked,
  trackAcademyShareClicked,
} from "@/lib/analytics";
import type { NormalizedLesson, RelatedLessonRef } from "@/lib/education/normalize";

function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/80">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function LessonPageView({
  lesson,
  prev,
  next,
}: {
  lesson: NormalizedLesson;
  prev?: RelatedLessonRef;
  next?: RelatedLessonRef;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [shared, setShared] = useState(false);

  const baseSections = useMemo(
    () => lesson.sections.filter((s) => !s.advanced),
    [lesson.sections],
  );
  const advancedSections = useMemo(
    () => lesson.sections.filter((s) => s.advanced),
    [lesson.sections],
  );

  async function onShare() {
    trackAcademyShareClicked({
      lessonSlug: lesson.slug,
      categoryId: lesson.categoryId,
      sourceSurface: "lesson-page",
    });
    const url = `${window.location.origin}${lessonPath(
      lesson.categoryId,
      lesson.slug,
    )}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: lesson.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        window.setTimeout(() => setShared(false), 1800);
      }
    } catch {
      // user cancelled share or clipboard blocked; ignore.
    }
  }

  const hasInteractive =
    lesson.interactiveModule && hasInteractiveModule(lesson.interactiveModule);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6 px-4 py-5 sm:py-6 md:px-6 mx-auto pb-24 md:pb-10 min-w-0">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <li>
            <Link href={academyHomePath()} className="hover:text-foreground" data-testid="breadcrumb-academy">
              <span className="inline-flex items-center gap-1">
                <Home className="h-3 w-3" aria-hidden /> Academy
              </span>
            </Link>
          </li>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <li className="min-w-0">
            <Link
              href={categoryPath(lesson.categoryId)}
              className="truncate hover:text-foreground"
              data-testid="breadcrumb-category"
            >
              {lesson.categoryTitle}
            </Link>
          </li>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <li className="truncate text-foreground" aria-current="page">
            {lesson.title}
          </li>
        </ol>
      </nav>

      {/* Header */}
      <header className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {lesson.title}
        </h1>
        {lesson.shortAnswer ? (
          <p className="text-base leading-relaxed text-muted-foreground">
            {lesson.shortAnswer}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <LessonKindBadge kind={lesson.kind} />
          {lesson.chainScope ? <ChainScopeBadge scope={lesson.chainScope} /> : null}
          {lesson.difficulty ? (
            <DifficultyBadge difficulty={lesson.difficulty} />
          ) : null}
          {lesson.estimatedMinutes ? (
            <EstimatedTime minutes={lesson.estimatedMinutes} />
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onShare}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            data-testid="lesson-share"
          >
            {shared ? (
              <>
                <Check className="h-3.5 w-3.5 text-accent" aria-hidden /> Copied
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" aria-hidden /> Share
              </>
            )}
          </button>
          {lesson.updatedAt ? (
            <span className="text-[11px] text-muted-foreground/70">
              Updated {lesson.updatedAt}
            </span>
          ) : null}
        </div>
      </header>

      {/* Learning objectives */}
      {lesson.learningObjectives.length > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/60 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground/80">
            <BookOpen className="h-3.5 w-3.5 text-accent" aria-hidden /> What you'll learn
          </div>
          <ul className="space-y-1.5">
            {lesson.learningObjectives.map((obj, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden />
                <span>{obj}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Prerequisites */}
      {lesson.prerequisites.length > 0 ? (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground/80">Before this: </span>
          {lesson.prerequisites.map((p, i) => (
            <span key={p.slug}>
              <Link
                href={lessonPath(p.categoryId, p.slug)}
                className="text-accent hover:text-accent/80"
              >
                {p.title}
              </Link>
              {i < lesson.prerequisites.length - 1 ? ", " : ""}
            </span>
          ))}
        </div>
      ) : null}

      {/* Base content sections */}
      <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
        {baseSections.map((s) => (
          <Section key={s.kind + s.title} title={s.title}>
            <p className="whitespace-pre-line">{s.body}</p>
          </Section>
        ))}
      </div>

      {/* Interactive module */}
      {hasInteractive ? (
        <div onPointerDown={() => trackAcademyInteractiveStarted()}>
          <InteractiveModule id={lesson.interactiveModule!} />
        </div>
      ) : null}

      {/* Examples */}
      {lesson.examples.length > 0 ? (
        <Section title="Examples">
          <div className="space-y-2">
            {lesson.examples.map((ex, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-surface-2 p-3 text-sm text-foreground"
              >
                {ex}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Common mistakes */}
      {lesson.commonMistakes.length > 0 ? (
        <Section title="Common mistakes">
          <ul className="space-y-1.5">
            {lesson.commonMistakes.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-destructive" aria-hidden />
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Chain differences */}
      {lesson.chainModules.length > 0 ? (
        <Section title="Chain differences">
          <div className="space-y-2">
            {lesson.chainModules.map((mod, i) => {
              const chain = getChain(mod.chain);
              return (
                <div key={i} className="rounded-xl border border-border/60 bg-card/60 p-3">
                  <div className="mb-1 text-xs font-semibold text-foreground">
                    {mod.title ?? chain?.displayName ?? mod.chain}
                  </div>
                  <p className="text-sm text-muted-foreground">{mod.body}</p>
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      {/* Callouts */}
      {lesson.callouts.length > 0 ? (
        <div className="space-y-2">
          {lesson.callouts.map((c, i) => (
            <LessonCalloutBox key={i} callout={c} />
          ))}
        </div>
      ) : null}

      {/* Advanced (progressive disclosure) */}
      {advancedSections.length > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/60">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-foreground"
          >
            Advanced details
            <ChevronRight
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform motion-reduce:transition-none",
                showAdvanced && "rotate-90",
              )}
              aria-hidden
            />
          </button>
          {showAdvanced ? (
            <div className="space-y-4 border-t border-border/60 px-4 py-4 text-sm leading-relaxed text-muted-foreground">
              {advancedSections.map((s) => (
                <Section key={s.kind + s.title} title={s.title}>
                  <p className="whitespace-pre-line">{s.body}</p>
                </Section>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Related features */}
      {lesson.relatedFeatures.length > 0 ? (
        <Section title="Try it in BlackPebble">
          <div className="flex flex-wrap gap-2">
            {lesson.relatedFeatures.map((f) => (
              <Link
                key={f.path}
                href={f.path}
                onClick={() =>
                  trackAcademyRelatedFeatureClicked({
                    lessonSlug: lesson.slug,
                    categoryId: lesson.categoryId,
                    sourceSurface: "lesson-page",
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
                data-testid={`lesson-feature-${f.path}`}
              >
                {f.label}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Related lessons */}
      {lesson.relatedLessons.length > 0 ? (
        <Section title="Related lessons">
          <div className="grid gap-2 sm:grid-cols-2">
            {lesson.relatedLessons.map((r) => (
              <Link
                key={r.slug}
                href={lessonPath(r.categoryId, r.slug)}
                onClick={() =>
                  trackAcademyRelatedLessonClicked({
                    lessonSlug: r.slug,
                    categoryId: r.categoryId,
                    sourceSurface: "lesson-page",
                  })
                }
                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-sm text-foreground transition-colors hover:border-accent/30"
                data-testid={`related-lesson-${r.slug}`}
              >
                <span className="truncate">{r.title}</span>
                <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Sources */}
      {lesson.sources.length > 0 ? (
        <Section title="Sources and methodology">
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {lesson.sources.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5">
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-accent hover:text-accent/80"
                  >
                    {s.label}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  <span className="text-foreground/80">{s.label}</span>
                )}
                {s.note ? <span> — {s.note}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Prev / next */}
      {(prev || next) ? (
        <div className="flex items-stretch justify-between gap-3 border-t border-border/60 pt-4">
          {prev ? (
            <Link
              href={lessonPath(prev.categoryId, prev.slug)}
              className="group flex min-w-0 flex-1 flex-col rounded-xl border border-border/60 bg-card/60 p-3 transition-colors hover:border-accent/30"
              data-testid="lesson-prev"
            >
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <ArrowLeft className="h-3 w-3" aria-hidden /> Previous
              </span>
              <span className="truncate text-sm font-medium text-foreground">
                {prev.title}
              </span>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
          {next ? (
            <Link
              href={lessonPath(next.categoryId, next.slug)}
              className="group flex min-w-0 flex-1 flex-col items-end rounded-xl border border-border/60 bg-card/60 p-3 text-right transition-colors hover:border-accent/30"
              data-testid="lesson-next"
            >
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                Next <ArrowRight className="h-3 w-3" aria-hidden />
              </span>
              <span className="truncate text-sm font-medium text-foreground">
                {next.title}
              </span>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
        </div>
      ) : null}
    </div>
  );
}

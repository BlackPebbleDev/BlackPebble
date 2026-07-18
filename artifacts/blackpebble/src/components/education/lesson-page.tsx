import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Home,
  Lightbulb,
  ListTree,
  Route as RouteIcon,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  academyHomePath,
  categoryPath,
  learningPathPath,
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
  InteractiveModuleHost,
  hasInteractiveModule,
} from "@/components/education/interactive/registry";
import { QuizShell } from "@/components/education/interactive/shared/quiz-shell";
import { LessonDiagram } from "@/components/education/diagrams";
import { LessonStoryCard } from "@/components/education/lesson-story";
import { LessonCelebration } from "@/components/education/lesson-celebration";
import { ProgressRing } from "@/components/education/progress-ring";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { academyProgress } from "@/lib/education/progress";
import { useAcademyProgress } from "@/lib/education/use-progress";
import {
  computePathCompletion,
  getPathForLesson,
} from "@/lib/education/learning-paths";
import { getCategoryById, getLessonRef } from "@/lib/education/registry";
import {
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

interface OutlineItem {
  id: string;
  label: string;
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
  // Mobile-only navigation surfaces: a learning-path drawer and an outline sheet.
  const [pathSheetOpen, setPathSheetOpen] = useState(false);
  const [outlineSheetOpen, setOutlineSheetOpen] = useState(false);
  // Sticky reading-progress used by the mobile floating contents button.
  const [readPct, setReadPct] = useState(0);
  const progress = useAcademyProgress();
  const completed = progress.isLessonCompleted(lesson.slug);
  const bookmarked = progress.isBookmarked(lesson.slug);

  const baseSections = useMemo(
    () => lesson.sections.filter((s) => !s.advanced && s.kind !== "stakes"),
    [lesson.sections],
  );
  const stakesSections = useMemo(
    () => lesson.sections.filter((s) => !s.advanced && s.kind === "stakes"),
    [lesson.sections],
  );
  const advancedSections = useMemo(
    () => lesson.sections.filter((s) => s.advanced),
    [lesson.sections],
  );

  const topDiagrams = useMemo(
    () => lesson.diagrams.filter((d) => (d.placement ?? "top") === "top"),
    [lesson.diagrams],
  );
  const inlineDiagrams = useMemo(
    () => lesson.diagrams.filter((d) => d.placement === "inline"),
    [lesson.diagrams],
  );

  const interactiveModules = useMemo(
    () => lesson.interactiveModules.filter((m) => hasInteractiveModule(m.id)),
    [lesson.interactiveModules],
  );

  const hasQuiz = !!lesson.quiz && lesson.quiz.questions.length > 0;

  // Path context for the left rail + celebration progress.
  const path = getPathForLesson(lesson.slug);
  const pathSteps = useMemo<RelatedLessonRef[]>(
    () =>
      (path?.lessonSlugs ?? [])
        .map((s) => getLessonRef(s))
        .filter((r): r is RelatedLessonRef => !!r),
    [path],
  );
  const pathCompletion = useMemo(
    () =>
      path
        ? computePathCompletion(path.lessonSlugs, (s) =>
            progress.isLessonCompleted(s),
          )
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, progress.getSnapshotToken()],
  );

  const category = getCategoryById(lesson.categoryId);

  // Build the "on this page" outline for the right rail.
  const outline = useMemo<OutlineItem[]>(() => {
    const items: OutlineItem[] = [];
    for (const s of baseSections) items.push({ id: `s-${s.kind}`, label: s.title });
    if (stakesSections.length) items.push({ id: "s-stakes", label: "If you ignore this" });
    if (lesson.story) items.push({ id: "s-story", label: "Story" });
    if (interactiveModules.length) items.push({ id: "s-interactive", label: "Try it" });
    if (hasQuiz) items.push({ id: "s-quiz", label: "Knowledge check" });
    if (lesson.tips.length) items.push({ id: "s-tips", label: "Beginner tips" });
    if (lesson.commonMistakes.length) items.push({ id: "s-mistakes", label: "Common mistakes" });
    if (lesson.relatedLessons.length) items.push({ id: "s-related", label: "Related lessons" });
    return items;
  }, [baseSections, stakesSections, lesson.story, interactiveModules.length, hasQuiz, lesson.tips.length, lesson.commonMistakes.length, lesson.relatedLessons.length]);

  const currentStepIndex = useMemo(
    () => pathSteps.findIndex((s) => s.slug === lesson.slug),
    [pathSteps, lesson.slug],
  );

  // Close mobile drawers whenever the lesson changes (e.g. tapping a step link).
  useEffect(() => {
    setPathSheetOpen(false);
    setOutlineSheetOpen(false);
  }, [lesson.slug]);

  // Track how far through the lesson the reader has scrolled (mobile progress).
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop;
      const height = doc.scrollHeight - doc.clientHeight;
      setReadPct(height > 0 ? Math.min(100, Math.max(0, (scrollTop / height) * 100)) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [lesson.slug]);

  function jumpToSection(id: string) {
    setOutlineSheetOpen(false);
    // Wait for the sheet close animation to release scroll lock before jumping.
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 60);
  }

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

  // Learning-path / category navigation, shared by the desktop left rail and
  // the mobile drawer so both stay in sync.
  const railContent = (
    <div className="space-y-5">
      {path ? (
            <div>
              <Link
                href={learningPathPath(path.slug)}
                className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent hover:text-accent/80"
              >
                <RouteIcon className="h-3.5 w-3.5" aria-hidden /> {path.title}
              </Link>
              {pathCompletion ? (
                <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${pathCompletion.pct}%` }}
                    />
                  </div>
                  <span>{pathCompletion.pct}%</span>
                </div>
              ) : null}
              <ol className="space-y-0.5">
                {pathSteps.map((step, i) => {
                  const isCurrent = step.slug === lesson.slug;
                  const done = progress.isLessonCompleted(step.slug);
                  return (
                    <li key={step.slug}>
                      <Link
                        href={lessonPath(step.categoryId, step.slug)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors",
                          isCurrent
                            ? "bg-accent/10 font-semibold text-foreground"
                            : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                        )}
                        aria-current={isCurrent ? "page" : undefined}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                            done
                              ? "bg-accent/20 text-accent"
                              : isCurrent
                                ? "bg-accent text-accent-foreground"
                                : "bg-surface-2 text-muted-foreground",
                          )}
                        >
                          {done ? <Check className="h-2.5 w-2.5" aria-hidden /> : i + 1}
                        </span>
                        <span className="truncate">{step.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : category ? (
            <div>
              <Link
                href={categoryPath(category.id)}
                className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-accent hover:text-accent/80"
              >
                {category.title}
              </Link>
              <ol className="space-y-0.5">
                {category.lessons.map((l) => {
                  const isCurrent = l.slug === lesson.slug;
                  return (
                    <li key={l.slug}>
                      <Link
                        href={lessonPath(category.id, l.slug)}
                        className={cn(
                          "block truncate rounded-lg px-2 py-1.5 text-xs transition-colors",
                          isCurrent
                            ? "bg-accent/10 font-semibold text-foreground"
                            : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                        )}
                        aria-current={isCurrent ? "page" : undefined}
                      >
                        {l.title}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>
      ) : null}
    </div>
  );

  const railTitle = path?.title ?? category?.title;
  const canJump = outline.length > 1;

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-5 sm:py-6 md:px-6 pb-24 md:pb-10 min-w-0 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[220px_minmax(0,1fr)_230px]">
      {/* Left rail: learning path / category context (desktop only) */}
      <aside className="hidden lg:block">
        <div className="sticky top-20">{railContent}</div>
      </aside>

      {/* Center: lesson content */}
      <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-6 lg:max-w-none">
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

        {/* Mobile navigation toolbar: path drawer + on-this-page (hidden on desktop) */}
        {(railTitle || canJump) ? (
          <div className="flex items-stretch gap-2 lg:hidden">
            {railTitle ? (
              <button
                type="button"
                onClick={() => setPathSheetOpen(true)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-left transition-colors active:bg-surface-2"
                data-testid="mobile-path-open"
              >
                <RouteIcon className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {railTitle}
                  </span>
                  {path && currentStepIndex >= 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      Step {currentStepIndex + 1} of {pathSteps.length}
                      {pathCompletion ? ` · ${pathCompletion.pct}% done` : ""}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Browse lessons</span>
                  )}
                </span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ) : null}
            {canJump ? (
              <button
                type="button"
                onClick={() => setOutlineSheetOpen(true)}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors active:bg-surface-2"
                data-testid="mobile-outline-open"
                aria-label="On this page"
              >
                <ListTree className="h-4 w-4" aria-hidden />
                <span>Contents</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Mobile path progress bar */}
        {path && pathCompletion ? (
          <div className="lg:hidden" aria-hidden>
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${pathCompletion.pct}%` }}
              />
            </div>
          </div>
        ) : null}

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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => progress.markLessonCompleted(lesson.slug)}
              aria-pressed={completed}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                completed
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
              data-testid="lesson-complete"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {completed ? "Completed" : "Mark complete"}
            </button>
            <button
              type="button"
              onClick={() => progress.toggleBookmark(lesson.slug)}
              aria-pressed={bookmarked}
              aria-label={bookmarked ? "Remove bookmark" : "Bookmark this lesson"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                bookmarked
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
              data-testid="lesson-bookmark"
            >
              {bookmarked ? (
                <BookmarkCheck className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Bookmark className="h-3.5 w-3.5" aria-hidden />
              )}
              {bookmarked ? "Saved" : "Save"}
            </button>
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

        {/* Top diagrams — understand before reading a paragraph */}
        {topDiagrams.length > 0 ? (
          <div className="space-y-3">
            {topDiagrams.map((d, i) => (
              <LessonDiagram key={`${d.id}-${i}`} diagram={d} />
            ))}
          </div>
        ) : null}

        {/* Base content sections */}
        <div className="space-y-6 text-[15px] leading-7 text-muted-foreground sm:text-sm sm:leading-relaxed">
          {baseSections.map((s) => (
            <Section key={s.kind + s.title} title={s.title} id={`s-${s.kind}`}>
              <p className="whitespace-pre-line">{s.body}</p>
            </Section>
          ))}
        </div>

        {/* Stakes — what happens if you ignore this */}
        {stakesSections.length > 0 ? (
          <div id="s-stakes" className="scroll-mt-24 space-y-2">
            {stakesSections.map((s) => (
              <div
                key={s.kind + s.title}
                className="rounded-xl border border-warning/30 bg-warning/[0.07] p-4"
              >
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {s.title}
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {/* Story */}
        {lesson.story ? (
          <div id="s-story" className="scroll-mt-24">
            <LessonStoryCard story={lesson.story} />
          </div>
        ) : null}

        {/* Inline diagrams */}
        {inlineDiagrams.length > 0 ? (
          <div className="space-y-3">
            {inlineDiagrams.map((d, i) => (
              <LessonDiagram key={`${d.id}-inline-${i}`} diagram={d} />
            ))}
          </div>
        ) : null}

        {/* Interactive modules (in order) */}
        {interactiveModules.length > 0 ? (
          <div id="s-interactive" className="scroll-mt-24 space-y-4">
            {interactiveModules.map((moduleRef) => (
              <InteractiveModuleHost
                key={moduleRef.id}
                lesson={lesson}
                moduleRef={moduleRef}
                sourceSurface="lesson-page"
              />
            ))}
          </div>
        ) : null}

        {/* Knowledge check */}
        {hasQuiz ? (
          <div id="s-quiz" className="scroll-mt-24">
            <QuizShell
              quiz={lesson.quiz!}
              onComplete={() =>
                academyProgress.markQuizCompleted(lesson.slug, lesson.quiz!.id)
              }
            />
          </div>
        ) : null}

        {/* Beginner tips */}
        {lesson.tips.length > 0 ? (
          <div id="s-tips" className="scroll-mt-24 rounded-xl border border-accent/20 bg-accent/[0.05] p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
              <Lightbulb className="h-3.5 w-3.5" aria-hidden /> Beginner tips
            </div>
            <ul className="space-y-1.5">
              {lesson.tips.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                  <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
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
          <Section title="Common mistakes" id="s-mistakes">
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
          <Section title="Related lessons" id="s-related">
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

        {/* Completion zone: prompt to complete, or celebrate + point to next */}
        {completed ? (
          <LessonCelebration
            next={next}
            pathTitle={path?.title}
            pathCompleted={pathCompletion?.completed}
            pathTotal={pathCompletion?.total}
          />
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-accent/20 bg-accent/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Finished this lesson?
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Mark it complete to track your progress and unlock the next step.
              </p>
            </div>
            <button
              type="button"
              onClick={() => progress.markLessonCompleted(lesson.slug)}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
              data-testid="lesson-complete-cta"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Mark complete
            </button>
          </div>
        )}

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

      {/* Right rail: outline + progress (desktop only) */}
      <aside className="hidden xl:block">
        <div className="sticky top-20 space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-3">
            <ProgressRing
              value={completed ? 100 : 0}
              tone={completed ? "success" : "accent"}
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">
                {completed ? "Completed" : "In progress"}
              </div>
              {lesson.estimatedMinutes ? (
                <div className="text-[11px] text-muted-foreground">
                  ~{lesson.estimatedMinutes} min read
                </div>
              ) : null}
            </div>
          </div>

          {outline.length > 1 ? (
            <nav aria-label="On this page">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <ListTree className="h-3.5 w-3.5" aria-hidden /> On this page
              </div>
              <ul className="space-y-0.5 border-l border-border/60">
                {outline.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="-ml-px block border-l border-transparent py-1 pl-3 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </aside>

      {/* Mobile floating contents button with sticky reading progress ring */}
      {canJump ? (
        <button
          type="button"
          onClick={() => setOutlineSheetOpen(true)}
          className="fixed bottom-20 right-4 z-30 grid h-12 w-12 place-items-center rounded-full border border-border bg-card/95 shadow-lg backdrop-blur transition-transform active:scale-95 lg:hidden"
          aria-label={`Lesson contents — ${Math.round(readPct)}% read`}
          data-testid="mobile-contents-fab"
        >
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 48 48" aria-hidden>
            <circle cx="24" cy="24" r="21" fill="none" strokeWidth="3" stroke="currentColor" className="text-border" />
            <circle
              cx="24"
              cy="24"
              r="21"
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              stroke="currentColor"
              className="text-accent transition-[stroke-dashoffset] duration-150 motion-reduce:transition-none"
              strokeDasharray={2 * Math.PI * 21}
              strokeDashoffset={2 * Math.PI * 21 * (1 - readPct / 100)}
            />
          </svg>
          {completed ? (
            <CheckCircle2 className="relative h-5 w-5 text-accent" aria-hidden />
          ) : (
            <ListTree className="relative h-5 w-5 text-accent" aria-hidden />
          )}
        </button>
      ) : null}

      {/* Mobile learning-path drawer */}
      <Sheet open={pathSheetOpen} onOpenChange={setPathSheetOpen}>
        <SheetContent side="left" className="w-[86%] max-w-sm overflow-y-auto p-5">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>{path ? "Learning path" : "In this category"}</SheetTitle>
          </SheetHeader>
          {railContent}
        </SheetContent>
      </Sheet>

      {/* Mobile on-this-page outline sheet */}
      <Sheet open={outlineSheetOpen} onOpenChange={setOutlineSheetOpen}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto rounded-t-2xl p-5">
          <SheetHeader className="mb-3 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <ListTree className="h-4 w-4 text-accent" aria-hidden /> On this page
            </SheetTitle>
          </SheetHeader>
          <ul className="space-y-0.5">
            {outline.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => jumpToSection(item.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors active:bg-surface-2 hover:text-foreground"
                >
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-accent/70" aria-hidden />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              progress.markLessonCompleted(lesson.slug);
              setOutlineSheetOpen(false);
            }}
            disabled={completed}
            className={cn(
              "mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
              completed
                ? "border border-accent/30 bg-accent/10 text-accent"
                : "bg-accent text-accent-foreground active:opacity-90",
            )}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {completed ? "Lesson completed" : "Mark complete"}
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

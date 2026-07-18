import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Bookmark,
  Clock,
  GraduationCap,
  Route as RouteIcon,
  Search,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ACADEMY_CATEGORIES,
  getCategoryForLesson,
  getInteractiveLessons,
  getLessonBySlug,
  getLessonRef,
  getNormalizedLesson,
} from "@/lib/education/registry";
import { computeMilestones } from "@/lib/education/milestones";
import { AcademyWelcome } from "@/components/education/academy-welcome";
import { AcademyJourney } from "@/components/education/academy-journey";
import type { RelatedLessonRef } from "@/lib/education/normalize";
import {
  searchLessons,
  classifyIntent,
  suggestQuery,
  popularLessonSlugs,
} from "@/lib/education/search";
import {
  computePathCompletion,
  getPublishedLearningPaths,
} from "@/lib/education/learning-paths";
import { useAcademyProgress } from "@/lib/education/use-progress";
import { categoryPath, learningPathPath, lessonPath } from "@/lib/education/routes";
import { AcademyCategorySection } from "@/components/education/academy-category";
import { CategoryGlyph } from "@/components/education/category-icon";
import {
  LessonCard,
  lessonCardData,
  type LessonCardData,
} from "@/components/education/lesson-card";
import type { CategoryLevel } from "@/lib/education/types";
import {
  trackAcademySearchPerformed,
  trackAcademySearchZeroResults,
  trackAcademyViewed,
} from "@/lib/analytics";

const OPEN_KEY = "bp-academy-open-categories";
const DEFAULT_OPEN = ["start-here"];

const LEVEL_LABELS: Record<CategoryLevel, string> = {
  beginner: "New to crypto",
  intermediate: "Developing traders",
  advanced: "Experienced traders",
};
function readOpenCategories(): string[] {
  try {
    const raw = sessionStorage.getItem(OPEN_KEY);
    if (!raw) return DEFAULT_OPEN;
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_OPEN;
  } catch {
    return DEFAULT_OPEN;
  }
}

function writeOpenCategories(ids: string[]) {
  try {
    sessionStorage.setItem(OPEN_KEY, JSON.stringify(ids));
  } catch {
    // ignore storage failures
  }
}

function toCardData(slug: string): LessonCardData | null {
  const lesson = getNormalizedLesson(slug);
  return lesson ? lessonCardData(lesson) : null;
}

function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h2 className="text-base font-semibold text-foreground sm:text-lg">
        {title}
      </h2>
      {action}
    </div>
  );
}

export default function LearnPage() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [openCategories, setOpenCategories] = useState<string[]>(DEFAULT_OPEN);
  const progress = useAcademyProgress();

  useEffect(() => {
    trackAcademyViewed({ sourceSurface: "academy-home" });
    setOpenCategories(readOpenCategories());
  }, []);

  useEffect(() => {
    writeOpenCategories(openCategories);
  }, [openCategories]);

  // Legacy hash compatibility: /learn#<lesson-slug> and /learn#<category-id>
  // resolve to the new dedicated routes.
  useEffect(() => {
    function resolveHash() {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      const lesson = getLessonBySlug(hash);
      if (lesson) {
        const category = getCategoryForLesson(hash);
        if (category) navigate(lessonPath(category.id, hash), { replace: true });
        return;
      }
      if (ACADEMY_CATEGORIES.some((c) => c.id === hash)) {
        navigate(categoryPath(hash), { replace: true });
      }
    }
    resolveHash();
    window.addEventListener("hashchange", resolveHash);
    return () => window.removeEventListener("hashchange", resolveHash);
  }, [navigate]);

  const trimmed = query.trim();
  const results = useMemo(
    () => (trimmed ? searchLessons(trimmed, 40) : []),
    [trimmed],
  );
  const suggestion = useMemo(
    () => (trimmed ? suggestQuery(trimmed) : undefined),
    [trimmed],
  );
  const popularCards = useMemo(
    () =>
      popularLessonSlugs()
        .map((slug) => toCardData(slug))
        .filter((c): c is LessonCardData => !!c),
    [],
  );

  useEffect(() => {
    if (!trimmed) return;
    const t = window.setTimeout(() => {
      const queryIntent = classifyIntent(trimmed);
      trackAcademySearchPerformed({
        queryLength: trimmed.length,
        resultCount: results.length,
        queryIntent,
        sourceSurface: "academy-home",
      });
      if (results.length === 0) {
        trackAcademySearchZeroResults({
          queryLength: trimmed.length,
          queryIntent,
          sourceSurface: "academy-home",
        });
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [trimmed, results.length]);

  function toggleCategory(id: string) {
    setOpenCategories((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  const beginnerPath = getPublishedLearningPaths()[0];
  const pathProgress = beginnerPath
    ? computePathCompletion(beginnerPath.lessonSlugs, (s) =>
        progress.isLessonCompleted(s),
      )
    : undefined;
  const summary = progress.getSummary();
  const journeySteps = useMemo<RelatedLessonRef[]>(
    () =>
      (beginnerPath?.lessonSlugs ?? [])
        .map((s) => getLessonRef(s))
        .filter((r): r is RelatedLessonRef => !!r),
    [beginnerPath],
  );
  const milestones = useMemo(
    () =>
      computeMilestones({
        summary,
        pathPct: pathProgress?.pct,
        pathComplete: pathProgress?.isComplete,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [progress.getSnapshotToken(), pathProgress?.pct, pathProgress?.isComplete],
  );
  const recentCards = useMemo(
    () =>
      progress
        .getRecent(4)
        .map((slug) => toCardData(slug))
        .filter((c): c is LessonCardData => !!c),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [progress.getSnapshotToken()],
  );
  const bookmarkCards = useMemo(
    () =>
      progress
        .listBookmarks()
        .slice(0, 4)
        .map((slug) => toCardData(slug))
        .filter((c): c is LessonCardData => !!c),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [progress.getSnapshotToken()],
  );

  const startHere = ACADEMY_CATEGORIES.find((c) => c.id === "start-here");
  const interactiveCount = useMemo(() => getInteractiveLessons().length, []);
  const featuredInteractive = useMemo(
    () =>
      getInteractiveLessons()
        .map((l) => toCardData(l.slug))
        .filter((c): c is LessonCardData => !!c),
    [],
  );
  const safetyLessons = useMemo(() => {
    const safetyCats = ["wallets-safety", "scam-awareness"];
    return ACADEMY_CATEGORIES.filter((c) => safetyCats.includes(c.id))
      .flatMap((c) => c.lessons.slice(0, 3))
      .map((l) => toCardData(l.slug))
      .filter((c): c is LessonCardData => !!c);
  }, []);

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:gap-7 md:px-6 sm:py-6 mx-auto pb-24 md:pb-10 min-w-0">
      <PageHeader
        icon={GraduationCap}
        title="BlackPebble Academy"
        subtitle={
          <div className="space-y-1">
            <p>
              Understand crypto, trade with more confidence, and practice safely.
            </p>
            <p className="text-xs text-muted-foreground/80">
              Built for beginners, useful for every trader. Currently focused on
              Solana, with multichain expansion built into the roadmap.
            </p>
          </div>
        }
      />

      {/* Search */}
      <div className="rounded-2xl bg-card shadow-card p-4 sm:p-5 space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search lessons, features, or terms"
            className="pl-9"
            aria-label="Search academy lessons"
            data-testid="input-academy-search"
          />
        </div>
        <div
          className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar"
          aria-label="Academy categories"
        >
          {ACADEMY_CATEGORIES.map((category) => (
            <Link
              key={category.id}
              href={categoryPath(category.id)}
              className="flex-shrink-0 rounded-full border border-border bg-surface-2 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors whitespace-nowrap hover:text-foreground hover:border-accent/30"
              data-testid={`academy-pill-${category.id}`}
            >
              {category.title}
            </Link>
          ))}
        </div>
      </div>

      {trimmed ? (
        /* Search results mode */
        <div className="space-y-3">
          <SectionHeading title={`Results for "${trimmed}"`} />
          {suggestion ? (
            <p className="text-sm text-muted-foreground">
              Did you mean{" "}
              <button
                type="button"
                onClick={() => setQuery(suggestion)}
                className="font-semibold text-accent hover:text-accent/80"
                data-testid="search-did-you-mean"
              >
                {suggestion}
              </button>
              ?
            </p>
          ) : null}
          {results.length === 0 ? (
            <div className="space-y-5 rounded-2xl bg-card p-5 shadow-card sm:p-6">
              <div className="text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent/10">
                  <Search className="h-5 w-5 text-accent" aria-hidden />
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">
                  No exact match for "{trimmed}"
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {suggestion ? (
                    <>
                      Try{" "}
                      <button
                        type="button"
                        onClick={() => setQuery(suggestion)}
                        className="font-semibold text-accent hover:text-accent/80"
                      >
                        {suggestion}
                      </button>
                      , browse a topic below, or start with these beginner
                      lessons.
                    </>
                  ) : (
                    <>
                      Try plain English (like "how do I stay safe?"), a shorthand
                      (CA, MC, SL, PnL), or start with these beginner lessons.
                    </>
                  )}
                </p>
              </div>
              {popularCards.length > 0 ? (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground/80">
                    Popular with beginners
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {popularCards.map((c) => (
                      <LessonCard key={c.slug} lesson={c} showCategory />
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {ACADEMY_CATEGORIES.map((category) => (
                  <Link
                    key={category.id}
                    href={categoryPath(category.id)}
                    className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/30 hover:text-foreground"
                  >
                    {category.title}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {results.map((r) => {
                const card = toCardData(r.slug);
                return card ? (
                  <LessonCard key={r.slug} showCategory lesson={card} />
                ) : null;
              })}
            </div>
          )}
        </div>
      ) : (
        /* Homepage mode */
        <>
          {/* New-user welcome (only before any progress) */}
          {beginnerPath ? (
            <AcademyWelcome
              path={beginnerPath}
              hasProgress={summary.hasAnyProgress}
            />
          ) : null}

          {/* Learner journey + milestones (once there's progress) */}
          {beginnerPath && summary.hasAnyProgress && pathProgress && journeySteps.length > 0 ? (
            <AcademyJourney
              pathTitle={beginnerPath.title}
              pathSlug={beginnerPath.slug}
              steps={journeySteps}
              isCompleted={(s) => progress.isLessonCompleted(s)}
              resumeIndex={pathProgress.resumeIndex}
              pct={pathProgress.pct}
              milestones={milestones}
            />
          ) : null}

          {/* Beginner Essentials path (banner for users without progress yet) */}
          {beginnerPath && !summary.hasAnyProgress ? (
            <Link
              href={learningPathPath(beginnerPath.slug)}
              className="group flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent/[0.06] p-4 shadow-card transition-colors hover:bg-accent/10 sm:p-5"
              data-testid="path-banner"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent/12">
                  <RouteIcon className="h-5 w-5 text-accent" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground sm:text-lg">
                      {beginnerPath.title}
                    </h2>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {beginnerPath.description}
                  </p>
                </div>
                <ArrowRight
                  className="mt-1 h-4 w-4 flex-shrink-0 text-accent transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  aria-hidden
                />
              </div>
              {pathProgress && pathProgress.completed > 0 ? (
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {pathProgress.completed} of {pathProgress.total} complete
                    </span>
                    <span>{pathProgress.pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${pathProgress.pct}%` }}
                    />
                  </div>
                </div>
              ) : (
                <span className="text-[11px] font-medium text-accent">
                  {beginnerPath.lessonSlugs.length} lessons · {beginnerPath.estimatedMinutes} min · Start the guided path
                </span>
              )}
            </Link>
          ) : null}

          {/* Continue learning (recently viewed) */}
          {recentCards.length > 0 ? (
            <section className="space-y-3">
              <SectionHeading
                title="Continue learning"
                action={
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
                    <Clock className="h-3 w-3 text-accent" aria-hidden /> Recently viewed
                  </span>
                }
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {recentCards.map((c) => (
                  <LessonCard key={c.slug} lesson={c} showCategory />
                ))}
              </div>
            </section>
          ) : null}

          {/* Bookmarks */}
          {bookmarkCards.length > 0 ? (
            <section className="space-y-3">
              <SectionHeading
                title="Saved lessons"
                action={
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
                    <Bookmark className="h-3 w-3 text-accent" aria-hidden /> Bookmarked
                  </span>
                }
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {bookmarkCards.map((c) => (
                  <LessonCard key={c.slug} lesson={c} showCategory />
                ))}
              </div>
            </section>
          ) : null}

          {/* Start Here */}
          {startHere ? (
            <section className="space-y-3">
              <SectionHeading
                title="Start here"
                action={
                  <Link
                    href={categoryPath(startHere.id)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
                  >
                    View path <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                }
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {startHere.lessons
                  .map((l) => toCardData(l.slug))
                  .filter((c): c is LessonCardData => !!c)
                  .map((c) => (
                    <LessonCard key={c.slug} lesson={c} />
                  ))}
              </div>
            </section>
          ) : null}

          {/* Interactive lessons */}
          {featuredInteractive.length > 0 ? (
            <section className="space-y-3">
              <SectionHeading
                title="Learn by doing"
                action={
                  <Link
                    href="/learn/interactive"
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
                    data-testid="view-all-interactive"
                  >
                    View all {interactiveCount} <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                }
              />
              <p className="-mt-1 text-xs text-muted-foreground">
                {interactiveCount} hands-on lessons — simulators, calculators,
                scenarios and predictions that let you try each concept yourself.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {featuredInteractive.slice(0, 6).map((c) => (
                  <LessonCard key={c.slug} lesson={c} showCategory />
                ))}
              </div>
              {featuredInteractive.length > 6 ? (
                <Link
                  href="/learn/interactive"
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-card/60 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-accent/30 hover:text-foreground"
                >
                  Browse all {interactiveCount} interactive lessons
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              ) : null}
            </section>
          ) : null}

          {/* Browse by topic */}
          <section className="space-y-3">
            <SectionHeading title="Browse by topic" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ACADEMY_CATEGORIES.map((category) => (
                <Link
                  key={category.id}
                  href={categoryPath(category.id)}
                  data-testid={`category-card-${category.id}`}
                  className="group flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-card transition-colors hover:bg-secondary/30"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/12">
                      <CategoryGlyph icon={category.icon} className="h-4 w-4 text-accent" />
                    </div>
                    <h3 className="m-0 min-w-0 flex-1 text-sm font-semibold text-foreground">
                      {category.title}
                    </h3>
                  </div>
                  {category.description ? (
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {category.description}
                    </p>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-muted-foreground/70">
                      {category.lessons.length} lessons
                    </span>
                    {category.level ? (
                      <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {LEVEL_LABELS[category.level]}
                      </span>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Safety essentials */}
          {safetyLessons.length > 0 ? (
            <section className="space-y-3">
              <SectionHeading title="Safety essentials" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {safetyLessons.map((c) => (
                  <LessonCard key={c.slug} lesson={c} showCategory />
                ))}
              </div>
            </section>
          ) : null}

          {/* Browse all (accordion fallback) */}
          <section className="space-y-3">
            <SectionHeading
              title="Browse all lessons"
              action={
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
                  <Sparkles className="h-3 w-3 text-accent" aria-hidden />
                  Expand any topic
                </span>
              }
            />
            <div className="space-y-4">
              {ACADEMY_CATEGORIES.map((category) => (
                <AcademyCategorySection
                  key={category.id}
                  category={category}
                  open={openCategories.includes(category.id)}
                  onToggle={() => toggleCategory(category.id)}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

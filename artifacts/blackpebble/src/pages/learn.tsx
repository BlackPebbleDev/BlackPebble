import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, GraduationCap, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ACADEMY_CATEGORIES,
  getCategoryForLesson,
  getLessonBySlug,
  getNormalizedLesson,
} from "@/lib/education/registry";
import { searchLessons } from "@/lib/education/search";
import { categoryPath, lessonPath } from "@/lib/education/routes";
import { AcademyCategorySection } from "@/components/education/academy-category";
import { CategoryGlyph } from "@/components/education/category-icon";
import { LessonCard, type LessonCardData } from "@/components/education/lesson-card";
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
const LEVEL_ORDER: CategoryLevel[] = ["beginner", "intermediate", "advanced"];

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
  if (!lesson) return null;
  return {
    slug: lesson.slug,
    title: lesson.title,
    categoryId: lesson.categoryId,
    categoryTitle: lesson.categoryTitle,
    description: lesson.shortAnswer ?? lesson.summary,
    difficulty: lesson.difficulty,
    estimatedMinutes: lesson.estimatedMinutes,
    chainScope: lesson.chainScope,
    interactive: !!lesson.interactiveModule,
  };
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

  useEffect(() => {
    trackAcademyViewed();
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

  useEffect(() => {
    if (!trimmed) return;
    const t = window.setTimeout(() => {
      trackAcademySearchPerformed();
      if (results.length === 0) trackAcademySearchZeroResults();
    }, 500);
    return () => window.clearTimeout(t);
  }, [trimmed, results.length]);

  function toggleCategory(id: string) {
    setOpenCategories((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  const startHere = ACADEMY_CATEGORIES.find((c) => c.id === "start-here");
  const featuredInteractive = useMemo(
    () =>
      ACADEMY_CATEGORIES.flatMap((c) => c.lessons)
        .filter((l) => !!l.interactiveModule)
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
          {results.length === 0 ? (
            <div className="rounded-2xl bg-card shadow-card px-5 py-10 text-center text-sm text-muted-foreground">
              No lessons matched your search. Try CA, MC, TP, SL, PnL, ATH, or a
              feature name.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {results.map((r) => (
                <LessonCard
                  key={r.slug}
                  showCategory
                  lesson={{
                    slug: r.slug,
                    title: r.title,
                    categoryId: r.categoryId,
                    categoryTitle: r.categoryTitle,
                    description: r.shortDescription,
                    difficulty: r.difficulty,
                    estimatedMinutes: r.estimatedMinutes,
                    chainScope: r.chainScope,
                    interactive: r.kind === "flagship",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Homepage mode */
        <>
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

          {/* Featured interactive */}
          {featuredInteractive.length > 0 ? (
            <section className="space-y-3">
              <SectionHeading title="Interactive lessons" />
              <div className="grid gap-3 sm:grid-cols-2">
                {featuredInteractive.map((c) => (
                  <LessonCard key={c.slug} lesson={c} />
                ))}
              </div>
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
                  <span className="mt-auto text-[11px] text-muted-foreground/70">
                    {category.lessons.length} lessons
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* Browse by experience level */}
          <section className="space-y-3">
            <SectionHeading title="Browse by experience level" />
            <div className="space-y-3">
              {LEVEL_ORDER.map((level) => {
                const cats = ACADEMY_CATEGORIES.filter(
                  (c) => c.level === level,
                );
                if (cats.length === 0) return null;
                return (
                  <div key={level} className="rounded-2xl bg-card p-4 shadow-card">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-foreground/80">
                      {LEVEL_LABELS[level]}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cats.map((c) => (
                        <Link
                          key={c.id}
                          href={categoryPath(c.id)}
                          className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-accent/30"
                        >
                          {c.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
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

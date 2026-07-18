import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Home, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getInteractiveLessons } from "@/lib/education/registry";
import {
  interactiveTypeLabel,
  INTERACTIVE_TYPES,
  type InteractiveType,
} from "@/lib/education/interactive/labels";
import { LessonCard, type LessonCardData } from "@/components/education/lesson-card";
import { academyHomePath } from "@/lib/education/routes";
import { useAcademyProgress } from "@/lib/education/use-progress";
import { trackAcademyViewed } from "@/lib/analytics";
import type { LessonDifficulty } from "@/lib/education/types";

interface InteractiveEntry {
  card: LessonCardData;
  type: InteractiveType;
  difficulty?: LessonDifficulty;
  haystack: string;
}

const DIFFICULTY_ORDER: LessonDifficulty[] = [
  "beginner",
  "intermediate",
  "advanced",
];
const DIFFICULTY_LABELS: Record<LessonDifficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

function FilterChip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        "flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
        active
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-border bg-surface-2 text-muted-foreground hover:border-accent/30 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export default function LearnInteractivePage() {
  const progress = useAcademyProgress();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<InteractiveType | null>(null);
  const [difficulty, setDifficulty] = useState<LessonDifficulty | null>(null);

  useEffect(() => {
    trackAcademyViewed({ sourceSurface: "category-page" });
  }, []);

  const entries = useMemo<InteractiveEntry[]>(() => {
    return getInteractiveLessons().map((lesson) => {
      const primary = lesson.interactiveModules[0];
      const t = primary ? interactiveTypeLabel(primary.id) : "Simulator";
      const card: LessonCardData = {
        slug: lesson.slug,
        title: lesson.title,
        categoryId: lesson.categoryId,
        categoryTitle: lesson.categoryTitle,
        description: lesson.shortAnswer ?? lesson.summary,
        difficulty: lesson.difficulty,
        estimatedMinutes: lesson.estimatedMinutes,
        chainScope: lesson.chainScope,
        interactive: true,
        interactiveType: t,
        hasQuiz: !!lesson.quiz && lesson.quiz.questions.length > 0,
        hasDiagram: lesson.diagrams.length > 0,
        hasStory: !!lesson.story,
      };
      return {
        card,
        type: t,
        difficulty: lesson.difficulty,
        haystack:
          `${lesson.title} ${lesson.categoryTitle} ${lesson.shortAnswer ?? ""} ${t}`.toLowerCase(),
      };
    });
  }, []);

  // Only offer filters that actually exist in the data (fully dynamic).
  const availableTypes = useMemo(
    () => INTERACTIVE_TYPES.filter((t) => entries.some((e) => e.type === t)),
    [entries],
  );
  const availableDifficulties = useMemo(
    () =>
      DIFFICULTY_ORDER.filter((d) => entries.some((e) => e.difficulty === d)),
    [entries],
  );

  const trimmed = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (type && e.type !== type) return false;
        if (difficulty && e.difficulty !== difficulty) return false;
        if (trimmed && !e.haystack.includes(trimmed)) return false;
        return true;
      }),
    [entries, type, difficulty, trimmed],
  );

  const completedCount = filtered.filter((e) =>
    progress.isLessonCompleted(e.card.slug),
  ).length;

  const hasFilters = !!type || !!difficulty || !!trimmed;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:py-6 md:px-6 pb-24 md:pb-10 min-w-0">
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
            Interactive lessons
          </li>
        </ol>
      </nav>

      <PageHeader
        icon={Sparkles}
        title="Interactive lessons"
        subtitle={
          <p>
            {entries.length} hands-on lessons — simulators, calculators, scenarios
            and predictions. Learn each concept by trying it yourself.
          </p>
        }
      />

      {/* Controls */}
      <div className="space-y-3 rounded-2xl bg-card p-4 shadow-card sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search interactive lessons"
            className="pl-9"
            aria-label="Search interactive lessons"
            data-testid="interactive-search"
          />
        </div>

        {availableTypes.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar" aria-label="Filter by type">
            <FilterChip active={!type} onClick={() => setType(null)} testId="type-all">
              All types
            </FilterChip>
            {availableTypes.map((t) => (
              <FilterChip
                key={t}
                active={type === t}
                onClick={() => setType((cur) => (cur === t ? null : t))}
                testId={`type-${t}`}
              >
                {t}
              </FilterChip>
            ))}
          </div>
        ) : null}

        {availableDifficulties.length > 1 ? (
          <div className="flex flex-wrap gap-2" aria-label="Filter by difficulty">
            <FilterChip active={!difficulty} onClick={() => setDifficulty(null)}>
              All levels
            </FilterChip>
            {availableDifficulties.map((d) => (
              <FilterChip
                key={d}
                active={difficulty === d}
                onClick={() => setDifficulty((cur) => (cur === d ? null : d))}
              >
                {DIFFICULTY_LABELS[d]}
              </FilterChip>
            ))}
          </div>
        ) : null}
      </div>

      {/* Result summary */}
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span data-testid="interactive-count">
          {filtered.length} {filtered.length === 1 ? "lesson" : "lessons"}
          {completedCount > 0 ? ` · ${completedCount} completed` : ""}
        </span>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setType(null);
              setDifficulty(null);
            }}
            className="font-medium text-accent hover:text-accent/80"
            data-testid="clear-filters"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {/* Grid / empty state */}
      {filtered.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => (
            <LessonCard key={e.card.slug} lesson={e.card} showCategory />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-card p-8 text-center shadow-card">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent/10">
            <Search className="h-5 w-5 text-accent" aria-hidden />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">
            No interactive lessons match those filters
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try a different type or level, or clear your filters to see all{" "}
            {entries.length}.
          </p>
        </div>
      )}
    </div>
  );
}

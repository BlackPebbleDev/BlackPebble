import { Link } from "wouter";
import {
  ArrowUpRight,
  BookText,
  Check,
  HelpCircle,
  Shapes,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { lessonPath } from "@/lib/education/routes";
import {
  ChainScopeBadge,
  DifficultyBadge,
  EstimatedTime,
} from "@/components/education/lesson-meta";
import { useAcademyProgress } from "@/lib/education/use-progress";
import { interactiveTypeLabel } from "@/lib/education/interactive/labels";
import type { NormalizedLesson } from "@/lib/education/normalize";

export interface LessonCardData {
  slug: string;
  title: string;
  categoryId: string;
  categoryTitle?: string;
  description?: string;
  difficulty?: NormalizedLesson["difficulty"];
  estimatedMinutes?: number;
  chainScope?: NormalizedLesson["chainScope"];
  interactive?: boolean;
  /** Human label for the interactive type (e.g. "Simulator", "Prediction"). */
  interactiveType?: string;
  hasQuiz?: boolean;
  hasDiagram?: boolean;
  hasStory?: boolean;
}

/**
 * Single source of truth for turning a normalized lesson into card data, so
 * every surface (home, category, interactive browse, search) shows the same
 * metadata — including a correct interactive flag derived from both the legacy
 * field and the interactiveModules array.
 */
export function lessonCardData(lesson: NormalizedLesson): LessonCardData {
  const firstModule = lesson.interactiveModules[0];
  return {
    slug: lesson.slug,
    title: lesson.title,
    categoryId: lesson.categoryId,
    categoryTitle: lesson.categoryTitle,
    description: lesson.shortAnswer ?? lesson.summary,
    difficulty: lesson.difficulty,
    estimatedMinutes: lesson.estimatedMinutes,
    chainScope: lesson.chainScope,
    interactive: lesson.interactiveModules.length > 0,
    interactiveType: firstModule ? interactiveTypeLabel(firstModule.id) : undefined,
    hasQuiz: !!lesson.quiz && lesson.quiz.questions.length > 0,
    hasDiagram: lesson.diagrams.length > 0,
    hasStory: !!lesson.story,
  };
}

function FeatureDot({
  icon: Icon,
  label,
}: {
  icon: typeof HelpCircle;
  label: string;
}) {
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface-2 text-muted-foreground"
    >
      <Icon className="h-3 w-3" aria-hidden />
    </span>
  );
}

/** Compact, tappable lesson card used across homepage and category surfaces. */
export function LessonCard({
  lesson,
  showCategory = false,
  className,
  onNavigate,
}: {
  lesson: LessonCardData;
  showCategory?: boolean;
  className?: string;
  onNavigate?: (slug: string) => void;
}) {
  const progress = useAcademyProgress();
  const completed = progress.isLessonCompleted(lesson.slug);

  return (
    <Link
      href={lessonPath(lesson.categoryId, lesson.slug)}
      onClick={() => onNavigate?.(lesson.slug)}
      data-testid={`lesson-card-${lesson.slug}`}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border bg-card/60 p-4 transition-colors hover:border-accent/30 hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        completed ? "border-success/30" : "border-border/60",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {showCategory && lesson.categoryTitle ? (
            <div className="mb-0.5 truncate text-[11px] font-medium text-muted-foreground">
              {lesson.categoryTitle}
            </div>
          ) : null}
          <span className="text-sm font-semibold text-foreground">
            {lesson.title}
          </span>
        </div>
        {completed ? (
          <span
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
            title="Completed"
            aria-label="Completed"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : (
          <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-accent" aria-hidden />
        )}
      </div>

      {lesson.description ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {lesson.description}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {lesson.interactive ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            <Sparkles className="h-3 w-3" aria-hidden />
            {lesson.interactiveType ?? "Interactive"}
          </span>
        ) : null}
        {lesson.chainScope ? <ChainScopeBadge scope={lesson.chainScope} /> : null}
        {lesson.difficulty ? (
          <DifficultyBadge difficulty={lesson.difficulty} />
        ) : null}
        {lesson.estimatedMinutes ? (
          <EstimatedTime minutes={lesson.estimatedMinutes} />
        ) : null}
        {(lesson.hasQuiz || lesson.hasDiagram || lesson.hasStory) ? (
          <span className="ml-auto inline-flex items-center gap-1">
            {lesson.hasDiagram ? <FeatureDot icon={Shapes} label="Includes a diagram" /> : null}
            {lesson.hasStory ? <FeatureDot icon={BookText} label="Includes a story" /> : null}
            {lesson.hasQuiz ? <FeatureDot icon={HelpCircle} label="Includes a quiz" /> : null}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

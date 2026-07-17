import { Link } from "wouter";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { lessonPath } from "@/lib/education/routes";
import {
  ChainScopeBadge,
  DifficultyBadge,
  EstimatedTime,
} from "@/components/education/lesson-meta";
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
  return (
    <Link
      href={lessonPath(lesson.categoryId, lesson.slug)}
      onClick={() => onNavigate?.(lesson.slug)}
      data-testid={`lesson-card-${lesson.slug}`}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border border-border/60 bg-card/60 p-4 transition-colors hover:border-accent/30 hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
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
          <div className="flex items-center gap-1.5">
            {lesson.interactive ? (
              <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-accent" aria-hidden />
            ) : null}
            <span className="text-sm font-semibold text-foreground">
              {lesson.title}
            </span>
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-accent" aria-hidden />
      </div>

      {lesson.description ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {lesson.description}
        </p>
      ) : null}

      {(lesson.difficulty ||
        lesson.estimatedMinutes ||
        lesson.chainScope) ? (
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {lesson.chainScope ? <ChainScopeBadge scope={lesson.chainScope} /> : null}
          {lesson.difficulty ? (
            <DifficultyBadge difficulty={lesson.difficulty} />
          ) : null}
          {lesson.estimatedMinutes ? (
            <EstimatedTime minutes={lesson.estimatedMinutes} />
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}

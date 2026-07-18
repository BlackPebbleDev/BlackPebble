import { Link } from "wouter";
import { ArrowRight, Beaker, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LessonCallout, CalloutType } from "@/lib/education/types";
import type { NormalizedLesson } from "@/lib/education/normalize";
import { lessonPath } from "@/lib/education/routes";
import {
  ChainScopeBadge,
  DifficultyBadge,
  EstimatedTime,
} from "./lesson-meta";

const CALLOUT_STYLES: Record<
  CalloutType,
  { label: string; className: string }
> = {
  why: {
    label: "Why this matters",
    className: "border-accent/20 bg-accent/5 text-foreground",
  },
  safety: {
    label: "Safety note",
    className: "border-destructive-border/40 bg-destructive/10 text-foreground",
  },
  example: {
    label: "BlackPebble example",
    className: "border-border bg-surface-2 text-foreground",
  },
  beginner: {
    label: "Beginner tip",
    className: "border-accent/15 bg-accent/5 text-foreground",
  },
  advanced: {
    label: "Advanced note",
    className: "border-border bg-surface-2/80 text-muted-foreground",
  },
  important: {
    label: "Important",
    className: "border-accent/25 bg-accent/10 text-foreground",
  },
  mistake: {
    label: "Common mistake",
    className: "border-destructive-border/40 bg-destructive/10 text-foreground",
  },
  methodology: {
    label: "Methodology note",
    className: "border-border bg-surface-2/80 text-muted-foreground",
  },
};

export function LessonCalloutBox({ callout }: { callout: LessonCallout }) {
  const style = CALLOUT_STYLES[callout.type];
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3 text-xs leading-relaxed",
        style.className,
      )}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {style.label}
      </div>
      <p>{callout.text}</p>
    </div>
  );
}

/**
 * Compact, abbreviated renderer for the homepage accordion. Consumes the same
 * NormalizedLesson as the dedicated lesson page (one rendering model), but shows
 * an intentionally short preview and links out for the full lesson. Interactive
 * modules and quizzes are advertised as chips, not mounted here, to keep the
 * homepage light.
 */
export function NormalizedLessonBody({ lesson }: { lesson: NormalizedLesson }) {
  const preview = lesson.sections.filter((s) => !s.advanced).slice(0, 2);
  const previewCallouts = lesson.callouts.slice(0, 1);
  const hasInteractive = lesson.interactiveModules.length > 0;
  const hasQuiz = !!lesson.quiz && lesson.quiz.questions.length > 0;

  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
      {(lesson.difficulty || lesson.estimatedMinutes || lesson.chainScope) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {lesson.chainScope ? <ChainScopeBadge scope={lesson.chainScope} /> : null}
          {lesson.difficulty ? (
            <DifficultyBadge difficulty={lesson.difficulty} />
          ) : null}
          {lesson.estimatedMinutes ? (
            <EstimatedTime minutes={lesson.estimatedMinutes} />
          ) : null}
        </div>
      )}

      {lesson.shortAnswer ? (
        <p className="font-medium text-foreground/90">{lesson.shortAnswer}</p>
      ) : null}

      {preview.map((s) => (
        <div key={s.kind + s.title}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
            {s.title}
          </div>
          <p className="line-clamp-4 whitespace-pre-line">{s.body}</p>
        </div>
      ))}

      {previewCallouts.map((c, i) => (
        <LessonCalloutBox key={i} callout={c} />
      ))}

      {(hasInteractive || hasQuiz) && (
        <div className="flex flex-wrap gap-1.5">
          {hasInteractive ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
              <Beaker className="h-3 w-3" aria-hidden /> Interactive
            </span>
          ) : null}
          {hasQuiz ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              <GraduationCap className="h-3 w-3" aria-hidden /> Quiz
            </span>
          ) : null}
        </div>
      )}

      {lesson.relatedFeatures.length > 0 ? (
        <div className="pt-0.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
            Related BlackPebble feature
          </div>
          <div className="flex flex-wrap gap-2">
            {lesson.relatedFeatures.map((f) => (
              <Link
                key={f.path}
                href={f.path}
                className="inline-flex items-center gap-1 text-accent transition-colors hover:text-accent/80"
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <Link
        href={lessonPath(lesson.categoryId, lesson.slug)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-accent transition-colors hover:text-accent/80"
        data-testid={`accordion-open-lesson-${lesson.slug}`}
      >
        Open full lesson
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}


import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AcademyCategory } from "@/lib/education/types";
import { getNormalizedLesson } from "@/lib/education/registry";
import { CATEGORY_ICONS } from "./category-icon";
import { LessonAccordionRow } from "./lesson-accordion";

export function AcademyCategorySection({
  category,
  open,
  onToggle,
  matchedLessonSlugs,
  activeLessonSlug,
  forceOpenLessons = false,
}: {
  category: AcademyCategory;
  open: boolean;
  onToggle: () => void;
  matchedLessonSlugs?: Set<string>;
  activeLessonSlug?: string | null;
  forceOpenLessons?: boolean;
}) {
  const Icon = CATEGORY_ICONS[category.icon];
  const visibleLessons = matchedLessonSlugs
    ? category.lessons.filter((lesson) => matchedLessonSlugs.has(lesson.slug))
    : category.lessons;

  if (matchedLessonSlugs && visibleLessons.length === 0) return null;

  const buttonId = `category-btn-${category.id}`;
  const panelId = `category-panel-${category.id}`;

  return (
    <section id={category.id} className="scroll-mt-28">
      <div className="overflow-hidden rounded-2xl bg-card shadow-card">
        <h2 className="m-0">
          <button
            type="button"
            id={buttonId}
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background sm:px-5"
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/12">
              <Icon className="h-4 w-4 text-accent" aria-hidden />
            </div>
            <span className="min-w-0 flex-1 text-base font-semibold text-foreground sm:text-lg">
              {category.title}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        </h2>

        {open ? (
          <div
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            className="space-y-2 border-t border-border/60 px-3 py-3 sm:px-4 sm:py-4"
          >
            {visibleLessons.map((lesson) => {
              const normalized = getNormalizedLesson(lesson.slug);
              if (!normalized) return null;
              return (
              <LessonAccordionRow
                key={lesson.slug}
                lesson={normalized}
                defaultOpen={
                  forceOpenLessons ||
                  activeLessonSlug === lesson.slug ||
                  (matchedLessonSlugs?.size === 1 &&
                    matchedLessonSlugs.has(lesson.slug))
                }
                highlight={activeLessonSlug === lesson.slug}
              />
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

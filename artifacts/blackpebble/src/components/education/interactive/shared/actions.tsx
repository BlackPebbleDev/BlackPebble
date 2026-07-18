import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import type { NormalizedLesson } from "@/lib/education/normalize";
import { trackAcademyRelatedFeatureClicked } from "@/lib/analytics";

/**
 * Renders a lesson's related BlackPebble features as CTA links inside an
 * interactive module footer. Falls back to nothing when the lesson has none.
 */
export function RelatedActions({ lesson }: { lesson: NormalizedLesson }) {
  if (lesson.relatedFeatures.length === 0) return null;
  return (
    <>
      {lesson.relatedFeatures.map((f, i) => (
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
          className={
            i === 0
              ? "inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
              : "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/30"
          }
          data-testid={`module-cta-${f.path}`}
        >
          {f.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ))}
    </>
  );
}

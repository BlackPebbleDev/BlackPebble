import { Link } from "wouter";
import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLessonRef } from "@/lib/education/registry";
import { lessonPath } from "@/lib/education/routes";
import {
  trackAcademyLessonViewed,
  type AcademySourceSurface,
} from "@/lib/analytics";

/**
 * Subtle contextual affordance that links a product surface to the Academy
 * lesson explaining the concept next to it. Kept intentionally small so it can
 * sit beside labels and inputs without cluttering the product. Records which
 * `sourceSurface` opened the lesson so activity is attributable.
 */
export function LearnLink({
  slug,
  sourceSurface,
  label = "Learn",
  className,
  "aria-label": ariaLabel,
}: {
  slug: string;
  sourceSurface: AcademySourceSurface;
  label?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const ref = getLessonRef(slug);
  if (!ref) return null;
  return (
    <Link
      href={lessonPath(ref.categoryId, ref.slug)}
      onClick={() =>
        trackAcademyLessonViewed({
          lessonSlug: ref.slug,
          categoryId: ref.categoryId,
          sourceSurface,
        })
      }
      aria-label={ariaLabel ?? `Learn: ${ref.title}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/15",
        className,
      )}
      data-testid={`learn-link-${slug}`}
    >
      <GraduationCap className="h-3 w-3" aria-hidden />
      {label}
    </Link>
  );
}

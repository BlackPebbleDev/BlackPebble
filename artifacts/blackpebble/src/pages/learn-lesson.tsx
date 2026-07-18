import { useEffect } from "react";
import { Link } from "wouter";
import { GraduationCap } from "lucide-react";
import {
  getCategoryBySlug,
  getLessonRef,
  getNormalizedLesson,
} from "@/lib/education/registry";
import { academyHomePath, categoryPath } from "@/lib/education/routes";
import { LessonPageView } from "@/components/education/lesson-page";
import { useLessonMeta } from "@/lib/education/use-academy-meta";
import { academyProgress } from "@/lib/education/progress";
import { trackAcademyLessonViewed } from "@/lib/analytics";
import type { RelatedLessonRef } from "@/lib/education/normalize";

function AcademyNotFound({
  title,
  message,
  backHref,
  backLabel,
}: {
  title: string;
  message: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
        <GraduationCap className="h-6 w-6 text-accent" aria-hidden />
      </div>
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/15"
      >
        {backLabel}
      </Link>
    </div>
  );
}

export default function LearnLessonPage({
  params,
}: {
  params: { category: string; lesson: string };
}) {
  const category = getCategoryBySlug(params.category);
  const lesson = getNormalizedLesson(params.lesson);
  // Guard against category/lesson mismatch: never render a lesson under the
  // wrong category slug.
  const mismatched = lesson && category && lesson.categoryId !== category.id;
  const valid = category && lesson && !mismatched;

  useLessonMeta(valid ? lesson : undefined);

  useEffect(() => {
    if (valid && lesson) {
      academyProgress.markLessonViewed(lesson.slug);
      trackAcademyLessonViewed({
        lessonSlug: lesson.slug,
        categoryId: lesson.categoryId,
        difficulty: lesson.difficulty,
        chainScope: lesson.chainScope,
        sourceSurface: "lesson-page",
      });
    }
  }, [valid, lesson, params.lesson]);

  if (!category) {
    return (
      <AcademyNotFound
        title="Category not found"
        message="That Academy category does not exist. Browse all topics from the Academy home."
        backHref={academyHomePath()}
        backLabel="Back to Academy"
      />
    );
  }

  if (!lesson || mismatched) {
    return (
      <AcademyNotFound
        title="Lesson not found"
        message="That lesson does not exist in this category. Browse the category to find related lessons."
        backHref={categoryPath(category.id)}
        backLabel={`Back to ${category.title}`}
      />
    );
  }

  const slugs = category.lessons.map((l) => l.slug);
  const index = slugs.indexOf(lesson.slug);
  const prev: RelatedLessonRef | undefined =
    index > 0 ? getLessonRef(slugs[index - 1]) : undefined;
  const next: RelatedLessonRef | undefined =
    index >= 0 && index < slugs.length - 1
      ? getLessonRef(slugs[index + 1])
      : undefined;

  return <LessonPageView lesson={lesson} prev={prev} next={next} />;
}

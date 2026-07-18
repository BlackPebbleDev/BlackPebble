import { useEffect } from "react";
import { Link } from "wouter";
import { ChevronRight, GraduationCap, Home } from "lucide-react";
import { getCategoryBySlug, getNormalizedLesson } from "@/lib/education/registry";
import { academyHomePath } from "@/lib/education/routes";
import { LessonCard, lessonCardData } from "@/components/education/lesson-card";
import { useCategoryMeta } from "@/lib/education/use-academy-meta";
import { trackAcademyCategoryViewed } from "@/lib/analytics";

export default function LearnCategoryPage({
  params,
}: {
  params: { category: string };
}) {
  const category = getCategoryBySlug(params.category);

  useCategoryMeta(
    category
      ? {
          id: category.id,
          title: category.title,
          description: category.description,
          lessonCount: category.lessons.length,
        }
      : undefined,
  );

  useEffect(() => {
    if (category) {
      trackAcademyCategoryViewed({
        categoryId: category.id,
        sourceSurface: "category-page",
      });
    }
  }, [category, params.category]);

  if (!category) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
          <GraduationCap className="h-6 w-6 text-accent" aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-foreground">Category not found</h1>
        <p className="text-sm text-muted-foreground">
          That Academy category does not exist. Browse all topics from the
          Academy home.
        </p>
        <Link
          href={academyHomePath()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/15"
        >
          Back to Academy
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-5 sm:py-6 md:px-6 pb-24 md:pb-10 min-w-0">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <li>
            <Link href={academyHomePath()} className="hover:text-foreground">
              <span className="inline-flex items-center gap-1">
                <Home className="h-3 w-3" aria-hidden /> Academy
              </span>
            </Link>
          </li>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <li className="text-foreground" aria-current="page">
            {category.title}
          </li>
        </ol>
      </nav>

      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {category.title}
        </h1>
        {category.description ? (
          <p className="text-sm text-muted-foreground">{category.description}</p>
        ) : null}
        <p className="text-xs text-muted-foreground/70">
          {category.lessons.length} lessons
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {category.lessons.map((lesson) => {
          const normalized = getNormalizedLesson(lesson.slug);
          if (!normalized) return null;
          return <LessonCard key={lesson.slug} lesson={lessonCardData(normalized)} />;
        })}
      </div>
    </div>
  );
}

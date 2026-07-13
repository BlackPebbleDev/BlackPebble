import {
  AlertTriangle,
  BarChart3,
  Compass,
  HandCoins,
  Link2,
  MessageCircle,
  Rocket,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AcademyCategory, CategoryIcon } from "@/lib/education/types";
import { LessonAccordionRow } from "./lesson-accordion";

const CATEGORY_ICONS: Record<CategoryIcon, LucideIcon> = {
  compass: Compass,
  trending: TrendingUp,
  "bar-chart": BarChart3,
  shield: Shield,
  link: Link2,
  wallet: Wallet,
  rocket: Rocket,
  alert: AlertTriangle,
  sparkles: Sparkles,
  users: Users,
  "hand-coins": HandCoins,
  message: MessageCircle,
};

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

  return (
    <section id={category.id} className="scroll-mt-28">
      <div className="overflow-hidden rounded-2xl bg-card shadow-card">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-secondary/40 sm:px-5"
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/12">
            <Icon className="h-4 w-4 text-accent" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground sm:text-lg">
              {category.title}
            </h2>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>

        {open ? (
          <div className="space-y-2 border-t border-border/60 px-3 py-3 sm:px-4 sm:py-4">
            {visibleLessons.map((lesson) => (
              <LessonAccordionRow
                key={lesson.slug}
                lesson={lesson}
                defaultOpen={
                  forceOpenLessons ||
                  activeLessonSlug === lesson.slug ||
                  (matchedLessonSlugs?.size === 1 &&
                    matchedLessonSlugs.has(lesson.slug))
                }
                highlight={activeLessonSlug === lesson.slug}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

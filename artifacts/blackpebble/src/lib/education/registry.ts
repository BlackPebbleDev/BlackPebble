import { startHereCategory } from "./categories/start-here";
import { tradingBasicsCategory } from "./categories/trading-basics";
import { marketDataCategory } from "./categories/market-data";
import { ordersRiskCategory } from "./categories/orders-risk";
import { solanaBasicsCategory } from "./categories/solana-basics";
import { walletsSafetyCategory } from "./categories/wallets-safety";
import { memecoinMarketsCategory } from "./categories/memecoin-markets";
import { scamAwarenessCategory } from "./categories/scam-awareness";
import { blackpebbleFeaturesCategory } from "./categories/blackpebble-features";
import { socialReputationCategory } from "./categories/social-reputation";
import { developerCampaignsCategory } from "./categories/developer-campaigns";
import { cryptoSlangCategory } from "./categories/crypto-slang";
import { CATEGORY_META } from "./category-meta";
import type { AcademyCategory, AcademyLesson } from "./types";
import {
  normalizeLesson,
  type NormalizedLesson,
  type RelatedLessonRef,
} from "./normalize";

const RAW_CATEGORIES: AcademyCategory[] = [
  startHereCategory,
  tradingBasicsCategory,
  marketDataCategory,
  ordersRiskCategory,
  solanaBasicsCategory,
  walletsSafetyCategory,
  memecoinMarketsCategory,
  scamAwarenessCategory,
  blackpebbleFeaturesCategory,
  socialReputationCategory,
  developerCampaignsCategory,
  cryptoSlangCategory,
];

/** Categories with centralized presentation metadata merged in. */
export const ACADEMY_CATEGORIES: AcademyCategory[] = RAW_CATEGORIES.map(
  (category) => {
    const meta = CATEGORY_META[category.id];
    return meta
      ? {
          ...category,
          description: category.description ?? meta.description,
          level: category.level ?? meta.level,
        }
      : category;
  },
);

export const ALL_ACADEMY_LESSONS: AcademyLesson[] = ACADEMY_CATEGORIES.flatMap(
  (c) => c.lessons,
);

const LESSON_BY_SLUG = new Map(
  ALL_ACADEMY_LESSONS.map((lesson) => [lesson.slug, lesson]),
);

const CATEGORY_BY_ID = new Map(
  ACADEMY_CATEGORIES.map((category) => [category.id, category]),
);

const CATEGORY_BY_LESSON_SLUG = new Map<string, AcademyCategory>();
for (const category of ACADEMY_CATEGORIES) {
  for (const lesson of category.lessons) {
    CATEGORY_BY_LESSON_SLUG.set(lesson.slug, category);
  }
}

export function getLessonBySlug(slug: string): AcademyLesson | undefined {
  return LESSON_BY_SLUG.get(slug);
}

/** Category slug is its stable id. Kept behind a helper for future flexibility. */
export function categorySlug(category: AcademyCategory): string {
  return category.id;
}

export function getCategoryById(id: string): AcademyCategory | undefined {
  return CATEGORY_BY_ID.get(id);
}

/** Category lookup by URL slug (currently identical to id). */
export function getCategoryBySlug(slug: string): AcademyCategory | undefined {
  return CATEGORY_BY_ID.get(slug);
}

export function getCategoryForLesson(slug: string): AcademyCategory | undefined {
  return CATEGORY_BY_LESSON_SLUG.get(slug);
}

/** Lightweight reference (slug/title/categoryId) used by the related-lesson graph. */
export function getLessonRef(slug: string): RelatedLessonRef | undefined {
  const lesson = LESSON_BY_SLUG.get(slug);
  const category = CATEGORY_BY_LESSON_SLUG.get(slug);
  if (!lesson || !category) return undefined;
  return { slug: lesson.slug, title: lesson.title, categoryId: category.id };
}

/** Normalized, presentation-ready lesson with the related graph resolved. */
export function getNormalizedLesson(slug: string): NormalizedLesson | undefined {
  const lesson = LESSON_BY_SLUG.get(slug);
  const category = CATEGORY_BY_LESSON_SLUG.get(slug);
  if (!lesson || !category) return undefined;
  return normalizeLesson(lesson, category, getLessonRef);
}

export function getAllNormalizedLessons(): NormalizedLesson[] {
  return ALL_ACADEMY_LESSONS.map(
    (lesson) =>
      normalizeLesson(
        lesson,
        CATEGORY_BY_LESSON_SLUG.get(lesson.slug)!,
        getLessonRef,
      ),
  );
}

export function getAllLessonSlugs(): string[] {
  return ALL_ACADEMY_LESSONS.map((lesson) => lesson.slug);
}

export function getAllLessonTitles(): string[] {
  return ALL_ACADEMY_LESSONS.map((lesson) => lesson.title);
}

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
import type { AcademyCategory, AcademyLesson } from "./types";

export const ACADEMY_CATEGORIES: AcademyCategory[] = [
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

export const ALL_ACADEMY_LESSONS: AcademyLesson[] = ACADEMY_CATEGORIES.flatMap(
  (c) => c.lessons,
);

const LESSON_BY_SLUG = new Map(
  ALL_ACADEMY_LESSONS.map((lesson) => [lesson.slug, lesson]),
);

const CATEGORY_BY_ID = new Map(
  ACADEMY_CATEGORIES.map((category) => [category.id, category]),
);

export function getLessonBySlug(slug: string): AcademyLesson | undefined {
  return LESSON_BY_SLUG.get(slug);
}

export function getCategoryById(id: string): AcademyCategory | undefined {
  return CATEGORY_BY_ID.get(id);
}

export function getCategoryForLesson(slug: string): AcademyCategory | undefined {
  return ACADEMY_CATEGORIES.find((category) =>
    category.lessons.some((lesson) => lesson.slug === slug),
  );
}

function lessonHaystack(lesson: AcademyLesson, category: AcademyCategory): string {
  return [
    lesson.title,
    lesson.what,
    lesson.why,
    lesson.example ?? "",
    lesson.related?.label ?? "",
    category.title,
    ...(lesson.aliases ?? []),
    ...(lesson.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

export interface AcademySearchResult {
  category: AcademyCategory;
  lessons: AcademyLesson[];
  categoryMatch: boolean;
}

/** Client-side lesson search across titles, aliases, keywords, and body text. */
export function searchAcademy(query: string): AcademySearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return ACADEMY_CATEGORIES.map((category) => {
    const categoryMatch = category.title.toLowerCase().includes(q);
    const lessons = category.lessons.filter((lesson) => {
      if (categoryMatch) return true;
      return lessonHaystack(lesson, category).includes(q);
    });
    return { category, lessons, categoryMatch };
  }).filter((result) => result.categoryMatch || result.lessons.length > 0);
}

export function getAllLessonSlugs(): string[] {
  return ALL_ACADEMY_LESSONS.map((lesson) => lesson.slug);
}

export function getAllLessonTitles(): string[] {
  return ALL_ACADEMY_LESSONS.map((lesson) => lesson.title);
}

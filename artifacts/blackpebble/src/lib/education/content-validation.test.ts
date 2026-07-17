import { describe, it, expect } from "vitest";
import {
  ACADEMY_CATEGORIES,
  ALL_ACADEMY_LESSONS,
  getAllNormalizedLessons,
  getLessonBySlug,
  getNormalizedLesson,
} from "./registry";
import { isChainKey } from "./chains";
import { CATEGORY_META } from "./category-meta";

// Real, registered app routes a related-feature link may point to (see App.tsx).
const KNOWN_ROUTES = new Set([
  "/",
  "/markets",
  "/portfolio",
  "/feed",
  "/leaderboard",
  "/discover",
  "/utilities",
  "/utilities/sol-recovery",
  "/utilities/wallet-cleaner",
  "/utilities/trade-planner",
  "/utilities/journal",
  "/utilities/trading-analysis",
  "/campaigns",
  "/journal",
  "/about",
  "/features",
  "/roadmap",
  "/safety",
  "/learn",
]);

const VALID_INTERACTIVE = new Set(["pnl-simulator"]);

describe("academy content validation", () => {
  it("has unique lesson slugs across all categories", () => {
    const slugs = ALL_ACADEMY_LESSONS.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique category ids", () => {
    const ids = ACADEMY_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every category presentation metadata (description + level)", () => {
    for (const category of ACADEMY_CATEGORIES) {
      expect(category.description, category.id).toBeTruthy();
      expect(category.level, category.id).toBeTruthy();
      expect(CATEGORY_META[category.id], category.id).toBeDefined();
    }
  });

  it("points every related-feature link at a real route", () => {
    for (const lesson of ALL_ACADEMY_LESSONS) {
      const features = [
        ...(lesson.related ? [lesson.related] : []),
        ...(lesson.relatedFeatures ?? []),
      ];
      for (const f of features) {
        expect(KNOWN_ROUTES.has(f.path), `${lesson.slug} -> ${f.path}`).toBe(
          true,
        );
      }
    }
  });

  it("resolves every related-lesson and prerequisite reference", () => {
    for (const lesson of ALL_ACADEMY_LESSONS) {
      for (const slug of lesson.relatedLessonSlugs ?? []) {
        expect(getLessonBySlug(slug), `${lesson.slug} -> ${slug}`).toBeDefined();
      }
      for (const slug of lesson.prerequisites ?? []) {
        expect(getLessonBySlug(slug), `${lesson.slug} -> ${slug}`).toBeDefined();
      }
    }
  });

  it("uses only valid chain keys in chain modules", () => {
    for (const lesson of ALL_ACADEMY_LESSONS) {
      for (const mod of lesson.chainModules ?? []) {
        expect(isChainKey(mod.chain), `${lesson.slug} -> ${mod.chain}`).toBe(
          true,
        );
      }
    }
  });

  it("uses only registered interactive-module ids", () => {
    for (const lesson of ALL_ACADEMY_LESSONS) {
      if (lesson.interactiveModule) {
        expect(
          VALID_INTERACTIVE.has(lesson.interactiveModule),
          lesson.slug,
        ).toBe(true);
      }
    }
  });

  it("renders no empty sections and at least one section per lesson", () => {
    for (const lesson of getAllNormalizedLessons()) {
      expect(lesson.sections.length, lesson.slug).toBeGreaterThan(0);
      for (const section of lesson.sections) {
        expect(section.body.trim().length, `${lesson.slug}/${section.kind}`)
          .toBeGreaterThan(0);
      }
    }
  });

  it("gives published flagship lessons the required metadata", () => {
    for (const lesson of getAllNormalizedLessons()) {
      if (lesson.kind !== "flagship") continue;
      expect(lesson.shortAnswer, lesson.slug).toBeTruthy();
      expect(lesson.difficulty, lesson.slug).toBeTruthy();
      expect(lesson.estimatedMinutes, lesson.slug).toBeTruthy();
    }
  });

  it("produces unique canonical lesson URLs", () => {
    const urls = getAllNormalizedLessons().map(
      (l) => `/learn/${l.categoryId}/${l.slug}`,
    );
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("keeps the flagship PnL lesson interactive", () => {
    const pnl = getNormalizedLesson("profit-and-loss");
    expect(pnl?.interactiveModule).toBe("pnl-simulator");
  });
});

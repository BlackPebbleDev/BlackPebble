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
import { INTERACTIVE_MODULE_IDS, isRegisteredInteractiveId } from "./interactive/ids";
import { getPublishedLearningPaths, LEARNING_PATHS } from "./learning-paths";

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

  it("uses only registered interactive-module ids (legacy + array)", () => {
    for (const lesson of ALL_ACADEMY_LESSONS) {
      if (lesson.interactiveModule) {
        expect(
          isRegisteredInteractiveId(lesson.interactiveModule),
          `${lesson.slug} -> ${lesson.interactiveModule}`,
        ).toBe(true);
      }
      for (const ref of lesson.interactiveModules ?? []) {
        expect(
          isRegisteredInteractiveId(ref.id),
          `${lesson.slug} -> ${ref.id}`,
        ).toBe(true);
      }
    }
  });

  it("has unique interactive-module references per lesson", () => {
    for (const lesson of ALL_ACADEMY_LESSONS) {
      const ids = (lesson.interactiveModules ?? []).map((r) => r.id);
      expect(new Set(ids).size, lesson.slug).toBe(ids.length);
    }
  });

  it("registers every interactive id used by content", () => {
    const used = new Set<string>();
    for (const lesson of ALL_ACADEMY_LESSONS) {
      if (lesson.interactiveModule) used.add(lesson.interactiveModule);
      for (const ref of lesson.interactiveModules ?? []) used.add(ref.id);
    }
    // Every registered module should be attached to at least one lesson so the
    // engine's code-split chunks are actually reachable.
    for (const id of INTERACTIVE_MODULE_IDS) {
      expect(used.has(id), `module not attached to any lesson: ${id}`).toBe(true);
    }
  });

  it("validates every quiz question (answers in range, explanation present)", () => {
    for (const lesson of ALL_ACADEMY_LESSONS) {
      const quiz = lesson.quiz;
      if (!quiz) continue;
      expect(quiz.questions.length, `${lesson.slug} quiz empty`).toBeGreaterThan(0);
      const ids = quiz.questions.map((q) => q.id);
      expect(new Set(ids).size, `${lesson.slug} duplicate question ids`).toBe(
        ids.length,
      );
      for (const q of quiz.questions) {
        expect(q.options.length, `${lesson.slug}/${q.id} options`).toBeGreaterThanOrEqual(2);
        for (const opt of q.options) {
          expect(opt.trim().length, `${lesson.slug}/${q.id} empty option`).toBeGreaterThan(0);
        }
        expect(
          q.explanation.trim().length,
          `${lesson.slug}/${q.id} explanation`,
        ).toBeGreaterThan(0);
        const kind = q.kind ?? "single";
        if (kind === "multiple") {
          expect(
            Array.isArray(q.correctIndices) && q.correctIndices.length > 0,
            `${lesson.slug}/${q.id} correctIndices`,
          ).toBe(true);
          for (const idx of q.correctIndices ?? []) {
            expect(idx, `${lesson.slug}/${q.id} idx range`).toBeGreaterThanOrEqual(0);
            expect(idx, `${lesson.slug}/${q.id} idx range`).toBeLessThan(q.options.length);
          }
        } else {
          expect(
            typeof q.correctIndex === "number",
            `${lesson.slug}/${q.id} correctIndex`,
          ).toBe(true);
          expect(q.correctIndex, `${lesson.slug}/${q.id} idx range`).toBeGreaterThanOrEqual(0);
          expect(q.correctIndex, `${lesson.slug}/${q.id} idx range`).toBeLessThan(
            q.options.length,
          );
        }
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

describe("academy learning paths", () => {
  it("has unique path slugs and ids", () => {
    const slugs = LEARNING_PATHS.map((p) => p.slug);
    const ids = LEARNING_PATHS.map((p) => p.id);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("references only resolvable, published lessons in published paths", () => {
    for (const path of getPublishedLearningPaths()) {
      expect(path.lessonSlugs.length, path.slug).toBeGreaterThan(0);
      for (const slug of path.lessonSlugs) {
        const lesson = getLessonBySlug(slug);
        expect(lesson, `${path.slug} -> ${slug}`).toBeDefined();
        // No draft lesson in a published path.
        expect(
          (lesson?.status ?? "published") === "published",
          `${path.slug} -> ${slug} is draft`,
        ).toBe(true);
      }
    }
  });

  it("has no duplicate steps within a path", () => {
    for (const path of LEARNING_PATHS) {
      expect(new Set(path.lessonSlugs).size, path.slug).toBe(
        path.lessonSlugs.length,
      );
    }
  });

  it("references only registered required module ids", () => {
    for (const path of LEARNING_PATHS) {
      for (const id of path.requiredModuleIds ?? []) {
        expect(isRegisteredInteractiveId(id), `${path.slug} -> ${id}`).toBe(true);
      }
    }
  });

  it("resolves required modules to lessons inside the path", () => {
    for (const path of getPublishedLearningPaths()) {
      const modulesInPath = new Set<string>();
      for (const slug of path.lessonSlugs) {
        const lesson = getLessonBySlug(slug);
        if (!lesson) continue;
        if (lesson.interactiveModule) modulesInPath.add(lesson.interactiveModule);
        for (const ref of lesson.interactiveModules ?? [])
          modulesInPath.add(ref.id);
      }
      for (const id of path.requiredModuleIds ?? []) {
        expect(
          modulesInPath.has(id),
          `${path.slug}: required module ${id} not attached to any path lesson`,
        ).toBe(true);
      }
    }
  });

  it("points path final actions at a real route", () => {
    for (const path of LEARNING_PATHS) {
      if (path.finalActionPath) {
        expect(KNOWN_ROUTES.has(path.finalActionPath), path.slug).toBe(true);
      }
    }
  });
});

import { describe, it, expect } from "vitest";
import {
  ACADEMY_CATEGORIES,
  ALL_ACADEMY_LESSONS,
  getAllLessonSlugs,
} from "./registry";

describe("academy registry", () => {
  it("has 12 top-level categories", () => {
    expect(ACADEMY_CATEGORIES).toHaveLength(12);
  });

  it("has unique lesson slugs", () => {
    const slugs = getAllLessonSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique lesson titles within each category", () => {
    for (const category of ACADEMY_CATEGORIES) {
      const titles = category.lessons.map((lesson) => lesson.title);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it("includes required starter lessons", () => {
    const slugs = new Set(getAllLessonSlugs());
    expect(slugs.has("what-is-blackpebble")).toBe(true);
    expect(slugs.has("paper-vs-real-trading")).toBe(true);
    expect(slugs.has("ath-from-call")).toBe(true);
    expect(slugs.has("community-campaigns")).toBe(true);
  });

  it("creates a curated lesson count between 90 and 150", () => {
    expect(ALL_ACADEMY_LESSONS.length).toBeGreaterThanOrEqual(90);
    expect(ALL_ACADEMY_LESSONS.length).toBeLessThanOrEqual(150);
  });
});

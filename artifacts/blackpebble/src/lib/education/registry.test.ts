import { describe, it, expect } from "vitest";
import {
  ACADEMY_CATEGORIES,
  ALL_ACADEMY_LESSONS,
  getAllLessonSlugs,
  searchAcademy,
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

  it("searches common aliases", () => {
    expect(searchAcademy("CA").some((r) => r.lessons.some((l) => l.slug === "contract-address"))).toBe(true);
    expect(searchAcademy("MC").some((r) => r.lessons.some((l) => l.slug === "price-and-market-cap"))).toBe(true);
    expect(searchAcademy("TP").some((r) => r.lessons.some((l) => l.slug === "automated-exits"))).toBe(true);
    expect(searchAcademy("SL").some((r) => r.lessons.some((l) => l.slug === "automated-exits"))).toBe(true);
    expect(searchAcademy("PnL").some((r) => r.lessons.some((l) => l.slug === "profit-and-loss"))).toBe(true);
    expect(searchAcademy("ATH").length).toBeGreaterThan(0);
    expect(searchAcademy("SOL recovery").some((r) => r.lessons.some((l) => l.slug === "recovery-and-cleanup"))).toBe(true);
  });

  it("creates a curated lesson count between 90 and 150", () => {
    expect(ALL_ACADEMY_LESSONS.length).toBeGreaterThanOrEqual(90);
    expect(ALL_ACADEMY_LESSONS.length).toBeLessThanOrEqual(150);
  });
});

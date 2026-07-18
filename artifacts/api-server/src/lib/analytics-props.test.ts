import { describe, it, expect } from "vitest";
import { sanitizeAnalyticsProps } from "./analytics-props.js";

describe("sanitizeAnalyticsProps", () => {
  it("returns null for non-objects and empty input", () => {
    expect(sanitizeAnalyticsProps(undefined)).toBeNull();
    expect(sanitizeAnalyticsProps(null)).toBeNull();
    expect(sanitizeAnalyticsProps("nope")).toBeNull();
    expect(sanitizeAnalyticsProps(42)).toBeNull();
    expect(sanitizeAnalyticsProps([{ lessonSlug: "x" }])).toBeNull();
    expect(sanitizeAnalyticsProps({})).toBeNull();
  });

  it("keeps only known keys and discards unknown ones", () => {
    const out = sanitizeAnalyticsProps({
      lessonSlug: "profit-and-loss",
      categoryId: "trading-basics",
      evil: "DROP TABLE",
      __proto__: "x",
      nested: { a: 1 },
    });
    expect(out).toEqual({
      lessonSlug: "profit-and-loss",
      categoryId: "trading-basics",
    });
  });

  it("coerces and clamps numeric keys to non-negative integers", () => {
    expect(sanitizeAnalyticsProps({ resultCount: 5 })).toEqual({
      resultCount: 5,
    });
    expect(sanitizeAnalyticsProps({ resultCount: -3 })).toEqual({
      resultCount: 0,
    });
    expect(sanitizeAnalyticsProps({ queryLength: 12.9 })).toEqual({
      queryLength: 12,
    });
    expect(sanitizeAnalyticsProps({ resultCount: 9_999_999 })).toEqual({
      resultCount: 1_000_000,
    });
    expect(sanitizeAnalyticsProps({ resultCount: Infinity })).toBeNull();
    expect(sanitizeAnalyticsProps({ resultCount: "5" })).toBeNull();
  });

  it("accepts booleans only for boolean keys", () => {
    expect(sanitizeAnalyticsProps({ isGuest: true })).toEqual({ isGuest: true });
    expect(sanitizeAnalyticsProps({ isGuest: "true" })).toBeNull();
  });

  it("trims and length-caps strings", () => {
    const long = "a".repeat(300);
    const out = sanitizeAnalyticsProps({ lessonSlug: `  ${long}  ` });
    expect(out?.lessonSlug).toHaveLength(96);
  });

  it("drops empty strings", () => {
    expect(sanitizeAnalyticsProps({ lessonSlug: "   " })).toBeNull();
  });

  it("supports the full academy field set", () => {
    const out = sanitizeAnalyticsProps({
      lessonSlug: "market-cap",
      categoryId: "market-data",
      moduleId: "market-cap-calculator",
      resultType: "lesson",
      queryIntent: "question",
      chainScope: "universal",
      sourceSurface: "lesson-page",
      learningPathId: "beginner-essentials",
      stepId: "market-cap",
      completionType: "interaction",
      difficulty: "beginner",
      resultCount: 3,
      queryLength: 8,
      isGuest: true,
    });
    expect(Object.keys(out ?? {}).sort()).toEqual(
      [
        "chainScope",
        "categoryId",
        "completionType",
        "difficulty",
        "isGuest",
        "learningPathId",
        "lessonSlug",
        "moduleId",
        "queryIntent",
        "queryLength",
        "resultCount",
        "resultType",
        "sourceSurface",
        "stepId",
      ].sort(),
    );
  });
});

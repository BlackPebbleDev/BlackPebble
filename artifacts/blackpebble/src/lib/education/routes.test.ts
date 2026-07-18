import { describe, it, expect } from "vitest";
import {
  academyHomePath,
  categoryPath,
  lessonPath,
  lessonCanonicalUrl,
  categoryCanonicalUrl,
  isAcademyPath,
} from "./routes";

describe("academy routes", () => {
  it("builds readable paths", () => {
    expect(academyHomePath()).toBe("/learn");
    expect(categoryPath("trading-basics")).toBe("/learn/trading-basics");
    expect(lessonPath("trading-basics", "profit-and-loss")).toBe(
      "/learn/trading-basics/profit-and-loss",
    );
  });

  it("builds canonical URLs and trims trailing slash", () => {
    expect(
      lessonCanonicalUrl("https://blackpebble.fun/", "trading-basics", "profit-and-loss"),
    ).toBe("https://blackpebble.fun/learn/trading-basics/profit-and-loss");
    expect(categoryCanonicalUrl("https://blackpebble.fun", "wallets-safety")).toBe(
      "https://blackpebble.fun/learn/wallets-safety",
    );
  });

  it("recognizes academy paths", () => {
    expect(isAcademyPath("/learn")).toBe(true);
    expect(isAcademyPath("/learn/trading-basics")).toBe(true);
    expect(isAcademyPath("/learn/trading-basics/profit-and-loss?x=1")).toBe(true);
    expect(isAcademyPath("/markets")).toBe(false);
    expect(isAcademyPath("/learning")).toBe(false);
  });
});

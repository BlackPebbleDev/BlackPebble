import { describe, it, expect } from "vitest";
import { normalizeLesson, deriveDescription } from "./normalize";
import { getNormalizedLesson } from "./registry";
import type { AcademyCategory, AcademyLesson } from "./types";

const category: AcademyCategory = {
  id: "trading-basics",
  title: "Trading Basics",
  icon: "trending",
  lessons: [],
};

describe("normalizeLesson", () => {
  it("builds what/why sections from a legacy lesson", () => {
    const lesson: AcademyLesson = {
      slug: "x",
      title: "X",
      what: "What text.",
      why: "Why text.",
    };
    const n = normalizeLesson(lesson, category);
    const kinds = n.sections.map((s) => s.kind);
    expect(kinds).toEqual(["what", "why"]);
    expect(n.kind).toBe("standard");
  });

  it("omits an empty why section (glossary style)", () => {
    const lesson: AcademyLesson = {
      slug: "degen",
      title: "Degen",
      what: "A high-risk trader.",
      why: "",
    };
    const glossaryCat: AcademyCategory = {
      ...category,
      id: "crypto-slang",
      title: "Common Crypto and Degen Slang",
    };
    const n = normalizeLesson(lesson, glossaryCat);
    expect(n.sections.some((s) => s.kind === "why")).toBe(false);
    expect(n.kind).toBe("glossary");
  });

  it("prefers structured sections and merges legacy callout", () => {
    const lesson: AcademyLesson = {
      slug: "y",
      title: "Y",
      what: "legacy what",
      why: "legacy why",
      sections: [
        { kind: "quick-answer", body: "quick" },
        { kind: "how", body: "how it works" },
        { kind: "advanced", body: "deep", advanced: true },
      ],
      callout: { type: "safety", text: "careful" },
      callouts: [{ type: "important", text: "note" }],
      commonMistakes: ["a mistake"],
    };
    const n = normalizeLesson(lesson, category);
    expect(n.sections.map((s) => s.kind)).toEqual([
      "quick-answer",
      "how",
      "advanced",
    ]);
    expect(n.sections.find((s) => s.kind === "advanced")?.advanced).toBe(true);
    expect(n.callouts).toHaveLength(2);
    expect(n.commonMistakes).toEqual(["a mistake"]);
  });

  it("derives a bounded description", () => {
    const long = "word ".repeat(100);
    expect(deriveDescription(undefined, long).length).toBeLessThanOrEqual(160);
    expect(deriveDescription("short answer")).toBe("short answer");
  });

  it("resolves the flagship PnL lesson with its related graph", () => {
    const n = getNormalizedLesson("profit-and-loss");
    expect(n).toBeDefined();
    expect(n!.kind).toBe("flagship");
    expect(n!.interactiveModule).toBe("pnl-simulator");
    expect(n!.relatedLessons.length).toBeGreaterThan(0);
    expect(n!.commonMistakes.length).toBeGreaterThan(0);
    expect(n!.seo.title).toContain("BlackPebble Academy");
  });
});

import { describe, it, expect } from "vitest";
import {
  computePathCompletion,
  getLearningPath,
  getPublishedLearningPaths,
} from "./learning-paths";

describe("computePathCompletion", () => {
  const steps = ["a", "b", "c", "d"];

  it("reports zero progress when nothing is complete", () => {
    const r = computePathCompletion(steps, () => false);
    expect(r).toEqual({
      total: 4,
      completed: 0,
      pct: 0,
      resumeIndex: 0,
      isComplete: false,
    });
  });

  it("resumes at the first incomplete step, skipping completed ones", () => {
    const done = new Set(["a", "b"]);
    const r = computePathCompletion(steps, (s) => done.has(s));
    expect(r.completed).toBe(2);
    expect(r.pct).toBe(50);
    expect(r.resumeIndex).toBe(2);
    expect(r.isComplete).toBe(false);
  });

  it("counts non-contiguous completion and resumes at the first gap", () => {
    const done = new Set(["a", "c"]);
    const r = computePathCompletion(steps, (s) => done.has(s));
    expect(r.completed).toBe(2);
    expect(r.resumeIndex).toBe(1);
  });

  it("marks complete and returns resumeIndex -1 when all done", () => {
    const r = computePathCompletion(steps, () => true);
    expect(r.completed).toBe(4);
    expect(r.pct).toBe(100);
    expect(r.resumeIndex).toBe(-1);
    expect(r.isComplete).toBe(true);
  });

  it("handles an empty path safely", () => {
    const r = computePathCompletion([], () => true);
    expect(r).toEqual({
      total: 0,
      completed: 0,
      pct: 0,
      resumeIndex: -1,
      isComplete: false,
    });
  });
});

describe("learning-path registry", () => {
  it("exposes the Beginner Essentials path as published", () => {
    const path = getLearningPath("beginner-essentials");
    expect(path).toBeDefined();
    expect(path?.status).toBe("published");
    expect(getPublishedLearningPaths()[0]?.id).toBe("beginner-essentials");
  });

  it("resolves a path by id or slug", () => {
    expect(getLearningPath("beginner-essentials")?.slug).toBe(
      "beginner-essentials",
    );
  });
});

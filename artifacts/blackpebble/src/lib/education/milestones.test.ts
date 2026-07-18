import { describe, it, expect } from "vitest";
import { computeMilestones, milestonesEarned } from "./milestones";
import type { AcademyProgressSummary } from "./progress";

function summary(overrides: Partial<AcademyProgressSummary> = {}): AcademyProgressSummary {
  return {
    lessonsViewed: 0,
    lessonsCompleted: 0,
    interactivesCompleted: 0,
    quizzesCompleted: 0,
    bookmarks: 0,
    hasAnyProgress: false,
    ...overrides,
  };
}

describe("academy milestones", () => {
  it("marks nothing done for a fresh user and points at the first goal", () => {
    const ms = computeMilestones({ summary: summary() });
    expect(milestonesEarned(ms)).toBe(0);
    expect(ms[0].next).toBe(true);
    expect(ms.filter((m) => m.next).length).toBe(1);
  });

  it("earns lesson + interactive + quiz milestones", () => {
    const ms = computeMilestones({
      summary: summary({
        lessonsViewed: 3,
        lessonsCompleted: 2,
        interactivesCompleted: 1,
        quizzesCompleted: 1,
      }),
    });
    const byId = Object.fromEntries(ms.map((m) => [m.id, m.done]));
    expect(byId["first-lesson"]).toBe(true);
    expect(byId["first-complete"]).toBe(true);
    expect(byId["first-interactive"]).toBe(true);
    expect(byId["first-quiz"]).toBe(true);
    expect(byId["five-lessons"]).toBe(false);
  });

  it("completes every milestone for a fully-finished learner", () => {
    const ms = computeMilestones({
      summary: summary({
        lessonsViewed: 20,
        lessonsCompleted: 20,
        interactivesCompleted: 8,
        quizzesCompleted: 8,
      }),
      pathPct: 100,
      pathComplete: true,
    });
    expect(ms.find((m) => m.id === "path-complete")?.done).toBe(true);
    expect(ms.every((m) => m.done)).toBe(true);
    expect(ms.every((m) => !m.next)).toBe(true);
  });
});

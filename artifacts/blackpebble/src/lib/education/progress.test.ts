import { describe, it, expect, beforeEach } from "vitest";
import {
  LocalProgressService,
  migrateProgress,
  defaultProgressState,
  PROGRESS_SCHEMA_VERSION,
  interactiveKey,
} from "./progress";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

describe("migrateProgress", () => {
  it("returns default state for non-objects", () => {
    expect(migrateProgress(null)).toEqual(defaultProgressState());
    expect(migrateProgress("bad")).toEqual(defaultProgressState());
    expect(migrateProgress(42)).toEqual(defaultProgressState());
  });

  it("drops malformed values but keeps valid ones", () => {
    const out = migrateProgress({
      version: 1,
      lessonsViewed: { "market-cap": 123, bad: "x" },
      lessonsCompleted: "nope",
      recent: ["a", 2, "b"],
      paths: { p1: { started: 1, completedSteps: ["s1", 5] } },
    });
    expect(out.lessonsViewed).toEqual({ "market-cap": 123 });
    expect(out.lessonsCompleted).toEqual({});
    expect(out.recent).toEqual(["a", "b"]);
    expect(out.paths.p1.completedSteps).toEqual(["s1"]);
    expect(out.version).toBe(PROGRESS_SCHEMA_VERSION);
  });
});

describe("LocalProgressService", () => {
  let storage: ReturnType<typeof memoryStorage>;
  let svc: LocalProgressService;

  beforeEach(() => {
    storage = memoryStorage();
    svc = new LocalProgressService(storage);
  });

  it("persists lesson views and recent order", () => {
    svc.markLessonViewed("market-cap");
    svc.markLessonViewed("fdv");
    svc.markLessonViewed("market-cap");
    expect(svc.getRecent(5)).toEqual(["market-cap", "fdv"]);
    // Reload from same storage -> survives refresh.
    const reloaded = new LocalProgressService(storage);
    expect(reloaded.getRecent(5)).toEqual(["market-cap", "fdv"]);
  });

  it("tracks lesson, interactive, and quiz completion", () => {
    svc.markLessonCompleted("market-cap");
    svc.markInteractiveCompleted("market-cap", "market-cap-calculator");
    svc.markQuizCompleted("market-cap", "q1");
    expect(svc.isLessonCompleted("market-cap")).toBe(true);
    expect(svc.isInteractiveCompleted("market-cap", "market-cap-calculator")).toBe(
      true,
    );
    expect(svc.getSummary().quizzesCompleted).toBe(1);
    expect(svc.getState().quizzesCompleted[interactiveKey("market-cap", "q1")]).toBeTypeOf(
      "number",
    );
  });

  it("toggles bookmarks", () => {
    expect(svc.toggleBookmark("fdv")).toBe(true);
    expect(svc.isBookmarked("fdv")).toBe(true);
    expect(svc.toggleBookmark("fdv")).toBe(false);
    expect(svc.isBookmarked("fdv")).toBe(false);
  });

  it("tracks path progress", () => {
    svc.markPathStarted("beginner-essentials");
    svc.markPathStepCompleted("beginner-essentials", "market-cap");
    svc.markPathStepCompleted("beginner-essentials", "market-cap");
    svc.markPathStepCompleted("beginner-essentials", "fdv");
    const p = svc.getPathProgress("beginner-essentials");
    expect(p?.completedSteps).toEqual(["market-cap", "fdv"]);
    expect(p?.started).toBeTypeOf("number");
  });

  it("recovers from corrupt storage without throwing", () => {
    storage.setItem("bp.academy.progress", "{not valid json");
    const recovered = new LocalProgressService(storage);
    expect(recovered.getSummary().hasAnyProgress).toBe(false);
  });

  it("bumps snapshot token on mutation", () => {
    const before = svc.getSnapshotToken();
    svc.markLessonViewed("x");
    expect(svc.getSnapshotToken()).toBeGreaterThan(before);
  });

  it("resets all state", () => {
    svc.markLessonCompleted("x");
    svc.reset();
    expect(svc.getSummary().hasAnyProgress).toBe(false);
    expect(storage.getItem("bp.academy.progress")).toBeNull();
  });
});

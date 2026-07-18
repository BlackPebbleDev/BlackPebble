import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the API client so we can assert on the payloads the helpers construct.
const trackMock = vi.fn(() => Promise.resolve({ ok: true }));
vi.mock("./api", () => ({
  api: { analytics: { track: (...args: unknown[]) => trackMock(...args) } },
}));

import {
  trackAcademyViewed,
  trackAcademyLessonViewed,
  trackAcademyInteractiveStarted,
  trackAcademyPracticeStarted,
} from "./analytics";

// The frontend test runner uses the node environment, so provide a minimal
// in-memory sessionStorage so the once-per-session dedup logic is exercised.
function installSessionStorage() {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = stub;
}

beforeEach(() => {
  trackMock.mockClear();
  installSessionStorage();
});

afterEach(() => {
  delete (globalThis as unknown as { sessionStorage?: unknown }).sessionStorage;
});

describe("academy analytics payloads", () => {
  it("sends event type + typed props with no anonId", () => {
    trackAcademyLessonViewed({
      lessonSlug: "market-cap",
      categoryId: "market-data",
      sourceSurface: "lesson-page",
    });
    expect(trackMock).toHaveBeenCalledTimes(1);
    const [type, anonId, props] = trackMock.mock.calls[0];
    expect(type).toBe("academy_lesson_viewed");
    expect(anonId).toBeNull();
    expect(props).toMatchObject({
      lessonSlug: "market-cap",
      categoryId: "market-data",
      sourceSurface: "lesson-page",
    });
  });

  it("dedupes academy_viewed once per session", () => {
    trackAcademyViewed({ sourceSurface: "academy-home" });
    trackAcademyViewed({ sourceSurface: "academy-home" });
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it("dedupes interactive-started per module, not globally", () => {
    trackAcademyInteractiveStarted({ moduleId: "pnl-simulator" });
    trackAcademyInteractiveStarted({ moduleId: "pnl-simulator" });
    trackAcademyInteractiveStarted({ moduleId: "market-cap-calculator" });
    expect(trackMock).toHaveBeenCalledTimes(2);
  });

  it("wires practice-started with module attribution", () => {
    trackAcademyPracticeStarted({
      moduleId: "pnl-simulator",
      lessonSlug: "profit-and-loss",
    });
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock.mock.calls[0][0]).toBe("academy_practice_started");
    expect(trackMock.mock.calls[0][2]).toMatchObject({
      moduleId: "pnl-simulator",
    });
  });
});

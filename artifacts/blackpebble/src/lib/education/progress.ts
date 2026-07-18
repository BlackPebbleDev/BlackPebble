/**
 * Academy progress service.
 *
 * A typed boundary over learning progress with a local guest implementation.
 * Rendering never talks to storage directly — it goes through this service, so a
 * future authenticated API-backed implementation can be swapped in without
 * touching lesson/quiz/interactive UI. Guest state persists in localStorage
 * under a versioned key with graceful corruption handling and a migration hook.
 *
 * FUTURE ACCOUNT MERGE: on sign-in, read the local guest state, POST it to an
 * authenticated endpoint that unions timestamps (max) per key, then replace the
 * local state with the server truth. No sensitive/wallet data is ever stored
 * here, so the merge is a pure union of learning markers.
 */

const STORAGE_KEY = "bp.academy.progress";
export const PROGRESS_SCHEMA_VERSION = 1;

export interface AcademyProgressState {
  version: number;
  lessonsViewed: Record<string, number>;
  lessonsCompleted: Record<string, number>;
  interactivesCompleted: Record<string, number>;
  quizzesCompleted: Record<string, number>;
  bookmarks: Record<string, number>;
  paths: Record<string, PathProgress>;
  recent: string[];
}

export interface PathProgress {
  started?: number;
  completedSteps: string[];
  completed?: number;
}

export interface AcademyProgressSummary {
  lessonsViewed: number;
  lessonsCompleted: number;
  interactivesCompleted: number;
  quizzesCompleted: number;
  bookmarks: number;
  hasAnyProgress: boolean;
}

const MAX_RECENT = 12;

export function defaultProgressState(): AcademyProgressState {
  return {
    version: PROGRESS_SCHEMA_VERSION,
    lessonsViewed: {},
    lessonsCompleted: {},
    interactivesCompleted: {},
    quizzesCompleted: {},
    bookmarks: {},
    paths: {},
    recent: [],
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function numberMap(v: unknown): Record<string, number> {
  if (!isRecord(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "number" && Number.isFinite(val)) out[k] = val;
  }
  return out;
}

/**
 * Coerce arbitrary parsed JSON into a valid state, dropping anything malformed.
 * Also the single place future schema migrations are applied.
 */
export function migrateProgress(raw: unknown): AcademyProgressState {
  if (!isRecord(raw)) return defaultProgressState();
  const base = defaultProgressState();
  const paths: Record<string, PathProgress> = {};
  if (isRecord(raw.paths)) {
    for (const [id, p] of Object.entries(raw.paths)) {
      if (!isRecord(p)) continue;
      paths[id] = {
        started: typeof p.started === "number" ? p.started : undefined,
        completed: typeof p.completed === "number" ? p.completed : undefined,
        completedSteps: Array.isArray(p.completedSteps)
          ? p.completedSteps.filter((s): s is string => typeof s === "string")
          : [],
      };
    }
  }
  return {
    version: PROGRESS_SCHEMA_VERSION,
    lessonsViewed: numberMap(raw.lessonsViewed),
    lessonsCompleted: numberMap(raw.lessonsCompleted),
    interactivesCompleted: numberMap(raw.interactivesCompleted),
    quizzesCompleted: numberMap(raw.quizzesCompleted),
    bookmarks: numberMap(raw.bookmarks),
    paths,
    recent: Array.isArray(raw.recent)
      ? raw.recent.filter((s): s is string => typeof s === "string").slice(0, MAX_RECENT)
      : base.recent,
  };
}

export function interactiveKey(lessonSlug: string, moduleId: string): string {
  return `${lessonSlug}::${moduleId}`;
}

export interface ProgressService {
  getState(): AcademyProgressState;
  /** Monotonic token that changes on every mutation (for useSyncExternalStore). */
  getSnapshotToken(): number;
  getSummary(): AcademyProgressSummary;
  markLessonViewed(slug: string): void;
  markLessonCompleted(slug: string): void;
  isLessonCompleted(slug: string): boolean;
  markInteractiveCompleted(lessonSlug: string, moduleId: string): void;
  isInteractiveCompleted(lessonSlug: string, moduleId: string): boolean;
  markQuizCompleted(lessonSlug: string, quizId: string): void;
  toggleBookmark(slug: string): boolean;
  isBookmarked(slug: string): boolean;
  listBookmarks(): string[];
  getRecent(limit?: number): string[];
  markPathStarted(pathId: string): void;
  markPathStepCompleted(pathId: string, slug: string): void;
  markPathCompleted(pathId: string): void;
  getPathProgress(pathId: string): PathProgress | undefined;
  subscribe(listener: () => void): () => void;
  reset(): void;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function safeStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Local, guest-scoped progress implementation. */
export class LocalProgressService implements ProgressService {
  private state: AcademyProgressState;
  private listeners = new Set<() => void>();
  private rev = 0;

  constructor(private storage: StorageLike | null = safeStorage()) {
    this.state = this.load();
  }

  private load(): AcademyProgressState {
    if (!this.storage) return defaultProgressState();
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return defaultProgressState();
      return migrateProgress(JSON.parse(raw));
    } catch {
      // Corrupt payload: reset to a clean state rather than throwing.
      return defaultProgressState();
    }
  }

  private persist(): void {
    this.rev += 1;
    if (this.storage) {
      try {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch {
        // Quota/availability failure: keep in-memory state, ignore.
      }
    }
    this.listeners.forEach((l) => l());
  }

  getState(): AcademyProgressState {
    return this.state;
  }

  getSnapshotToken(): number {
    return this.rev;
  }

  getSummary(): AcademyProgressSummary {
    const lessonsViewed = Object.keys(this.state.lessonsViewed).length;
    const lessonsCompleted = Object.keys(this.state.lessonsCompleted).length;
    const interactivesCompleted = Object.keys(
      this.state.interactivesCompleted,
    ).length;
    const quizzesCompleted = Object.keys(this.state.quizzesCompleted).length;
    const bookmarks = Object.keys(this.state.bookmarks).length;
    return {
      lessonsViewed,
      lessonsCompleted,
      interactivesCompleted,
      quizzesCompleted,
      bookmarks,
      hasAnyProgress:
        lessonsViewed +
          lessonsCompleted +
          interactivesCompleted +
          quizzesCompleted +
          bookmarks >
        0,
    };
  }

  markLessonViewed(slug: string): void {
    this.state.lessonsViewed[slug] = Date.now();
    this.state.recent = [slug, ...this.state.recent.filter((s) => s !== slug)].slice(
      0,
      MAX_RECENT,
    );
    this.persist();
  }

  markLessonCompleted(slug: string): void {
    this.state.lessonsCompleted[slug] = Date.now();
    this.persist();
  }

  isLessonCompleted(slug: string): boolean {
    return !!this.state.lessonsCompleted[slug];
  }

  markInteractiveCompleted(lessonSlug: string, moduleId: string): void {
    this.state.interactivesCompleted[interactiveKey(lessonSlug, moduleId)] =
      Date.now();
    this.persist();
  }

  isInteractiveCompleted(lessonSlug: string, moduleId: string): boolean {
    return !!this.state.interactivesCompleted[
      interactiveKey(lessonSlug, moduleId)
    ];
  }

  markQuizCompleted(lessonSlug: string, quizId: string): void {
    this.state.quizzesCompleted[interactiveKey(lessonSlug, quizId)] = Date.now();
    this.persist();
  }

  toggleBookmark(slug: string): boolean {
    if (this.state.bookmarks[slug]) {
      delete this.state.bookmarks[slug];
      this.persist();
      return false;
    }
    this.state.bookmarks[slug] = Date.now();
    this.persist();
    return true;
  }

  isBookmarked(slug: string): boolean {
    return !!this.state.bookmarks[slug];
  }

  listBookmarks(): string[] {
    return Object.entries(this.state.bookmarks)
      .sort((a, b) => b[1] - a[1])
      .map(([slug]) => slug);
  }

  getRecent(limit = MAX_RECENT): string[] {
    return this.state.recent.slice(0, limit);
  }

  markPathStarted(pathId: string): void {
    const existing = this.state.paths[pathId];
    if (!existing) {
      this.state.paths[pathId] = { started: Date.now(), completedSteps: [] };
    } else if (!existing.started) {
      existing.started = Date.now();
    }
    this.persist();
  }

  markPathStepCompleted(pathId: string, slug: string): void {
    const p =
      this.state.paths[pathId] ??
      (this.state.paths[pathId] = { started: Date.now(), completedSteps: [] });
    if (!p.completedSteps.includes(slug)) p.completedSteps.push(slug);
    this.persist();
  }

  markPathCompleted(pathId: string): void {
    const p =
      this.state.paths[pathId] ??
      (this.state.paths[pathId] = { started: Date.now(), completedSteps: [] });
    p.completed = Date.now();
    this.persist();
  }

  getPathProgress(pathId: string): PathProgress | undefined {
    return this.state.paths[pathId];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.state = defaultProgressState();
    this.rev += 1;
    if (this.storage) {
      try {
        this.storage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    this.listeners.forEach((l) => l());
  }
}

/** Shared singleton used across the app. */
export const academyProgress: ProgressService = new LocalProgressService();

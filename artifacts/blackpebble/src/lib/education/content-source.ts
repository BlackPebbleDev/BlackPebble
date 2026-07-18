import type { AcademyCategory, AcademyLesson } from "./types";
import type { NormalizedLesson, RelatedLessonRef } from "./normalize";
import {
  ACADEMY_CATEGORIES,
  getCategoryBySlug,
  getLessonBySlug,
  getLessonRef,
  getNormalizedLesson,
  getAllNormalizedLessons,
} from "./registry";

/**
 * ContentSource — the formal boundary between "where lessons come from" and the
 * rest of the Academy (UI, search, SEO, prerender). Today it wraps the static
 * typed registry synchronously, which keeps the SPA fully synchronous and the
 * build/prerender simple.
 *
 * FUTURE ASYNC MIGRATION (honest plan): moving content to an API/CMS/DB will
 * require an async variant of this interface (e.g. `AsyncContentSource` with
 * Promise-returning methods) plus loading/error states in the pages and a
 * build-time snapshot export so prerender stays deterministic. A synchronous
 * interface alone does NOT solve API migration — it only isolates the call
 * sites so the change is contained here rather than spread across components.
 */
export interface ContentSource {
  listCategories(): AcademyCategory[];
  getCategory(idOrSlug: string): AcademyCategory | undefined;
  /** Normalized, published lessons ready for presentation/search/SEO. */
  listPublishedLessons(): NormalizedLesson[];
  getLesson(slug: string): NormalizedLesson | undefined;
  getRawLesson(slug: string): AcademyLesson | undefined;
  resolveRelated(slug: string): RelatedLessonRef | undefined;
}

/** Static implementation backed by the compiled TypeScript registry. */
export const staticContentSource: ContentSource = {
  listCategories: () => ACADEMY_CATEGORIES,
  getCategory: (idOrSlug) => getCategoryBySlug(idOrSlug),
  listPublishedLessons: () =>
    getAllNormalizedLessons().filter((l) => l.status === "published"),
  getLesson: (slug) => getNormalizedLesson(slug),
  getRawLesson: (slug) => getLessonBySlug(slug),
  resolveRelated: (slug) => getLessonRef(slug),
};

/** Shared content source used across the app. */
export const academyContent: ContentSource = staticContentSource;

import type { AcademyLesson } from "./types";

/**
 * Optional fields for a lesson. Every enhanced field is accepted so a lesson can
 * be upgraded in place (e.g. the flagship PnL lesson) without changing the
 * factory signature. The four positional args below stay the stable contract.
 */
export type LessonOpts = Partial<
  Omit<AcademyLesson, "slug" | "title" | "what" | "why">
>;

/** Compact lesson factory for maintainable category files. */
export function L(
  slug: string,
  title: string,
  what: string,
  why: string,
  opts: LessonOpts = {},
): AcademyLesson {
  return { slug, title, what, why, ...opts };
}

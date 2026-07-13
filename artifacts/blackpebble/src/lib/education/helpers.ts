import type { AcademyLesson, LessonCallout, LessonRelated } from "./types";

type LessonOpts = {
  aliases?: string[];
  keywords?: string[];
  example?: string;
  related?: LessonRelated;
  callout?: LessonCallout;
};

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

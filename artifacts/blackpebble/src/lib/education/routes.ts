/**
 * Central Academy URL construction. Components and SEO must build Academy URLs
 * through these helpers rather than string-concatenating paths inline, so the
 * route structure can evolve in one place.
 *
 * Structure:
 *   /learn                                   Academy homepage
 *   /learn/:categorySlug                     Category page
 *   /learn/:categorySlug/:lessonSlug         Lesson page
 */
export const ACADEMY_ROOT = "/learn";

export function academyHomePath(): string {
  return ACADEMY_ROOT;
}

export function categoryPath(categoryId: string): string {
  return `${ACADEMY_ROOT}/${categoryId}`;
}

export function lessonPath(categoryId: string, lessonSlug: string): string {
  return `${ACADEMY_ROOT}/${categoryId}/${lessonSlug}`;
}

/** Learning-path overview page. Uses a reserved `path` segment. */
export function learningPathPath(slug: string): string {
  return `${ACADEMY_ROOT}/path/${slug}`;
}

/** Absolute canonical URL for a learning path. */
export function learningPathCanonicalUrl(siteUrl: string, slug: string): string {
  return `${siteUrl.replace(/\/$/, "")}${learningPathPath(slug)}`;
}

/** Absolute canonical URL for a lesson (used by SEO/meta). */
export function lessonCanonicalUrl(
  siteUrl: string,
  categoryId: string,
  lessonSlug: string,
): string {
  return `${siteUrl.replace(/\/$/, "")}${lessonPath(categoryId, lessonSlug)}`;
}

/** Absolute canonical URL for a category. */
export function categoryCanonicalUrl(
  siteUrl: string,
  categoryId: string,
): string {
  return `${siteUrl.replace(/\/$/, "")}${categoryPath(categoryId)}`;
}

/** True for any path within the Academy. */
export function isAcademyPath(pathname: string): boolean {
  const clean = pathname.split(/[?#]/)[0];
  return clean === ACADEMY_ROOT || clean.startsWith(`${ACADEMY_ROOT}/`);
}

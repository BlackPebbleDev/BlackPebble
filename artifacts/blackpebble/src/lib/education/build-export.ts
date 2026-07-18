/**
 * Build-time export surface for Node scripts (prerender / sitemap generation).
 *
 * This module intentionally re-exports only serializable data and pure helpers
 * so it can be bundled with esbuild and imported from a plain Node script
 * without pulling in React or the `@/` alias. Keeping it here means the static
 * lesson HTML and sitemap are generated from the exact same registry the app
 * renders from.
 */
export {
  ACADEMY_CATEGORIES,
  getAllNormalizedLessons,
  getLessonRef,
} from "./registry";
export { lessonPath, categoryPath, learningPathPath } from "./routes";
export { lessonJsonLd } from "./structured-data";
export { getPublishedLearningPaths } from "./learning-paths";

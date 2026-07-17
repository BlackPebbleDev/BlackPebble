import type { AcademyLesson, LessonKind } from "./types";

/**
 * Derive how a lesson should be presented when it does not declare a `kind`.
 * Classification affects presentation and required content depth: a glossary
 * term needs far less structure than a risk-management or flagship lesson.
 */
export function classifyLesson(
  lesson: AcademyLesson,
  categoryId: string,
): LessonKind {
  if (lesson.kind) return lesson.kind;
  if (lesson.interactiveModule) return "flagship";

  switch (categoryId) {
    case "crypto-slang":
      return "glossary";
    case "blackpebble-features":
      return "feature-guide";
    case "wallets-safety":
    case "scam-awareness":
      return "safety";
    case "solana-basics":
      return "chain-specific";
    default:
      return "standard";
  }
}

export const LESSON_KIND_LABELS: Record<LessonKind, string> = {
  glossary: "Glossary term",
  standard: "Lesson",
  flagship: "Interactive lesson",
  "feature-guide": "Feature guide",
  safety: "Safety lesson",
  "chain-specific": "Chain-specific",
};

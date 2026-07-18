import type {
  AcademyCategory,
  AcademyInteractiveModuleRef,
  AcademyLesson,
  InteractiveModuleId,
  LessonCallout,
  LessonChainModule,
  LessonDifficulty,
  LessonKind,
  LessonQuiz,
  LessonRelated,
  LessonSectionKind,
  LessonSource,
  LessonStatus,
} from "./types";
import type { ChainScope } from "./chains";
import { classifyLesson } from "./classification";

export const SECTION_LABELS: Record<LessonSectionKind, string> = {
  "quick-answer": "Quick answer",
  what: "What it means",
  why: "Why it matters",
  how: "How it works",
  example: "Example",
  "common-mistakes": "Common mistakes",
  safety: "Safety considerations",
  advanced: "Advanced explanation",
  "chain-differences": "Chain differences",
  "try-in-blackpebble": "Try it in BlackPebble",
};

export interface NormalizedSection {
  kind: LessonSectionKind;
  title: string;
  body: string;
  advanced: boolean;
}

export interface RelatedLessonRef {
  slug: string;
  title: string;
  categoryId: string;
}

export interface NormalizedLessonSeo {
  title: string;
  description: string;
}

/**
 * Unified, presentation-ready view of a lesson. Produced from either the legacy
 * (what/why/example/related/callout) shape or the enhanced shape, so the lesson
 * page, search, and SEO generation all consume one stable structure.
 */
export interface NormalizedLesson {
  slug: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  kind: LessonKind;
  status: LessonStatus;
  shortAnswer?: string;
  summary?: string;
  difficulty?: LessonDifficulty;
  estimatedMinutes?: number;
  chainScope?: ChainScope;
  chainModules: LessonChainModule[];
  learningObjectives: string[];
  prerequisites: RelatedLessonRef[];
  sections: NormalizedSection[];
  examples: string[];
  callouts: LessonCallout[];
  commonMistakes: string[];
  relatedLessons: RelatedLessonRef[];
  relatedFeatures: LessonRelated[];
  sources: LessonSource[];
  /** @deprecated First module id, kept for back-compat. Use `interactiveModules`. */
  interactiveModule?: InteractiveModuleId;
  /** All interactive modules, ordered. Empty when the lesson has none. */
  interactiveModules: AcademyInteractiveModuleRef[];
  quiz?: LessonQuiz;
  aliases: string[];
  keywords: string[];
  updatedAt?: string;
  version?: number;
  seo: NormalizedLessonSeo;
}

export type LessonResolver = (slug: string) => RelatedLessonRef | undefined;

const MAX_DESC = 158;

/** Collapse whitespace and trim a candidate SEO/summary string. */
function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Build a search-engine-safe description, cut on a word boundary. */
export function deriveDescription(...candidates: (string | undefined)[]): string {
  const source = clean(candidates.find((c) => c && c.trim()) ?? "");
  if (source.length <= MAX_DESC) return source;
  const cut = source.slice(0, MAX_DESC);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : MAX_DESC).trimEnd()}…`;
}

function nonEmpty(value: string | undefined): value is string {
  return !!value && value.trim().length > 0;
}

function buildSections(lesson: AcademyLesson): NormalizedSection[] {
  if (lesson.sections && lesson.sections.length > 0) {
    return lesson.sections
      .filter((s) => nonEmpty(s.body))
      .map((s) => ({
        kind: s.kind,
        title: s.title ?? SECTION_LABELS[s.kind],
        body: s.body,
        advanced: !!s.advanced,
      }));
  }

  const sections: NormalizedSection[] = [];
  if (nonEmpty(lesson.shortAnswer)) {
    sections.push({
      kind: "quick-answer",
      title: SECTION_LABELS["quick-answer"],
      body: lesson.shortAnswer,
      advanced: false,
    });
  }
  if (nonEmpty(lesson.what)) {
    sections.push({
      kind: "what",
      title: SECTION_LABELS.what,
      body: lesson.what,
      advanced: false,
    });
  }
  if (nonEmpty(lesson.why)) {
    sections.push({
      kind: "why",
      title: SECTION_LABELS.why,
      body: lesson.why,
      advanced: false,
    });
  }
  return sections;
}

function buildCallouts(lesson: AcademyLesson): LessonCallout[] {
  const out: LessonCallout[] = [];
  if (lesson.callouts && lesson.callouts.length > 0) out.push(...lesson.callouts);
  if (lesson.callout) out.push(lesson.callout);
  return out;
}

function buildExamples(lesson: AcademyLesson): string[] {
  const out: string[] = [];
  if (lesson.examples && lesson.examples.length > 0) out.push(...lesson.examples);
  if (nonEmpty(lesson.example)) out.push(lesson.example);
  return out.filter(nonEmpty);
}

function buildRelatedFeatures(lesson: AcademyLesson): LessonRelated[] {
  if (lesson.relatedFeatures && lesson.relatedFeatures.length > 0) {
    return lesson.relatedFeatures;
  }
  return lesson.related ? [lesson.related] : [];
}

/**
 * Unify the legacy singular `interactiveModule` and the enhanced
 * `interactiveModules` array into one ordered list. Sorted by `order` (default
 * source order) so lessons can control module sequence deterministically.
 */
function buildInteractiveModules(
  lesson: AcademyLesson,
): AcademyInteractiveModuleRef[] {
  const refs: AcademyInteractiveModuleRef[] = [];
  if (lesson.interactiveModules && lesson.interactiveModules.length > 0) {
    refs.push(...lesson.interactiveModules);
  }
  if (lesson.interactiveModule) {
    const alreadyPresent = refs.some((r) => r.id === lesson.interactiveModule);
    if (!alreadyPresent) refs.push({ id: lesson.interactiveModule });
  }
  return refs
    .map((r, i) => ({ ...r, order: r.order ?? i }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Transform a lesson (legacy or enhanced) plus its category into a normalized,
 * presentation-ready view. `resolve` links related-lesson / prerequisite slugs
 * to their titles; unresolved references are dropped (validated by tests).
 */
export function normalizeLesson(
  lesson: AcademyLesson,
  category: AcademyCategory,
  resolve?: LessonResolver,
): NormalizedLesson {
  const kind = classifyLesson(lesson, category.id);
  const relatedLessons = (lesson.relatedLessonSlugs ?? [])
    .map((slug) => resolve?.(slug))
    .filter((r): r is RelatedLessonRef => !!r);
  const prerequisites = (lesson.prerequisites ?? [])
    .map((slug) => resolve?.(slug))
    .filter((r): r is RelatedLessonRef => !!r);

  const description = deriveDescription(
    lesson.seo?.description,
    lesson.shortAnswer,
    lesson.summary,
    lesson.what,
    lesson.why,
  );

  return {
    slug: lesson.slug,
    title: lesson.title,
    categoryId: category.id,
    categoryTitle: category.title,
    kind,
    status: lesson.status ?? "published",
    shortAnswer: lesson.shortAnswer,
    summary: lesson.summary,
    difficulty: lesson.difficulty,
    estimatedMinutes: lesson.estimatedMinutes,
    chainScope: lesson.chainScope,
    chainModules: lesson.chainModules ?? [],
    learningObjectives: lesson.learningObjectives ?? [],
    prerequisites,
    sections: buildSections(lesson),
    examples: buildExamples(lesson),
    callouts: buildCallouts(lesson),
    commonMistakes: lesson.commonMistakes ?? [],
    relatedLessons,
    relatedFeatures: buildRelatedFeatures(lesson),
    sources: lesson.sources ?? [],
    interactiveModule: buildInteractiveModules(lesson)[0]?.id,
    interactiveModules: buildInteractiveModules(lesson),
    quiz: lesson.quiz,
    aliases: lesson.aliases ?? [],
    keywords: lesson.keywords ?? [],
    updatedAt: lesson.updatedAt,
    version: lesson.version,
    seo: {
      title: lesson.seo?.title ?? `${lesson.title} | BlackPebble Academy`,
      description,
    },
  };
}

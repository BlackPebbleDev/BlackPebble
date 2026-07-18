import type { ChainKey, ChainScope } from "./chains";
import type { LessonDiagramRef } from "./diagrams";

export type CalloutType =
  | "why"
  | "safety"
  | "example"
  | "beginner"
  | "advanced"
  | "important"
  | "mistake"
  | "methodology";

export type LessonDifficulty = "beginner" | "intermediate" | "advanced";

/**
 * How a lesson is presented and how much structure it needs. A slang term does
 * not carry the same depth as a risk-management lesson. Derived automatically
 * when not set explicitly (see classification.ts).
 */
export type LessonKind =
  | "glossary"
  | "standard"
  | "flagship"
  | "feature-guide"
  | "safety"
  | "chain-specific";

export type LessonStatus = "published" | "draft";

/** Structured, ordered content block within an enhanced lesson. */
export type LessonSectionKind =
  | "quick-answer"
  | "what"
  | "why"
  | "how"
  | "stakes"
  | "example"
  | "common-mistakes"
  | "safety"
  | "advanced"
  | "chain-differences"
  | "try-in-blackpebble";

export interface LessonSection {
  kind: LessonSectionKind;
  /** Optional override for the default section label. */
  title?: string;
  /** Body text. May contain multiple sentences; kept as plain serializable text. */
  body: string;
  /** Advanced sections render behind progressive disclosure. */
  advanced?: boolean;
}

export interface LessonRelated {
  label: string;
  path: string;
}

/**
 * A short, concrete narrative used to teach a concept as a story rather than a
 * definition. Stories are far stickier for beginners: a named (fictional)
 * trader, what they expected, what actually happened, and why. `beats` power an
 * optional visual "replay" walkthrough.
 */
export interface LessonStory {
  /** Fictional character name, e.g. "Trevor". Kept clearly illustrative. */
  character?: string;
  /** The setup: what the trader is doing. */
  setup: string;
  /** What they expected to happen. */
  expectation?: string;
  /** What actually happened. */
  reality?: string;
  /** Why it happened — the teachable moment. */
  lesson: string;
  /** Optional ordered replay beats for a step-through walkthrough. */
  beats?: LessonStoryBeat[];
}

export interface LessonStoryBeat {
  label: string;
  detail: string;
  /** Optional signed value to color the beat (e.g. "-8%", "+40%"). */
  value?: string;
  tone?: "neutral" | "positive" | "negative";
}

export interface LessonCallout {
  type: CalloutType;
  text: string;
}

/** Authoritative citation or methodology reference. Never expose empty sources. */
export interface LessonSource {
  label: string;
  url?: string;
  note?: string;
}

/** Optional chain-specific module composed onto a multichain lesson core. */
export interface LessonChainModule {
  chain: ChainKey;
  title?: string;
  body: string;
}

/** Per-lesson SEO overrides. When absent, values are derived from content. */
export interface LessonSeoOverride {
  title?: string;
  description?: string;
}

/**
 * Typed identifier for an interactive module. The content model refers to
 * interactive UI by a safe id resolved through the interactive registry — never
 * by storing executable component code inside content data.
 */
export type InteractiveModuleId =
  | "pnl-simulator"
  | "market-cap-calculator"
  | "market-cap-fdv-simulator"
  | "liquidity-price-impact-simulator"
  | "slippage-simulator"
  | "order-type-challenge"
  | "stop-loss-take-profit-planner"
  | "position-size-calculator"
  | "wallet-signing-challenge"
  | "seed-phrase-safety-exercise"
  | "holder-concentration-explorer"
  | "memecoin-launch-lifecycle"
  | "bonding-curve-simulator"
  | "rug-pull-scenario"
  | "trading-psychology-scenarios";

/** Where a module renders relative to the lesson body. */
export type InteractivePlacement = "inline" | "after-sections" | "standalone";

/** What counts as "completing" an interactive module. */
export type InteractiveCompletionRule = "view" | "interact" | "complete";

/**
 * A reference from lesson content to an interactive module. Configuration is a
 * plain serializable object validated by the module; never executable code.
 */
export interface AcademyInteractiveModuleRef {
  id: InteractiveModuleId;
  /** Serializable, module-specific configuration (defaults, scenarios, ...). */
  config?: Record<string, unknown>;
  title?: string;
  description?: string;
  placement?: InteractivePlacement;
  required?: boolean;
  order?: number;
  estimatedMinutes?: number;
  completionRule?: InteractiveCompletionRule;
}

export type LessonQuizQuestionKind = "single" | "multiple" | "boolean";

/** One knowledge-check question. */
export interface LessonQuizQuestion {
  id: string;
  prompt: string;
  /** Defaults to "single" when omitted. */
  kind?: LessonQuizQuestionKind;
  options: string[];
  /** For single/boolean questions. */
  correctIndex?: number;
  /** For multiple-choice questions (order independent). */
  correctIndices?: number[];
  /** Shown after answering. Required by content validation. */
  explanation: string;
}
export interface LessonQuiz {
  id: string;
  title?: string;
  questions: LessonQuizQuestion[];
  /** Optional passing threshold (0-1) for messaging only; not gating. */
  passRatio?: number;
}

/**
 * One academy lesson. The first four fields are the stable legacy contract used
 * by all 138 lessons and remain required. Everything else is optional and
 * additive, letting individual lessons be upgraded to the enhanced model
 * without rewriting the rest. `normalizeLesson` unifies both shapes.
 *
 * Deep-linkable via slug at /learn/<category>/<slug> (and legacy /learn#slug).
 */
export interface AcademyLesson {
  slug: string;
  title: string;
  what: string;
  why: string;

  // ── Legacy optional fields (kept, still supported) ─────────────────────────
  aliases?: string[];
  keywords?: string[];
  difficulty?: LessonDifficulty;
  example?: string;
  related?: LessonRelated;
  callout?: LessonCallout;

  // ── Enhanced optional fields (backward compatible) ─────────────────────────
  /** One-sentence answer shown first (progressive disclosure). */
  shortAnswer?: string;
  /** Slightly longer overview for cards and metadata. */
  summary?: string;
  estimatedMinutes?: number;
  learningObjectives?: string[];
  /** Slugs of lessons a reader should understand first. */
  prerequisites?: string[];
  /** Structured content sections (supersedes what/why/example when present). */
  sections?: LessonSection[];
  /** Additional worked examples beyond the legacy single `example`. */
  examples?: string[];
  /** Multiple callouts (supersedes the single legacy `callout` when present). */
  callouts?: LessonCallout[];
  commonMistakes?: string[];
  /** Slugs forming the related-lesson graph. */
  relatedLessonSlugs?: string[];
  /** Multiple related BlackPebble features (supersedes single `related`). */
  relatedFeatures?: LessonRelated[];
  sources?: LessonSource[];
  chainScope?: ChainScope;
  chainModules?: LessonChainModule[];
  /** @deprecated Prefer `interactiveModules`. Still supported for back-compat. */
  interactiveModule?: InteractiveModuleId;
  /** One or more interactive modules, rendered in `order`. */
  interactiveModules?: AcademyInteractiveModuleRef[];
  /** Lightweight SVG diagrams that explain the concept visually. */
  diagrams?: LessonDiagramRef[];
  /** Optional narrative that teaches the concept as a short, concrete story. */
  story?: LessonStory;
  /** Beginner-friendly tips (encouraging, practical, non-advisory). */
  tips?: string[];
  quiz?: LessonQuiz;
  seo?: LessonSeoOverride;
  kind?: LessonKind;
  status?: LessonStatus;
  updatedAt?: string;
  version?: number;
}

export type CategoryIcon =
  | "compass"
  | "trending"
  | "bar-chart"
  | "shield"
  | "link"
  | "wallet"
  | "rocket"
  | "alert"
  | "sparkles"
  | "users"
  | "hand-coins"
  | "message";

/** Experience level a category is primarily aimed at (drives "browse by level"). */
export type CategoryLevel = "beginner" | "intermediate" | "advanced";

export interface AcademyCategory {
  id: string;
  title: string;
  icon: CategoryIcon;
  lessons: AcademyLesson[];
  /** Optional short description shown on category surfaces. */
  description?: string;
  /** Optional level grouping for "browse by experience". */
  level?: CategoryLevel;
}

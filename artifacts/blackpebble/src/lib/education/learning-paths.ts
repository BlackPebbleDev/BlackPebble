import type { ChainScope } from "./chains";
import type { InteractiveModuleId, LessonDifficulty, LessonStatus } from "./types";

/**
 * Learning paths are ordered curricula over existing lessons. They are data, not
 * prose: the path UI and progress tracking read this structure directly. Steps
 * reference real lesson slugs so a path is validated against the registry.
 */
export interface LearningPath {
  id: string;
  slug: string;
  title: string;
  description: string;
  audience: string;
  difficulty: LessonDifficulty;
  estimatedMinutes: number;
  /** Ordered lesson slugs that make up the path. */
  lessonSlugs: string[];
  /** Interactive modules a learner should meaningfully try along the way. */
  requiredModuleIds?: InteractiveModuleId[];
  prerequisites?: string[];
  outcomes: string[];
  chainScope: ChainScope;
  status: LessonStatus;
  order: number;
  /** Final call-to-action route (e.g. Paper Trading). */
  finalActionPath?: string;
  finalActionLabel?: string;
}

const BEGINNER_ESSENTIALS: LearningPath = {
  id: "beginner-essentials",
  slug: "beginner-essentials",
  title: "Crypto & Memecoin Beginner Essentials",
  description:
    "Start from zero. Understand how BlackPebble works, how tokens are priced, how to read risk, how to protect your wallet, and how to practice safely — then place a guided paper trade.",
  audience: "Complete beginners",
  difficulty: "beginner",
  estimatedMinutes: 75,
  lessonSlugs: [
    "what-is-blackpebble",
    "paper-vs-real-trading",
    "connecting-vs-signing",
    "private-key-and-seed",
    "token-supply",
    "price-and-market-cap",
    "fdv",
    "volume-and-liquidity",
    "price-impact-and-slippage",
    "order-types",
    "automated-exits",
    "position-sizing-and-risk",
    "risk-to-reward",
    "profit-and-loss",
    "launch-lifecycle",
    "bonding-curves",
    "top-holders",
    "rug-pulls",
    "trading-psychology",
    "use-blackpebble-safely",
  ],
  requiredModuleIds: [
    "market-cap-calculator",
    "slippage-simulator",
    "position-size-calculator",
    "wallet-signing-challenge",
    "pnl-simulator",
  ],
  outcomes: [
    "Explain price, supply, market cap, and FDV in plain language",
    "Recognize liquidity and slippage risk before trading",
    "Plan a trade with a stop, target, and sensible position size",
    "Tell a safe wallet request from a dangerous one",
    "Identify common rug-pull warning signs",
    "Practice a first trade with no real funds at risk",
  ],
  chainScope: "universal",
  status: "published",
  order: 0,
  finalActionPath: "/",
  finalActionLabel: "Place a guided paper trade",
};

export const LEARNING_PATHS: LearningPath[] = [BEGINNER_ESSENTIALS];

export function getLearningPath(slug: string): LearningPath | undefined {
  return LEARNING_PATHS.find((p) => p.slug === slug || p.id === slug);
}

export function getPublishedLearningPaths(): LearningPath[] {
  return LEARNING_PATHS.filter((p) => p.status === "published").sort(
    (a, b) => a.order - b.order,
  );
}

/**
 * First published path that contains a given lesson slug. Used by the lesson
 * page to show path context (left rail, celebration progress) when a lesson is
 * part of a guided path.
 */
export function getPathForLesson(slug: string): LearningPath | undefined {
  return getPublishedLearningPaths().find((p) => p.lessonSlugs.includes(slug));
}

export interface PathCompletion {
  total: number;
  completed: number;
  pct: number;
  /** Index of the first not-yet-completed step, or -1 when all are complete. */
  resumeIndex: number;
  isComplete: boolean;
}

/**
 * Pure progress calculation for a path given a predicate for completed lessons.
 * Kept UI-agnostic so it can be unit tested and reused across the path page and
 * the homepage banner.
 */
export function computePathCompletion(
  lessonSlugs: string[],
  isCompleted: (slug: string) => boolean,
): PathCompletion {
  const total = lessonSlugs.length;
  const completed = lessonSlugs.filter((s) => isCompleted(s)).length;
  const resumeIndex = lessonSlugs.findIndex((s) => !isCompleted(s));
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return {
    total,
    completed,
    pct,
    resumeIndex,
    isComplete: total > 0 && completed === total,
  };
}

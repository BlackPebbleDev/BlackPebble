import type { InteractiveModuleId } from "@/lib/education/types";

/**
 * Human-friendly label for each interactive module, grouped into a small set of
 * recognisable "types" (Simulator, Calculator, Scenario, ...). Used on lesson
 * cards and the interactive browse page so learners can see *what kind* of
 * hands-on experience a lesson offers — and filter by it. Plain data (no React)
 * so it is safe to import anywhere, including node scripts and tests.
 */
export type InteractiveType =
  | "Simulator"
  | "Calculator"
  | "Scenario"
  | "Challenge"
  | "Planner"
  | "Explorer"
  | "Timeline"
  | "Flashcards"
  | "Ordering"
  | "Prediction";

const LABELS: Record<InteractiveModuleId, InteractiveType> = {
  "pnl-simulator": "Simulator",
  "market-cap-calculator": "Calculator",
  "market-cap-fdv-simulator": "Simulator",
  "liquidity-price-impact-simulator": "Simulator",
  "slippage-simulator": "Simulator",
  "order-type-challenge": "Challenge",
  "stop-loss-take-profit-planner": "Planner",
  "position-size-calculator": "Calculator",
  "wallet-signing-challenge": "Challenge",
  "seed-phrase-safety-exercise": "Scenario",
  "holder-concentration-explorer": "Explorer",
  "memecoin-launch-lifecycle": "Timeline",
  "bonding-curve-simulator": "Simulator",
  "rug-pull-scenario": "Scenario",
  "trading-psychology-scenarios": "Scenario",
  "concept-reveal": "Flashcards",
  "sequence-builder": "Ordering",
  "spot-the-scam": "Scenario",
  "predict-outcome": "Prediction",
};

/** The interactive "type" for a module id (defaults to Simulator if unknown). */
export function interactiveTypeLabel(id: InteractiveModuleId): InteractiveType {
  return LABELS[id] ?? "Simulator";
}

/** The distinct set of interactive types, in a stable display order. */
export const INTERACTIVE_TYPES: InteractiveType[] = [
  "Simulator",
  "Calculator",
  "Scenario",
  "Prediction",
  "Challenge",
  "Planner",
  "Explorer",
  "Timeline",
  "Flashcards",
  "Ordering",
];

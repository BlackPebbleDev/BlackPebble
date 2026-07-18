/**
 * Lesson diagram registry (plain data).
 *
 * Diagrams are lightweight, theme-aware inline SVG illustrations that let a
 * complete beginner grasp a concept *before* reading a paragraph. Like
 * interactive modules, lesson content references a diagram by a safe typed id —
 * never by embedding component code — so content stays serializable and can be
 * validated by node tests and the prerender pipeline without importing React.
 *
 * The visual components themselves live in
 * `src/components/education/diagrams/` and are wired to these ids by the diagram
 * registry there. This file is the single source of truth for which diagram ids
 * exist so content validation can guarantee every referenced diagram resolves.
 */

export type LessonDiagramId =
  | "wallet-keys"
  | "seed-phrase"
  | "connect-vs-sign"
  | "transaction-flow"
  | "market-cap"
  | "fdv"
  | "liquidity-pool"
  | "price-impact"
  | "slippage"
  | "stop-loss-take-profit"
  | "order-types"
  | "bonding-curve"
  | "holder-concentration"
  | "token-lifecycle"
  | "paper-trading"
  | "portfolio"
  | "rug-pull"
  | "risk-reward"
  | "trader-intelligence"
  | "wallet-cleanup";

/**
 * A reference from lesson content to a diagram. `caption` overrides the
 * diagram's default caption; `placement` hints where it should render relative
 * to the lesson body.
 */
export interface LessonDiagramRef {
  id: LessonDiagramId;
  caption?: string;
  /** "top" renders under the short answer (default); "inline" after sections. */
  placement?: "top" | "inline";
}

export const LESSON_DIAGRAM_IDS = [
  "wallet-keys",
  "seed-phrase",
  "connect-vs-sign",
  "transaction-flow",
  "market-cap",
  "fdv",
  "liquidity-pool",
  "price-impact",
  "slippage",
  "stop-loss-take-profit",
  "order-types",
  "bonding-curve",
  "holder-concentration",
  "token-lifecycle",
  "paper-trading",
  "portfolio",
  "rug-pull",
  "risk-reward",
  "trader-intelligence",
  "wallet-cleanup",
] as const satisfies readonly LessonDiagramId[];

const DIAGRAM_ID_SET = new Set<string>(LESSON_DIAGRAM_IDS);

export function isRegisteredDiagramId(id: string): id is LessonDiagramId {
  return DIAGRAM_ID_SET.has(id);
}

/**
 * Community Campaigns - centralized lifecycle state machine (Phase 2).
 *
 * This is the single source of truth for campaign states and the transitions
 * allowed between them. The engine never hard-codes a transition; it asks this
 * module. Everything here is pure so the machine is exhaustively testable.
 *
 * Backward compatibility: Phase 1 rows used `settled` / `failed` /
 * `pending_funding`. `normalizeState` maps those to their canonical Phase 2
 * equivalents, and `ensureCampaignSchema` runs a one-time forward migration of
 * terminal legacy states. Ledger and event history are never rewritten.
 */

export const LIFECYCLE_STATES = [
  "draft",
  "awaiting_initial_contribution",
  "live",
  "funded",
  "awaiting_execution",
  "executing",
  "completed",
  "expired",
  "execution_failed",
  "refunding",
  "refunded",
  "frozen",
  "cancelled",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/**
 * Explicit allowed transitions. `frozen` is reachable from every money-active
 * state (safety), and admin unfreeze restores one of the money-active states.
 */
export const ALLOWED_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  draft: ["awaiting_initial_contribution", "cancelled"],
  awaiting_initial_contribution: ["live", "expired", "cancelled"],
  live: ["funded", "expired", "frozen"],
  funded: ["awaiting_execution", "frozen"],
  awaiting_execution: ["executing", "execution_failed", "frozen"],
  executing: ["completed", "execution_failed", "frozen"],
  completed: [],
  expired: ["refunding", "frozen"],
  execution_failed: ["refunding", "frozen"],
  refunding: ["refunded", "frozen"],
  refunded: [],
  frozen: [
    "live",
    "funded",
    "awaiting_execution",
    "executing",
    "expired",
    "execution_failed",
    "refunding",
  ],
  cancelled: [],
};

/** States in which escrow holds or moves funds (eligible to be frozen). */
const MONEY_ACTIVE = new Set<LifecycleState>([
  "live",
  "funded",
  "awaiting_execution",
  "executing",
  "expired",
  "refunding",
]);

const TERMINAL = new Set<LifecycleState>(["completed", "refunded", "cancelled"]);

/** After a refund starts, normal execution is permanently blocked. */
const REFUND_LOCKED = new Set<LifecycleState>([
  "refunding",
  "refunded",
]);

export const LEGACY_STATE_MAP: Record<string, LifecycleState> = {
  settled: "completed",
  failed: "expired",
  pending_funding: "awaiting_initial_contribution",
};

export function isLifecycleState(s: string): s is LifecycleState {
  return (LIFECYCLE_STATES as readonly string[]).includes(s);
}

/** Map a possibly-legacy DB state string to its canonical Phase 2 state. */
export function normalizeState(raw: string): LifecycleState {
  if (isLifecycleState(raw)) return raw;
  return LEGACY_STATE_MAP[raw] ?? "draft";
}

export function canTransition(from: string, to: string): boolean {
  const f = normalizeState(from);
  if (!isLifecycleState(to)) return false;
  return ALLOWED_TRANSITIONS[f]?.includes(to) ?? false;
}

export function isMoneyActive(state: string): boolean {
  return MONEY_ACTIVE.has(normalizeState(state));
}

export function isTerminal(state: string): boolean {
  return TERMINAL.has(normalizeState(state));
}

/** Once a refund has started/finished, execution must never run again. */
export function isRefundLocked(state: string): boolean {
  return REFUND_LOCKED.has(normalizeState(state));
}

/** Only a live campaign accepts open public contributions. */
export function canAcceptPublicContribution(state: string): boolean {
  return normalizeState(state) === "live";
}

/**
 * Automatic funding-phase transition for a live campaign given the clock and
 * ledger. Returns null when nothing is due.
 */
export function dueFundingTransition(
  state: string,
  deposited: number,
  goal: number,
  deadlineAt: number,
  nowSec: number,
): LifecycleState | null {
  if (normalizeState(state) !== "live") return null;
  if (deposited >= goal) return "funded";
  if (nowSec >= deadlineAt) return "expired";
  return null;
}

/**
 * The DB column (if any) to stamp with `now` when a campaign ENTERS a state, so
 * lifecycle timestamps are recorded consistently by the transition helper.
 */
export const STATE_TIMESTAMP_COLUMN: Partial<Record<LifecycleState, string>> = {
  live: "activated_at",
  funded: "funded_at",
  executing: "execution_started_at",
  completed: "settled_at",
  refunding: "refunding_at",
  refunded: "settled_at",
  expired: "expired_at",
};

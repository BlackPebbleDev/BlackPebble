/**
 * Community Campaigns - pure reconciliation, settlement-destination, and
 * deposit-sweep decision helpers.
 *
 * Everything here is deterministic and side-effect free so the money-safety
 * rules can be exhaustively unit-tested. The escrow service and engine call
 * these; they never re-implement the arithmetic.
 */

import type { SettlementPlan } from "./campaign-math.js";

/**
 * Base Solana signature fee for a single-signer SystemProgram transfer. The
 * escrow keypair is the sole signer and we attach no priority fee, so every
 * outbound transfer costs exactly this from the escrow balance. It is recorded
 * as a `fee` ledger row so `remaining` always equals the true on-chain balance.
 */
export const NETWORK_FEE_LAMPORTS = 5_000;

/** A deposit signature is retried this many times before being flagged. */
export const MAX_DEPOSIT_PARSE_ATTEMPTS = 5;

/** How many pages of 100 signatures a single sweep will walk backwards. */
export const MAX_SWEEP_PAGES = 20;

// ── Settlement destinations (no stranded fees) ───────────────────────────────

export interface SettlementDestinations {
  payoutLamports: number;
  feeLamports: number;
  excessLamports: number;
}

/**
 * Resolve where each lamport of a funded campaign goes. If there is no
 * configured fee wallet the platform fee is folded back into the payout rather
 * than being deducted and stranded in escrow: every lamport of the goal then
 * has exactly one destination.
 */
export function resolveSettlementDestinations(
  plan: SettlementPlan,
  hasFeeWallet: boolean,
): SettlementDestinations {
  if (hasFeeWallet && plan.feeLamports > 0) {
    return {
      payoutLamports: plan.payoutLamports,
      feeLamports: plan.feeLamports,
      excessLamports: plan.excessLamports,
    };
  }
  return {
    payoutLamports: plan.payoutLamports + plan.feeLamports,
    feeLamports: 0,
    excessLamports: plan.excessLamports,
  };
}

// ── Contributor / refund-destination safety ──────────────────────────────────

export type RefundRisk = "ok" | "exchange" | "program" | "unknown";

/**
 * Classify a contributor's sending wallet for refund safety. A refund is sent
 * back to the exact sender; if the sender is a centralized-exchange hot wallet
 * or a program/contract account, an automatic refund may never reach the human
 * who contributed, so it is flagged for admin review rather than silently sent.
 */
export function classifyRefundRisk(opts: {
  /** True if the account is owned by the System Program (a normal wallet). */
  isSystemOwned: boolean | null;
  /** True if the address matches a known exchange/custodial label. */
  isKnownExchange: boolean;
}): RefundRisk {
  if (opts.isKnownExchange) return "exchange";
  if (opts.isSystemOwned === false) return "program";
  if (opts.isSystemOwned === null) return "unknown";
  return "ok";
}

// ── Deposit sweep decisions ──────────────────────────────────────────────────

/**
 * Whether a repeatedly-unparseable signature should be retried again on the
 * next sweep or flagged and stepped over so it cannot poison newer deposits.
 */
export function depositFailureAction(
  attempts: number,
  max: number = MAX_DEPOSIT_PARSE_ATTEMPTS,
): "retry" | "flag" {
  return attempts >= max ? "flag" : "retry";
}

// ── Funding milestones ───────────────────────────────────────────────────────

export const MILESTONES = [25, 50, 75, 100] as const;
export type Milestone = (typeof MILESTONES)[number];

/** Milestone percentages newly crossed moving from `before` to `after`. */
export function milestonesCrossed(
  beforeProgress: number,
  afterProgress: number,
): Milestone[] {
  const beforePct = beforeProgress * 100;
  const afterPct = afterProgress * 100;
  return MILESTONES.filter((m) => beforePct < m && afterPct >= m);
}

// ── Reconciliation ───────────────────────────────────────────────────────────

export type ReconSeverity = "ok" | "warning" | "critical";

export interface ReconInput {
  state: string;
  /** ledger deposited - paidOut - refunded - fees. */
  ledgerRemaining: number;
  onChainBalance: number;
  unresolvedDepositFailures: number;
  /** Failed-campaign contributions not yet refunded (above the network fee). */
  outstandingRefunds: number;
  toleranceLamports?: number;
}

export interface ReconReport {
  severity: ReconSeverity;
  /** onChainBalance - ledgerRemaining. Positive: escrow holds extra. */
  balanceDiff: number;
  warnings: string[];
}

/**
 * Compare a campaign's ledger against its on-chain reality and outstanding
 * obligations. Never mutates anything - it only classifies. The engine decides
 * what to do (freeze on critical, surface warnings to admin).
 */
export function reconcileCampaign(i: ReconInput): ReconReport {
  const tol = i.toleranceLamports ?? 0;
  const balanceDiff = i.onChainBalance - i.ledgerRemaining;
  const warnings: string[] = [];
  let critical = false;
  let warning = false;

  if (balanceDiff < -tol) {
    critical = true;
    warnings.push(
      `Escrow holds ${i.onChainBalance} lamports but the ledger expects ${i.ledgerRemaining}; funds left escrow without a ledger row.`,
    );
  } else if (balanceDiff > tol) {
    warning = true;
    warnings.push(
      `Escrow holds ${balanceDiff} lamports more than the ledger records (uncredited deposits).`,
    );
  }

  if (i.unresolvedDepositFailures > 0) {
    warning = true;
    warnings.push(
      `${i.unresolvedDepositFailures} deposit signature(s) failed to parse and remain unresolved.`,
    );
  }

  const refundLifecycle = ["failed", "expired", "execution_failed", "refunding"];
  if (refundLifecycle.includes(i.state) && i.outstandingRefunds > 0) {
    warning = true;
    warnings.push(
      `${i.outstandingRefunds} contribution(s) are still awaiting a refund.`,
    );
  }

  if (i.state === "frozen") {
    warning = true;
    warnings.push("Campaign is frozen; money movement is locked pending review.");
  }

  const severity: ReconSeverity = critical
    ? "critical"
    : warning
      ? "warning"
      : "ok";
  return { severity, balanceDiff, warnings };
}

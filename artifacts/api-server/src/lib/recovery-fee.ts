/**
 * Recovery Fee Architecture — DISABLED scaffolding (Phase G).
 *
 * ┌──────────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐
 * │ Recovery Fee │──▶│ Treasury │──▶│ Buybacks │──▶│ Burns  │
 * └──────────────┘   └──────────┘   └──────────┘   └────────┘
 *
 * This module defines the SHAPE of a future recovery-fee pipeline so the rest of
 * the codebase has a single, typed place to read fee policy from. It is
 * deliberately INERT:
 *
 *   • The master switch (`enabled`) is false.
 *   • The fee rate (`feeBps`) is 0.
 *   • Every pipeline stage (treasury routing, buybacks, burns, token logic) is
 *     disabled and carries NO wallet / token / program address.
 *   • `calculateRecoveryFee()` ALWAYS returns a 0 fee while disabled, so wiring
 *     it into the recovery flow cannot change a single payout.
 *
 * NOTHING here charges a user, moves SOL, touches a treasury, performs a buyback,
 * burns a token, or enables any token logic. There is no hidden fee behavior:
 * the only way a non-zero fee could ever be produced is to flip `enabled` to true
 * AND set a non-zero `feeBps` in a future, deliberate change. Until then BlackPebble
 * recovery remains 100% free and recovery transaction outputs are unchanged.
 */

/** A single stage in the (future) recovery-fee value pipeline. */
export interface RecoveryFeeStage {
  /** Stable machine key for the stage. */
  key: "recovery_fee" | "treasury" | "buybacks" | "burns";
  /** Human label for admin display. */
  label: string;
  /** Whether this stage is active. ALWAYS false today. */
  enabled: boolean;
  /** What the stage will eventually do — documentation only. */
  description: string;
}

/** Full recovery-fee policy. Serializable so it can be surfaced to admins. */
export interface RecoveryFeeConfig {
  /** Master switch for the whole fee system. Disabled. */
  enabled: boolean;
  /** Fee rate in basis points (1 bps = 0.01%). 0 = no fee. */
  feeBps: number;
  /** Optional floor / ceiling on the fee in SOL. Inert while disabled. */
  minFeeSol: number;
  maxFeeSol: number | null;
  /** Destination wallet for collected fees. Intentionally unset. */
  treasuryWallet: string | null;
  /** Token the future buyback/burn pipeline would act on. Intentionally unset. */
  buybackToken: string | null;
  /** Ordered description of the future Fee → Treasury → Buybacks → Burns flow. */
  pipeline: RecoveryFeeStage[];
}

/**
 * The canonical, frozen recovery-fee configuration. Every field is set to its
 * safe "off" value. Changing any of these is the ONLY way to alter fee behavior,
 * which keeps the disabled state explicit and auditable.
 */
export const RECOVERY_FEE_CONFIG: RecoveryFeeConfig = Object.freeze({
  enabled: false,
  feeBps: 0,
  minFeeSol: 0,
  maxFeeSol: null,
  treasuryWallet: null,
  buybackToken: null,
  // Each stage is frozen too (deep freeze) so the disabled flags cannot be
  // flipped by accidental in-process mutation — only a deliberate source change.
  pipeline: [
    Object.freeze({
      key: "recovery_fee",
      label: "Recovery Fee",
      enabled: false,
      description:
        "Optional future platform fee skimmed from recovered rent. Disabled: 0% is taken, users keep 100%.",
    }),
    Object.freeze({
      key: "treasury",
      label: "Treasury",
      enabled: false,
      description:
        "Where a future fee would accumulate before deployment. No treasury wallet configured.",
    }),
    Object.freeze({
      key: "buybacks",
      label: "Buybacks",
      enabled: false,
      description:
        "Future use of treasury funds to buy back the project token. No buybacks performed.",
    }),
    Object.freeze({
      key: "burns",
      label: "Burns",
      enabled: false,
      description:
        "Future burning of bought-back tokens. No token logic enabled, nothing is burned.",
    }),
  ],
}) as RecoveryFeeConfig;

/** Result of a recovery-fee calculation. */
export interface RecoveryFeeBreakdown {
  /** The platform fee in SOL. 0 while fees are disabled. */
  bpFeeSol: number;
  /** Recovered SOL the user keeps after the fee. Equals input while disabled. */
  netSol: number;
  /** Whether a fee was actually applied. Always false today. */
  applied: boolean;
}

/**
 * Calculate the BlackPebble recovery fee for a given amount of recovered SOL.
 *
 * While {@link RECOVERY_FEE_CONFIG}.enabled is false (the current and default
 * state) this ALWAYS returns a 0 fee and `netSol === recoveredSol`, so it is a
 * safe no-op that can be wired anywhere without changing payouts. The computed
 * branch only exists to document the future math; it can never run today because
 * both `enabled` is false and `feeBps` is 0.
 */
export function calculateRecoveryFee(
  recoveredSol: number,
  config: RecoveryFeeConfig = RECOVERY_FEE_CONFIG,
): RecoveryFeeBreakdown {
  const recovered = Number.isFinite(recoveredSol) && recoveredSol > 0
    ? recoveredSol
    : 0;

  // Disabled (or zero-rate) → no fee, ever. This is the path taken today.
  if (!config.enabled || config.feeBps <= 0) {
    return { bpFeeSol: 0, netSol: recovered, applied: false };
  }

  // ── Future math (UNREACHABLE while disabled) ──────────────────────────────
  let fee = (recovered * config.feeBps) / 10_000;
  if (config.minFeeSol > 0) fee = Math.max(fee, config.minFeeSol);
  if (config.maxFeeSol != null) fee = Math.min(fee, config.maxFeeSol);
  fee = Math.min(fee, recovered);
  return { bpFeeSol: fee, netSol: Math.max(0, recovered - fee), applied: true };
}

/** Admin-facing fee status. Serializable snapshot of the current (off) policy. */
export interface RecoveryFeeStatus {
  /** True when fees are active. Always false today. */
  active: boolean;
  feeBps: number;
  feePercent: number;
  treasuryConfigured: boolean;
  buybacksEnabled: boolean;
  burnsEnabled: boolean;
  pipeline: RecoveryFeeStage[];
  /** Plain-language summary for the admin dashboard. */
  summary: string;
}

/** Build the admin fee-status snapshot from the canonical config. */
export function getRecoveryFeeStatus(
  config: RecoveryFeeConfig = RECOVERY_FEE_CONFIG,
): RecoveryFeeStatus {
  const active = config.enabled && config.feeBps > 0;
  const stage = (key: RecoveryFeeStage["key"]) =>
    config.pipeline.find((s) => s.key === key)?.enabled ?? false;
  return {
    active,
    feeBps: config.feeBps,
    feePercent: config.feeBps / 100,
    treasuryConfigured: config.treasuryWallet != null,
    buybacksEnabled: stage("buybacks"),
    burnsEnabled: stage("burns"),
    pipeline: config.pipeline,
    summary: active
      ? `Recovery fee active at ${config.feeBps / 100}%`
      : "Recovery fees are DISABLED — users keep 100% of recovered SOL. No treasury, buybacks, burns, or token logic are active.",
  };
}

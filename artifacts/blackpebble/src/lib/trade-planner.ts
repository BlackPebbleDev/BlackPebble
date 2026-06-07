/**
 * Trade Planner — pure calculation + parsing logic.
 *
 * Frontend-only utility. Nothing here touches paper trading, portfolio,
 * leaderboard, market feeds, auth, the API, or the database. It is deliberately
 * dependency-free and side-effect-free so future planner modules (Moonbag, DCA,
 * Scenario Simulator, Profit Taking, Trade Journal, Conviction Simulator) can
 * reuse the same primitives.
 *
 * The math works on "valuations" — a valuation is either a market cap or a token
 * price. Because every output is a ratio of valuations (downside/upside/multiple),
 * the formulas are identical in both modes; only display/formatting differs.
 */

export type InputMode = "marketcap" | "price";

/**
 * Mode A ("risk"): account size + risk % + stop drive a *suggested* position.
 * Mode B ("fixed"): a preferred position size drives the *actual* risk taken.
 */
export type SizingMode = "risk" | "fixed";

export type SetupRating = "Excellent" | "Good" | "Weak" | "High Risk";

export interface PlanInput {
  inputMode: InputMode;
  sizingMode: SizingMode;
  /** Entry valuation (market cap or price). */
  entry: number | null;
  /** Stop valuation. For a long this must be below entry. */
  stop: number | null;
  /** Target valuation. For a long this must be above entry. */
  target: number | null;
  /** Optional current valuation — informational only. */
  current: number | null;
  /** Account size in SOL. */
  accountSize: number | null;
  /** Risk per trade as a percent, e.g. 2 means 2%. */
  riskPct: number | null;
  /** Preferred position size in SOL (Mode B). */
  preferredSize: number | null;
}

export interface PlanErrors {
  entry?: string;
  stop?: string;
  target?: string;
  accountSize?: string;
  riskPct?: string;
  preferredSize?: string;
}

export interface PlanResult {
  errors: PlanErrors;
  /** True when entry/stop/target form a valid long trade. */
  tradeValid: boolean;
  /** True when a position size could be derived (sizing inputs valid too). */
  sizingValid: boolean;

  downsidePct: number | null;
  upsidePct: number | null;
  riskReward: number | null;
  targetMultiple: number | null;
  requiredGainPct: number | null;

  /** Mode A: maximum SOL at risk (account * risk%). */
  maxRisk: number | null;
  /** Mode A: position size such that a stop-out loses exactly maxRisk. */
  suggestedPosition: number | null;

  /** Effective position size used for projections (suggested or preferred). */
  positionSize: number | null;
  /** SOL lost if stopped out at the effective position size. */
  lossAtStop: number | null;
  /** Loss at stop as a percent of account size, when account is known. */
  riskPctOfAccount: number | null;

  /** Position value if target is reached. */
  valueAtTarget: number | null;
  /** Profit if target is reached (valueAtTarget - positionSize). */
  profitAtTarget: number | null;

  rating: SetupRating | null;
}

export interface TargetProjection {
  multiple: number;
  /** Projected valuation (entry * multiple) — market cap or price. */
  valuation: number | null;
  /** Position value at this multiple. */
  positionValue: number | null;
  /** Profit at this multiple (positionValue - positionSize). */
  profit: number | null;
}

/** Quick-projection multiples shown as buttons in the Profit Targets section. */
export const QUICK_MULTIPLES = [2, 5, 10, 25, 50, 100] as const;

/**
 * Parse human-friendly shorthand into a number.
 *  "50000" -> 50000   "50k" -> 50000   "1.2m" -> 1200000   "$10M" -> 10000000
 *  "0.0000118" -> 0.0000118 (price mode)   "1,250" -> 1250
 * Returns null for blank or unparseable input. Never throws.
 */
export function parseAbbreviatedNumber(
  raw: string | null | undefined,
): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().toLowerCase();
  if (s === "") return null;
  s = s.replace(/[$,\s]/g, "");
  let mult = 1;
  const suffix = s[s.length - 1];
  if (suffix === "k") {
    mult = 1_000;
    s = s.slice(0, -1);
  } else if (suffix === "m") {
    mult = 1_000_000;
    s = s.slice(0, -1);
  } else if (suffix === "b") {
    mult = 1_000_000_000;
    s = s.slice(0, -1);
  }
  if (s === "" || s === "." || s === "-") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n * mult;
}

/** Map a risk/reward ratio to a coarse setup rating. */
export function ratingFromRiskReward(rr: number | null): SetupRating | null {
  if (rr == null || !Number.isFinite(rr) || rr <= 0) return null;
  if (rr >= 3) return "Excellent";
  if (rr >= 2) return "Good";
  if (rr >= 1) return "Weak";
  return "High Risk";
}

/**
 * Compute every planner output from a single input snapshot. Pure: same input
 * always yields the same result, and invalid input produces inline errors plus
 * null outputs rather than throwing.
 */
export function computePlan(input: PlanInput): PlanResult {
  const { entry, stop, target, accountSize, riskPct, preferredSize, sizingMode } =
    input;

  const errors: PlanErrors = {};

  if (entry != null && entry <= 0) {
    errors.entry = "Entry must be greater than 0.";
  }
  if (stop != null) {
    if (stop <= 0) errors.stop = "Stop must be greater than 0.";
    else if (entry != null && entry > 0 && stop >= entry)
      errors.stop = "Stop must be below entry for a long.";
  }
  if (target != null) {
    if (target <= 0) errors.target = "Target must be greater than 0.";
    else if (entry != null && entry > 0 && target <= entry)
      errors.target = "Target must be above entry for a long.";
  }

  if (sizingMode === "risk") {
    if (accountSize != null && accountSize <= 0)
      errors.accountSize = "Account size must be greater than 0.";
    if (riskPct != null && riskPct <= 0)
      errors.riskPct = "Risk % must be greater than 0.";
  } else {
    if (preferredSize != null && preferredSize <= 0)
      errors.preferredSize = "Position size must be greater than 0.";
    if (accountSize != null && accountSize <= 0)
      errors.accountSize = "Account size must be greater than 0.";
  }

  const tradeValid =
    entry != null &&
    entry > 0 &&
    stop != null &&
    stop > 0 &&
    stop < entry &&
    target != null &&
    target > 0 &&
    target > entry;

  const result: PlanResult = {
    errors,
    tradeValid,
    sizingValid: false,
    downsidePct: null,
    upsidePct: null,
    riskReward: null,
    targetMultiple: null,
    requiredGainPct: null,
    maxRisk: null,
    suggestedPosition: null,
    positionSize: null,
    lossAtStop: null,
    riskPctOfAccount: null,
    valueAtTarget: null,
    profitAtTarget: null,
    rating: null,
  };

  if (!tradeValid || entry == null || stop == null || target == null) {
    return result;
  }

  const downsidePct = ((entry - stop) / entry) * 100;
  const upsidePct = ((target - entry) / entry) * 100;
  const riskReward = downsidePct > 0 ? upsidePct / downsidePct : null;
  const targetMultiple = target / entry;

  result.downsidePct = downsidePct;
  result.upsidePct = upsidePct;
  result.riskReward = riskReward;
  result.targetMultiple = targetMultiple;
  result.requiredGainPct = upsidePct;
  result.rating = ratingFromRiskReward(riskReward);

  const downsideFrac = downsidePct / 100;

  // Derive the effective position size from whichever sizing mode is active.
  let positionSize: number | null = null;

  if (sizingMode === "risk") {
    if (
      accountSize != null &&
      accountSize > 0 &&
      riskPct != null &&
      riskPct > 0 &&
      downsideFrac > 0
    ) {
      const maxRisk = accountSize * (riskPct / 100);
      result.maxRisk = maxRisk;
      result.suggestedPosition = maxRisk / downsideFrac;
      positionSize = result.suggestedPosition;
    }
  } else {
    if (preferredSize != null && preferredSize > 0) {
      positionSize = preferredSize;
    }
  }

  if (positionSize != null && positionSize > 0) {
    result.sizingValid = true;
    result.positionSize = positionSize;
    result.lossAtStop = positionSize * downsideFrac;
    result.valueAtTarget = positionSize * targetMultiple;
    result.profitAtTarget = result.valueAtTarget - positionSize;
    if (accountSize != null && accountSize > 0) {
      result.riskPctOfAccount = (result.lossAtStop / accountSize) * 100;
    }
  }

  return result;
}

/**
 * Project position value + profit across fixed multiples, based on entry and the
 * effective position size. Valuation is entry * multiple (market cap or price).
 */
export function projectTargets(
  entry: number | null,
  positionSize: number | null,
  multiples: readonly number[] = QUICK_MULTIPLES,
): TargetProjection[] {
  return multiples.map((multiple) => {
    const valuation = entry != null && entry > 0 ? entry * multiple : null;
    const positionValue =
      positionSize != null && positionSize > 0 ? positionSize * multiple : null;
    const profit =
      positionValue != null && positionSize != null
        ? positionValue - positionSize
        : null;
    return { multiple, valuation, positionValue, profit };
  });
}

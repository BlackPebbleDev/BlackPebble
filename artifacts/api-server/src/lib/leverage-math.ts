/**
 * Pure perps math — no database or network dependencies so every formula the
 * simulated perps engine relies on is unit-testable in isolation.
 *
 * All P&L / liquidation levels are denominated in USD market cap (falling back
 * to SOL price only when MC is unavailable) — see
 * .agents/memory/leverage-mc-denomination.md for why.
 */

export type LeverageDirection = "long" | "short";

export type CloseReason =
  | "manual"
  | "take_profit"
  | "stop_loss"
  | "liquidated"
  | "system_correction";

export type LeverageExitKind = "take_profit" | "stop_loss";

/**
 * Maintenance buffer: liquidates slightly EARLY so account equity can never go
 * negative. liquidation_move = (1 / leverage) − MAINTENANCE_BUFFER, so the
 * position is force-closed before the margin is fully wiped out.
 */
export const MAINTENANCE_BUFFER = 0.005;

/**
 * Liquidation level derived from entry + leverage + maintenance buffer.
 * Longs liquidate below entry; shorts liquidate above entry.
 */
export function computeLiquidation(
  entryPriceSol: number,
  leverage: number,
  direction: LeverageDirection,
): { liqMovePercent: number; liqPriceSol: number } {
  const liqMovePercent = 1 / leverage - MAINTENANCE_BUFFER;
  const liqPriceSol =
    direction === "short"
      ? entryPriceSol * (1 + liqMovePercent)
      : entryPriceSol * (1 - liqMovePercent);
  return { liqMovePercent, liqPriceSol };
}

/**
 * Signed price move as a fraction of entry, oriented so that a positive value
 * is always a PROFIT for the position's direction.
 * Long:  (current − entry) / entry
 * Short: (entry − current) / entry
 */
export function directionalMovePercent(
  direction: LeverageDirection,
  entry: number,
  current: number,
): number {
  if (!(entry > 0)) return 0;
  const raw = (current - entry) / entry;
  return direction === "short" ? -raw : raw;
}

/**
 * Directional move using market cap when both entry and current MC are known,
 * falling back to the SOL price pair. Returns null when neither is usable.
 */
export function movePercentFrom(
  direction: LeverageDirection,
  entryMc: number | null,
  currentMc: number | null,
  entryPriceSol: number,
  currentPriceSol: number | null,
): number | null {
  if (currentMc != null && entryMc != null && entryMc > 0) {
    return directionalMovePercent(direction, entryMc, currentMc);
  }
  if (currentPriceSol != null && entryPriceSol > 0) {
    return directionalMovePercent(direction, entryPriceSol, currentPriceSol);
  }
  return null;
}

/**
 * Realized P&L for a closed slice. Loss is capped at the slice's margin so
 * equity can never go negative (paper-trading simplification, documented in
 * the perps education panel).
 */
export function computeRealizedPnl(
  closedNotionalSol: number,
  movePercent: number,
  closedMarginSol: number,
): { realizedPnlSol: number; creditSol: number } {
  const rawPnl = closedNotionalSol * movePercent;
  const realizedPnlSol = Math.max(rawPnl, -closedMarginSol);
  const creditSol = Math.max(0, closedMarginSol + realizedPnlSol);
  return { realizedPnlSol, creditSol };
}

/**
 * Whether the position has crossed its liquidation level. MC is authoritative;
 * SOL price is the fallback only when MC data is missing on either side.
 */
export function isLiquidated(
  direction: LeverageDirection,
  currentMc: number | null,
  liqMc: number | null,
  currentPriceSol: number,
  liqPriceSol: number,
): boolean {
  if (currentMc != null && liqMc != null) {
    return direction === "short" ? currentMc >= liqMc : currentMc <= liqMc;
  }
  return direction === "short"
    ? currentPriceSol >= liqPriceSol
    : currentPriceSol <= liqPriceSol;
}

/**
 * Whether an exit order's market-cap trigger has been met.
 * Long:  TP fires when MC rises to/through the target; SL fires when MC falls to it.
 * Short: mirrored — TP fires on a fall, SL fires on a rise.
 */
export function exitOrderTriggered(
  direction: LeverageDirection,
  kind: LeverageExitKind,
  currentMc: number,
  triggerMc: number,
): boolean {
  const profitSide = kind === "take_profit";
  if (direction === "short") {
    return profitSide ? currentMc <= triggerMc : currentMc >= triggerMc;
  }
  return profitSide ? currentMc >= triggerMc : currentMc <= triggerMc;
}

/**
 * Validate a trigger market cap for a given exit kind against the position's
 * entry / liquidation market caps. Returns an error string, or null if valid.
 */
export function validateTrigger(
  direction: LeverageDirection,
  kind: LeverageExitKind,
  triggerMc: number,
  entryMc: number | null,
  liqMc: number | null,
): string | null {
  if (direction === "short") {
    if (kind === "take_profit") {
      if (entryMc != null && triggerMc >= entryMc) {
        return "Take Profit must be below the entry market cap for a short.";
      }
    } else {
      if (entryMc != null && triggerMc <= entryMc) {
        return "Stop Loss must be above the entry market cap for a short.";
      }
      if (liqMc != null && triggerMc >= liqMc) {
        return "Stop Loss must be below the liquidation market cap.";
      }
    }
    return null;
  }
  if (kind === "take_profit") {
    if (entryMc != null && triggerMc <= entryMc) {
      return "Take Profit must be above the entry market cap.";
    }
  } else {
    if (entryMc != null && triggerMc >= entryMc) {
      return "Stop Loss must be below the entry market cap.";
    }
    if (liqMc != null && triggerMc <= liqMc) {
      return "Stop Loss must be above the liquidation market cap.";
    }
  }
  return null;
}

export function isLeverageDirection(v: unknown): v is LeverageDirection {
  return v === "long" || v === "short";
}

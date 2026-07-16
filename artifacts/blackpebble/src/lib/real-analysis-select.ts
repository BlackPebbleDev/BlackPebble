import type {
  RealAnalysisSummary,
  RealOpenPosition,
  RealPositionReconciliation,
} from "@/lib/api";

/**
 * Canonical current-holdings selectors.
 *
 * There is exactly ONE source of truth for every current-wallet metric: the
 * reconciliation audit produced against live on-chain balances. These helpers
 * enforce that contract on the client so no surface can fall back to raw,
 * unreconciled swap-history (FIFO) positions - which is how a sold/transferred
 * token (a "ghost" position) leaked into the UI.
 *
 * Do NOT read `analysis.openPositions` directly for rendering. Always go
 * through `canonicalOpenPositions`.
 */

/** Live token amount below this is treated as dust / not a position. */
export const DUST_THRESHOLD = 1e-9;

/**
 * True only when this snapshot has a real, live-balance reconciliation and the
 * caller may render current holdings at all.
 */
export function holdingsAreVerified(analysis: RealAnalysisSummary): boolean {
  return (
    analysis.holdingsVerified === true &&
    Array.isArray(analysis.reconciliation)
  );
}

function reconByMint(
  reconciliation: RealPositionReconciliation[] | undefined,
): Map<string, RealPositionReconciliation> {
  const map = new Map<string, RealPositionReconciliation>();
  for (const r of reconciliation ?? []) map.set(r.mint, r);
  return map;
}

/**
 * The ONLY list of open positions the UI may render.
 *
 * A position renders only when ALL are true:
 *  - holdings are verified against live balances
 *  - a reconciliation entry exists for the mint
 *  - it is not dropped as a ghost
 *  - it is included in the analyzed (priced, traceable) portfolio
 *  - the reconciled live quantity is above the dust threshold
 *
 * The displayed quantity is capped to the reconciled live balance so a stale
 * FIFO amount can never be shown.
 */
export function canonicalOpenPositions(
  analysis: RealAnalysisSummary,
): RealOpenPosition[] {
  if (!holdingsAreVerified(analysis)) return [];
  const recon = reconByMint(analysis.reconciliation);
  const out: RealOpenPosition[] = [];
  for (const p of analysis.openPositions ?? []) {
    const r = recon.get(p.tokenMint);
    if (!r) continue;
    if (r.droppedAsGhost) continue;
    if (!r.includedInOpenPositions) continue;
    if (!r.includedInAnalyzed) continue;
    if (!(r.reconciledQuantity > DUST_THRESHOLD)) continue;
    // Cap the displayed amount to the reconciled live balance.
    const tokenAmount = Math.min(p.tokenAmount, r.reconciledQuantity);
    out.push({ ...p, tokenAmount });
  }
  return out;
}

/** Current open-position count, or null when holdings are unverified. */
export function currentOpenPositionCount(
  analysis: RealAnalysisSummary,
): number | null {
  if (!holdingsAreVerified(analysis)) return null;
  return canonicalOpenPositions(analysis).length;
}

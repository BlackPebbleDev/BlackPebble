import type { Trade } from "@/lib/api";

/**
 * Trade-quality metrics derived from a complete list of executions. Used for
 * guests, whose entire history lives locally (unlike signed-in users, whose
 * server history endpoint is windowed - those metrics come from the API
 * instead). Mirrors the server-side computation in api-server trading.ts so the
 * numbers mean the same thing everywhere.
 */
export interface TradeQualityMetrics {
  avgWinSol: number | null;
  avgLossSol: number | null;
  profitFactor: number | null;
  avgTradeSizeSol: number | null;
  avgHoldSec: number | null;
}

const EPS = 1e-9;

/** Amount-weighted FIFO average holding time (seconds) over closed lots. */
function avgHoldSeconds(trades: Trade[]): number | null {
  const ordered = trades
    .slice()
    .sort((a, b) => a.executed_at - b.executed_at || a.id - b.id);
  const lots = new Map<string, Array<{ amt: number; t: number }>>();
  let weighted = 0;
  let consumed = 0;

  for (const t of ordered) {
    const queue = lots.get(t.token_mint) ?? [];
    if (t.side === "buy") {
      if (t.token_amount > EPS) queue.push({ amt: t.token_amount, t: t.executed_at });
      lots.set(t.token_mint, queue);
      continue;
    }
    let remaining = t.token_amount;
    while (remaining > EPS && queue.length > 0) {
      const lot = queue[0]!;
      const take = Math.min(lot.amt, remaining);
      weighted += (t.executed_at - lot.t) * take;
      consumed += take;
      lot.amt -= take;
      remaining -= take;
      if (lot.amt <= EPS) queue.shift();
    }
  }
  return consumed > EPS ? weighted / consumed : null;
}

export function computeTradeQualityMetrics(
  trades: Trade[],
): TradeQualityMetrics {
  const sells = trades.filter((t) => t.side === "sell" && t.pnl != null);
  const wins = sells.filter((t) => (t.pnl as number) > 0).map((t) => t.pnl as number);
  const losses = sells
    .filter((t) => (t.pnl as number) < 0)
    .map((t) => t.pnl as number);
  const buys = trades.filter((t) => t.side === "buy");

  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const grossLoss = Math.abs(sum(losses));

  return {
    avgWinSol: wins.length ? sum(wins) / wins.length : null,
    avgLossSol: losses.length ? sum(losses) / losses.length : null,
    profitFactor: grossLoss > 0 ? sum(wins) / grossLoss : null,
    avgTradeSizeSol: buys.length
      ? sum(buys.map((t) => t.sol_amount)) / buys.length
      : null,
    avgHoldSec: avgHoldSeconds(trades),
  };
}

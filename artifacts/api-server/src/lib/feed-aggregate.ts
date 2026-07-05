/**
 * Trade aggregation for the feed — pure, deterministic, unit-tested.
 *
 * Raw spot trades stay raw in the database; the feed groups them at read
 * time so a burst of buys becomes one "accumulated" card instead of five
 * spam cards. Read-time aggregation is retroactive (historical activity
 * gets clean cards for free) and has no write-time state to corrupt.
 *
 * Grouping rule: trades by the same user, in the same token, on the same
 * side chain into a group when each trade is within AGG_GAP_SECONDS of the
 * previous one. Groups of one render as plain trade cards; groups of two or
 * more become aggregated cards with an expandable per-trade breakdown.
 */

export const AGG_GAP_SECONDS = 30 * 60;

export interface RawSpotTrade {
  id: string;
  userId: number;
  mint: string;
  side: "buy" | "sell";
  /** Unix seconds. */
  ts: number;
  solAmount: number;
  /** Realized PnL in SOL (sells only). */
  pnlSol: number | null;
  /** Market cap (USD) at execution; null for pre-upgrade rows. */
  marketCapUsd: number | null;
}

export interface TradeBreakdownRow {
  id: string;
  ts: number;
  solAmount: number;
  marketCapUsd: number | null;
  pnlSol: number | null;
}

export interface AggregatedTradeGroup {
  /** Stable id: `agg-{side}-{firstTradeId}` — reactions attach here. */
  id: string;
  userId: number;
  mint: string;
  side: "buy" | "sell";
  tradeCount: number;
  windowStart: number;
  windowEnd: number;
  totalSol: number;
  /** SOL-weighted average market cap across trades that have one. */
  avgMarketCapUsd: number | null;
  /** Sum of realized PnL (sells only). */
  totalPnlSol: number | null;
  breakdown: TradeBreakdownRow[];
}

export type FeedTradeItem =
  | { type: "single"; trade: RawSpotTrade }
  | { type: "group"; group: AggregatedTradeGroup };

/**
 * Aggregate a list of raw spot trades (any order) into feed items. Output is
 * ordered newest-first by each item's most recent trade.
 */
export function aggregateSpotTrades(trades: RawSpotTrade[]): FeedTradeItem[] {
  // Bucket by (user, mint, side), oldest-first inside each bucket.
  const buckets = new Map<string, RawSpotTrade[]>();
  for (const t of trades) {
    const key = `${t.userId}|${t.mint}|${t.side}`;
    const arr = buckets.get(key);
    if (arr) arr.push(t);
    else buckets.set(key, [t]);
  }

  const items: FeedTradeItem[] = [];
  for (const arr of buckets.values()) {
    arr.sort((a, b) => a.ts - b.ts);
    let group: RawSpotTrade[] = [];
    const flush = () => {
      if (group.length === 0) return;
      if (group.length === 1) {
        items.push({ type: "single", trade: group[0] });
      } else {
        items.push({ type: "group", group: buildGroup(group) });
      }
      group = [];
    };
    for (const t of arr) {
      if (
        group.length > 0 &&
        t.ts - group[group.length - 1].ts > AGG_GAP_SECONDS
      ) {
        flush();
      }
      group.push(t);
    }
    flush();
  }

  items.sort((a, b) => itemTs(b) - itemTs(a));
  return items;
}

function itemTs(item: FeedTradeItem): number {
  return item.type === "single" ? item.trade.ts : item.group.windowEnd;
}

function buildGroup(trades: RawSpotTrade[]): AggregatedTradeGroup {
  const first = trades[0];
  const last = trades[trades.length - 1];
  let totalSol = 0;
  let mcWeighted = 0;
  let mcWeight = 0;
  let pnlSum = 0;
  let hasPnl = false;
  const breakdown: TradeBreakdownRow[] = [];
  for (const t of trades) {
    totalSol += t.solAmount;
    if (t.marketCapUsd != null && t.marketCapUsd > 0 && t.solAmount > 0) {
      mcWeighted += t.marketCapUsd * t.solAmount;
      mcWeight += t.solAmount;
    }
    if (t.pnlSol != null && Number.isFinite(t.pnlSol)) {
      pnlSum += t.pnlSol;
      hasPnl = true;
    }
    breakdown.push({
      id: t.id,
      ts: t.ts,
      solAmount: t.solAmount,
      marketCapUsd: t.marketCapUsd,
      pnlSol: t.pnlSol,
    });
  }
  return {
    id: `agg-${first.side}-${first.id}`,
    userId: first.userId,
    mint: first.mint,
    side: first.side,
    tradeCount: trades.length,
    windowStart: first.ts,
    windowEnd: last.ts,
    totalSol,
    avgMarketCapUsd: mcWeight > 0 ? mcWeighted / mcWeight : null,
    totalPnlSol: hasPnl ? pnlSum : null,
    breakdown,
  };
}

/** Human window duration, e.g. "18 minutes" / "2 hours". */
export function windowLabel(startSec: number, endSec: number): string {
  const s = Math.max(0, endSec - startSec);
  if (s < 60) return "under a minute";
  const m = Math.round(s / 60);
  if (m < 90) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(s / 3600);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

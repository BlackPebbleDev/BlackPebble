/**
 * Timeline events - intelligence milestones, not raw activity.
 *
 * The feed and profile read these instead of raw trades: "Consistency
 * improved", "Trading DNA evolved", "1000 trades analyzed". Payloads never
 * carry wallet amounts, mints, or tx details - progression only.
 */

import { dbAll, dbGet, dbRun } from "./database.js";
import type { SignalWithDelta } from "./real-trading-signals.js";
import type { TraderDna } from "./real-trading-dna.js";

export type TimelineEventType =
  | "verified_wallet_connected"
  | "signal_improved"
  | "wallet_health_improved"
  | "dna_evolved"
  | "milestone_trades"
  | "best_trade_record";

export interface TimelineEvent {
  id: number;
  eventType: TimelineEventType;
  title: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  createdAt: number;
}

const SIGNAL_LABELS: Record<string, string> = {
  consistency: "Consistency",
  risk: "Risk profile",
  discipline: "Discipline",
  timing: "Timing",
  patience: "Patience",
  recovery: "Recovery",
  profitability: "Profitability",
  conviction: "Conviction",
  position_sizing: "Position sizing",
  diversification: "Diversification",
  drawdown_management: "Drawdown management",
  activity: "Activity",
};

/** Improvement threshold (points) before a signal change becomes an event. */
const SIGNAL_EVENT_THRESHOLD = 8;
/** Per-event-type dedup window (seconds). */
const DEDUP_WINDOW_SEC = 7 * 86400;

const TRADE_MILESTONES = [100, 250, 500, 1000, 2500, 5000];

async function recentEventExists(
  wallet: string,
  eventType: string,
  metaMatch: string | null,
  now: number,
): Promise<boolean> {
  const row = await dbGet<{ id: number }>(
    metaMatch
      ? `SELECT id FROM real_timeline_events
          WHERE wallet = $1 AND event_type = $2 AND created_at > $3
            AND meta_json LIKE $4 LIMIT 1`
      : `SELECT id FROM real_timeline_events
          WHERE wallet = $1 AND event_type = $2 AND created_at > $3 LIMIT 1`,
    metaMatch
      ? [wallet, eventType, now - DEDUP_WINDOW_SEC, `%${metaMatch}%`]
      : [wallet, eventType, now - DEDUP_WINDOW_SEC],
  );
  return !!row;
}

async function emit(
  wallet: string,
  userId: number | null,
  eventType: TimelineEventType,
  title: string,
  body: string | null,
  meta: Record<string, unknown> | null,
  now: number,
): Promise<void> {
  await dbRun(
    `INSERT INTO real_timeline_events (wallet, user_id, event_type, title, body, meta_json, visibility, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'public', $7)`,
    [wallet, userId, eventType, title, body, meta ? JSON.stringify(meta) : null, now],
  );
}

export interface TimelineEmitContext {
  wallet: string;
  userId: number | null;
  isFirstAnalysis: boolean;
  tradeCount: number;
  previousTradeCount: number;
  signals: SignalWithDelta[];
  dna: TraderDna;
  walletHealthScore: number;
  previousWalletHealthScore: number | null;
  largestGainSol: number;
  previousLargestGainSol: number | null;
}

/**
 * Evaluate this analysis run against history and emit any milestone events.
 * Every emission is deduped inside a 7-day window per (type, subject).
 */
export async function emitTimelineEvents(ctx: TimelineEmitContext): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const { wallet, userId } = ctx;

  if (ctx.isFirstAnalysis) {
    await emit(
      wallet,
      userId,
      "verified_wallet_connected",
      "Verified wallet connected",
      "Real trading analysis is now active for this trader.",
      null,
      now,
    );
  }

  // Signal improvements (meaningful positive deltas only; risk is direction-neutral so skip it).
  for (const s of ctx.signals) {
    if (s.key === "risk" || s.key === "activity") continue;
    if (s.delta30d == null || s.delta30d < SIGNAL_EVENT_THRESHOLD) continue;
    if (s.confidence < 0.4) continue;
    if (await recentEventExists(wallet, "signal_improved", `"signal":"${s.key}"`, now)) continue;
    const label = SIGNAL_LABELS[s.key] ?? s.key;
    await emit(
      wallet,
      userId,
      "signal_improved",
      `${label} improved`,
      `Up ${s.delta30d} points over the last month.`,
      { signal: s.key, delta: s.delta30d, value: s.value },
      now,
    );
  }

  // Wallet health.
  if (
    ctx.previousWalletHealthScore != null &&
    ctx.walletHealthScore - ctx.previousWalletHealthScore >= 10 &&
    !(await recentEventExists(wallet, "wallet_health_improved", null, now))
  ) {
    await emit(
      wallet,
      userId,
      "wallet_health_improved",
      "Portfolio quality improved",
      `Portfolio quality climbed from ${ctx.previousWalletHealthScore} to ${ctx.walletHealthScore}.`,
      { from: ctx.previousWalletHealthScore, to: ctx.walletHealthScore },
      now,
    );
  }

  // DNA evolution (archetype change only - trait drift alone is too noisy for the feed).
  if (
    ctx.dna.archetypeChanged &&
    ctx.dna.confidence >= 0.5 &&
    !(await recentEventExists(wallet, "dna_evolved", null, now))
  ) {
    await emit(
      wallet,
      userId,
      "dna_evolved",
      "Trading DNA evolved",
      `Now trading as ${ctx.dna.primaryLabel}.`,
      { archetype: ctx.dna.primaryArchetype, label: ctx.dna.primaryLabel },
      now,
    );
  }

  // Trade-count milestones (fires when a threshold is crossed this run).
  for (const m of TRADE_MILESTONES) {
    if (ctx.previousTradeCount < m && ctx.tradeCount >= m) {
      if (await recentEventExists(wallet, "milestone_trades", `"milestone":${m}`, now)) continue;
      await emit(
        wallet,
        userId,
        "milestone_trades",
        `${m} trades analyzed`,
        `This trader's on-chain history now spans ${m}+ analyzed swaps.`,
        { milestone: m },
        now,
      );
    }
  }

  // New best trade (record realized gain). No amounts below 0.5 SOL to avoid noise.
  if (
    ctx.previousLargestGainSol != null &&
    ctx.largestGainSol > ctx.previousLargestGainSol &&
    ctx.largestGainSol >= 0.5 &&
    !(await recentEventExists(wallet, "best_trade_record", null, now))
  ) {
    await emit(
      wallet,
      userId,
      "best_trade_record",
      "New best trade",
      "A new personal record for a single realized gain.",
      null,
      now,
    );
  }
}

/** Recent timeline for a wallet (profile / analysis page). */
export async function getTimeline(
  wallet: string,
  limit = 20,
): Promise<TimelineEvent[]> {
  const rows = await dbAll<{
    id: number;
    event_type: string;
    title: string;
    body: string | null;
    meta_json: string | null;
    created_at: number;
  }>(
    `SELECT id, event_type, title, body, meta_json, created_at
       FROM real_timeline_events
      WHERE wallet = $1 AND visibility = 'public'
      ORDER BY created_at DESC
      LIMIT $2`,
    [wallet, Math.min(Math.max(1, limit), 100)],
  );

  return rows.map((r) => {
    let meta: Record<string, unknown> | null = null;
    if (r.meta_json) {
      try {
        meta = JSON.parse(r.meta_json) as Record<string, unknown>;
      } catch {
        meta = null;
      }
    }
    return {
      id: r.id,
      eventType: r.event_type as TimelineEventType,
      title: r.title,
      body: r.body,
      meta,
      createdAt: r.created_at,
    };
  });
}

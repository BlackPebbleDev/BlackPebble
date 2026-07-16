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

const TRADE_MILESTONES = [100, 250, 500, 1000, 2500, 5000];

/** Bucket a score to its tens digit so re-firing at the same level is deduped. */
function scoreBucket(value: number): number {
  return Math.floor(value / 10);
}

/**
 * Canonical milestone identity. Two runs that describe the SAME milestone
 * produce the SAME key, so the unique index collapses them to one row - even
 * under concurrent refreshes. A genuinely new threshold (a higher score bucket,
 * a new archetype, a new trade milestone) produces a DIFFERENT key and is
 * allowed through exactly once. Identity intentionally excludes the raw
 * computation timestamp so repeated refreshes are idempotent.
 */
export function milestoneDedupKey(
  eventType: TimelineEventType,
  parts: Record<string, string | number>,
): string {
  const suffix = Object.keys(parts)
    .sort()
    .map((k) => `${k}=${parts[k]}`)
    .join(":");
  return suffix ? `${eventType}:${suffix}` : eventType;
}

async function keyedEventExists(
  wallet: string,
  dedupKey: string,
): Promise<boolean> {
  const row = await dbGet<{ id: number }>(
    `SELECT id FROM real_timeline_events WHERE wallet = $1 AND dedup_key = $2 LIMIT 1`,
    [wallet, dedupKey],
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
  dedupKey: string,
): Promise<void> {
  // ON CONFLICT DO NOTHING is the real guarantee: even if two refreshes race
  // past the pre-check, the partial unique index keeps exactly one row.
  await dbRun(
    `INSERT INTO real_timeline_events
       (wallet, user_id, event_type, title, body, meta_json, visibility, created_at, dedup_key)
     VALUES ($1, $2, $3, $4, $5, $6, 'public', $7, $8)
     ON CONFLICT (wallet, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING`,
    [
      wallet,
      userId,
      eventType,
      title,
      body,
      meta ? JSON.stringify(meta) : null,
      now,
      dedupKey,
    ],
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
    const key = milestoneDedupKey("verified_wallet_connected", {});
    if (!(await keyedEventExists(wallet, key))) {
      await emit(
        wallet,
        userId,
        "verified_wallet_connected",
        "Verified wallet connected",
        "Real trading analysis is now active for this trader.",
        null,
        now,
        key,
      );
    }
  }

  // Signal improvements. Only fire when the change is TRUSTWORTHY: delta30d is
  // null unless the comparison is "comparable" (valid prior baseline with
  // enough samples), so synthetic-zero baselines can never mint a milestone.
  // Risk/Activity are descriptive (no good/bad direction) so they never fire.
  for (const s of ctx.signals) {
    if (s.direction === "descriptive") continue;
    if (s.delta30d == null || s.delta30d < SIGNAL_EVENT_THRESHOLD) continue;
    if (s.confidence < 0.4) continue;
    const key = milestoneDedupKey("signal_improved", {
      signal: s.key,
      from: s.comparison?.comparisonStart ?? 0,
      bucket: scoreBucket(s.value),
    });
    if (await keyedEventExists(wallet, key)) continue;
    const label = SIGNAL_LABELS[s.key] ?? s.key;
    await emit(
      wallet,
      userId,
      "signal_improved",
      `${label} improved`,
      `Up ${s.delta30d} points over the last month.`,
      { signal: s.key, delta: s.delta30d, value: s.value },
      now,
      key,
    );
  }

  // Wallet health.
  if (
    ctx.previousWalletHealthScore != null &&
    ctx.walletHealthScore - ctx.previousWalletHealthScore >= 10
  ) {
    const key = milestoneDedupKey("wallet_health_improved", {
      bucket: scoreBucket(ctx.walletHealthScore),
    });
    if (!(await keyedEventExists(wallet, key))) {
      await emit(
        wallet,
        userId,
        "wallet_health_improved",
        "Portfolio quality improved",
        `Portfolio quality climbed from ${ctx.previousWalletHealthScore} to ${ctx.walletHealthScore}.`,
        { from: ctx.previousWalletHealthScore, to: ctx.walletHealthScore },
        now,
        key,
      );
    }
  }

  // DNA evolution (archetype change only - trait drift alone is too noisy).
  if (ctx.dna.archetypeChanged && ctx.dna.confidence >= 0.5) {
    const key = milestoneDedupKey("dna_evolved", {
      archetype: ctx.dna.primaryArchetype,
    });
    if (!(await keyedEventExists(wallet, key))) {
      await emit(
        wallet,
        userId,
        "dna_evolved",
        "Trading DNA evolved",
        `Now trading as ${ctx.dna.primaryLabel}.`,
        { archetype: ctx.dna.primaryArchetype, label: ctx.dna.primaryLabel },
        now,
        key,
      );
    }
  }

  // Trade-count milestones (fires when a threshold is crossed this run).
  for (const m of TRADE_MILESTONES) {
    if (ctx.previousTradeCount < m && ctx.tradeCount >= m) {
      const key = milestoneDedupKey("milestone_trades", { milestone: m });
      if (await keyedEventExists(wallet, key)) continue;
      await emit(
        wallet,
        userId,
        "milestone_trades",
        `${m} trades analyzed`,
        `This trader's on-chain history now spans ${m}+ analyzed swaps.`,
        { milestone: m },
        now,
        key,
      );
    }
  }

  // New best trade (record realized gain). No amounts below 0.5 SOL to avoid noise.
  if (
    ctx.previousLargestGainSol != null &&
    ctx.largestGainSol > ctx.previousLargestGainSol &&
    ctx.largestGainSol >= 0.5
  ) {
    const key = milestoneDedupKey("best_trade_record", {
      bucket: Math.floor(ctx.largestGainSol),
    });
    if (!(await keyedEventExists(wallet, key))) {
      await emit(
        wallet,
        userId,
        "best_trade_record",
        "New best trade",
        "A new personal record for a single realized gain.",
        null,
        now,
        key,
      );
    }
  }
}

/** Recent timeline for a wallet (profile / analysis page). */
export async function getTimeline(
  wallet: string,
  limit = 20,
): Promise<TimelineEvent[]> {
  // Over-fetch so read-time dedup of legacy duplicate rows still leaves a full
  // page. New rows are guaranteed unique by the DB index; this only collapses
  // pre-existing duplicates that predate the dedup_key column.
  const cap = Math.min(Math.max(1, limit), 100);
  const rows = await dbAll<{
    id: number;
    event_type: string;
    title: string;
    body: string | null;
    meta_json: string | null;
    created_at: number;
    dedup_key: string | null;
  }>(
    `SELECT id, event_type, title, body, meta_json, created_at, dedup_key
       FROM real_timeline_events
      WHERE wallet = $1 AND visibility = 'public'
      ORDER BY created_at ASC
      LIMIT $2`,
    [wallet, cap * 4],
  );

  // Collapse duplicates by canonical identity, keeping the EARLIEST occurrence
  // so a re-emitted card no longer resets its relative timestamp to "1m ago".
  const seen = new Set<string>();
  const deduped: TimelineEvent[] = [];
  for (const r of rows) {
    let meta: Record<string, unknown> | null = null;
    if (r.meta_json) {
      try {
        meta = JSON.parse(r.meta_json) as Record<string, unknown>;
      } catch {
        meta = null;
      }
    }
    const identity =
      r.dedup_key ??
      `${r.event_type}|${r.title}|${r.body ?? ""}|${r.meta_json ?? ""}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    deduped.push({
      id: r.id,
      eventType: r.event_type as TimelineEventType,
      title: r.title,
      body: r.body,
      meta,
      createdAt: r.created_at,
    });
  }

  return deduped.sort((a, b) => b.createdAt - a.createdAt).slice(0, cap);
}

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, FEED_REACTIONS, type FeedActivityItem } from "@/lib/api";
import { useXAuth } from "@/hooks/use-x-auth";
import { upsertNotification } from "@/lib/notifications-store";
import { activityToast } from "@/lib/activity-toast";
import type { ToastChip } from "@/hooks/use-toast";
import { timeAgo } from "@/lib/format";

/**
 * ME-scoped reaction rollups (Phase 3C).
 *
 * Aggregates OTHER people's reactions on the signed-in user's OWN content into
 * one premium rollup per content item, e.g.
 *
 *   "23 traders reacted to your MANIFEST call"   🚀 12 · 💎 6 · 🎯 5
 *
 * Data is real, not guessed: it reads the authoritative per-item reaction
 * counts already returned by /feed/mine. Because feed_reactions is UNIQUE per
 * (event, user), the total count equals the number of unique reactors, so the
 * "N traders" headline is exact. The owner's own reaction is subtracted so the
 * headline reflects OTHER traders only.
 *
 * Safety / anti-spam:
 *  - Never toasts per reaction. The notification-center item updates in place
 *    (deduped by `reaction-rollup-<eventId>`); a toast fires only when a rollup
 *    becomes meaningful (>= TOAST_THRESHOLD reactors), then respects a per-
 *    content cooldown and a hard per-content toast cap (viral protection).
 *  - First load for a user is a silent baseline; historical reactions are never
 *    replayed as toasts. Reactions that arrived while away surface quietly in
 *    the center (no toast).
 *  - Reaction switches / removals refresh chips silently and never toast.
 *  - Scope is strictly owner/ME: /feed/mine is the viewer's own content only.
 *  - localStorage only (per-user). No backend, no schema, no new endpoint.
 */

const STATE_KEY = (uid: string) => `blackpebble.reactionRollups.v1.${uid}`;

/** Create/refresh a center rollup once at least this many external reactors. */
const CENTER_MIN = 1;
/** First premium toast once a rollup reaches this many reactors. */
const TOAST_THRESHOLD = 3;
/** Minimum gap between toasts for the SAME content. */
const TOAST_COOLDOWN_MS = 60 * 60 * 1000;
/** Hard cap on toasts per content, so a viral post can't keep toasting. */
const TOAST_MAX_PER_CONTENT = 2;
/** Re-mark a read rollup unread only after this many more reactors. */
const RESURFACE_STEP = 3;

const EMOJI: Record<string, string> = Object.fromEntries(
  FEED_REACTIONS.map((r) => [r.key, r.emoji]),
);

interface PerContent {
  /** Last observed external reactor total. */
  total: number;
  lastToastAt: number;
  toastCount: number;
  /** Total at the last toast (only toast on further growth). */
  lastToastedTotal: number;
  /** Total when the item was last surfaced unread. */
  lastSurfacedTotal: number;
}

interface RollupState {
  seeded: boolean;
  items: Record<string, PerContent>;
}

function loadState(uid: string): RollupState {
  try {
    const raw = localStorage.getItem(STATE_KEY(uid));
    if (!raw) return { seeded: false, items: {} };
    const parsed = JSON.parse(raw) as RollupState;
    return {
      seeded: !!parsed?.seeded,
      items: parsed?.items && typeof parsed.items === "object" ? parsed.items : {},
    };
  } catch {
    return { seeded: false, items: {} };
  }
}

function saveState(uid: string, s: RollupState) {
  try {
    localStorage.setItem(STATE_KEY(uid), JSON.stringify(s));
  } catch {
    // Non-fatal: rollup dedupe degrades to in-memory for this session.
  }
}

/** Counts with the owner's own reaction removed (headline = OTHER traders). */
function externalCounts(it: FeedActivityItem): {
  counts: Record<string, number>;
  total: number;
} {
  const counts: Record<string, number> = { ...(it.reactions ?? {}) };
  if (it.viewerReaction && counts[it.viewerReaction]) {
    counts[it.viewerReaction] -= 1;
    if (counts[it.viewerReaction] <= 0) delete counts[it.viewerReaction];
  }
  let total = 0;
  for (const k in counts) total += counts[k];
  return { counts, total };
}

function objectWord(it: FeedActivityItem): string {
  switch (it.kind) {
    case "callout":
      return "call";
    case "thesis":
      return "thesis";
    case "achievement":
      return "achievement";
    case "campaign":
      return "campaign";
    case "recovery":
      return "wallet cleanup";
    case "spot":
    case "agg":
    case "leverage":
      return "trade";
    default:
      return "post";
  }
}

const TOKEN_SCOPED = new Set(["callout", "thesis", "spot", "agg", "leverage"]);

function subjectFor(it: FeedActivityItem): string {
  const word = objectWord(it);
  const sym = it.token?.symbol;
  return sym && TOKEN_SCOPED.has(it.kind) ? `your ${sym} ${word}` : `your ${word}`;
}

function titleFor(it: FeedActivityItem, total: number): string {
  return `${total} trader${total === 1 ? "" : "s"} reacted to ${subjectFor(it)}`;
}

function chipsFor(counts: Record<string, number>): ToastChip[] {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const chips: ToastChip[] = sorted
    .slice(0, 3)
    .map(([k, n]) => ({ label: `${EMOJI[k] ?? "•"} ${n}`, tone: "neutral" as const }));
  if (sorted.length > 3) chips.push({ label: `+${sorted.length - 3}`, tone: "neutral" });
  return chips;
}

function centerInput(
  it: FeedActivityItem,
  total: number,
  counts: Record<string, number>,
) {
  return {
    kind: "reaction_rollup" as const,
    title: titleFor(it, total),
    description: `on your ${objectWord(it)} from ${timeAgo(it.timestamp)}`,
    chips: chipsFor(counts),
    tokenSymbol: it.token?.symbol ?? null,
    tokenLogo: it.token?.logo ?? null,
    href: "/feed",
    sourceActivityId: `reaction-rollup-${it.id}`,
  };
}

/**
 * Mounted once at the app shell. Turns reactions on the viewer's own content
 * into aggregated, deduped, rate-limited notifications (and occasional toasts).
 */
export function useReactionRollups() {
  const { loggedIn, user } = useXAuth();
  const uid = user?.id ?? null;
  const stateRef = useRef<RollupState>({ seeded: false, items: {} });

  const { data } = useQuery({
    // Same key/fn as useActivityToasts → React Query shares one poll (no extra
    // network request).
    queryKey: ["feed-mine-toasts", uid],
    queryFn: () => api.feed.mine({ limit: 40 }),
    enabled: loggedIn && !!uid,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  // Reload persisted rollup state when the signed-in user changes.
  useEffect(() => {
    stateRef.current = uid ? loadState(uid) : { seeded: false, items: {} };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const items = data?.items;
    if (!items) return;

    const state = stateRef.current;
    const firstEver = !state.seeded;

    for (const it of items) {
      const { counts, total } = externalCounts(it);
      if (total < CENTER_MIN) continue;
      const prev = state.items[it.id];

      // Silent baseline on the very first load for this user.
      if (firstEver) {
        state.items[it.id] = {
          total,
          lastToastAt: 0,
          toastCount: 0,
          lastToastedTotal: 0,
          lastSurfacedTotal: total,
        };
        continue;
      }

      // New-to-us content with reactions (arrived while away): surface quietly
      // in the center, never toast a backlog burst.
      if (!prev) {
        upsertNotification(centerInput(it, total, counts), { resurfaceUnread: false });
        state.items[it.id] = {
          total,
          lastToastAt: 0,
          toastCount: 0,
          lastToastedTotal: 0,
          lastSurfacedTotal: total,
        };
        continue;
      }

      // Reaction switch or unchanged total → refresh chips silently.
      if (total === prev.total) {
        upsertNotification(centerInput(it, total, counts), { resurfaceUnread: false });
        continue;
      }

      const grew = total > prev.total;
      const resurface = grew && total - prev.lastSurfacedTotal >= RESURFACE_STEP;
      upsertNotification(centerInput(it, total, counts), { resurfaceUnread: resurface });

      const next: PerContent = { ...prev, total };
      if (resurface) next.lastSurfacedTotal = total;

      const canToast =
        grew &&
        total >= TOAST_THRESHOLD &&
        total > prev.lastToastedTotal &&
        prev.toastCount < TOAST_MAX_PER_CONTENT &&
        Date.now() - prev.lastToastAt > TOAST_COOLDOWN_MS;
      if (canToast) {
        activityToast({
          kind: "reaction_rollup",
          title: titleFor(it, total),
          description: `on your ${objectWord(it)} from ${timeAgo(it.timestamp)}`,
          chips: chipsFor(counts),
          tokenLogo: it.token?.logo ?? null,
          notify: false, // the center item is already handled by upsert above
        });
        next.lastToastAt = Date.now();
        next.toastCount = prev.toastCount + 1;
        next.lastToastedTotal = total;
      }

      state.items[it.id] = next;
    }

    if (firstEver) state.seeded = true;
    saveState(uid, state);
  }, [data, uid]);
}

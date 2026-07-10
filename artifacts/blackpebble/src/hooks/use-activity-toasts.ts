import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type FeedActivityItem } from "@/lib/api";
import { useXAuth } from "@/hooks/use-x-auth";
import { activityToast, type ActivityToastKind } from "@/lib/activity-toast";
import type { ToastChip } from "@/hooks/use-toast";
import { fmtSol, fmtMarketCap } from "@/lib/format";

/**
 * ME-scoped activity toasts (Phase 3A).
 *
 * Watches the signed-in user's own timeline (/feed/mine — X-auth only, so
 * guests are skipped and there are no 401s) and pops a premium toast ONLY for
 * high-signal personal events:
 *   - perps auto-closes: stop-loss, take-profit, liquidation
 *   - tier upgrade, achievement unlocked
 * Everything else in the timeline (buys/sells/calls/follows/reactions/etc.) is
 * ignored — no per-trade spam, no global/follower toasts.
 *
 * Perps closes fire from a server cron even when the owner is on another page or
 * offline, so /feed/mine (polled globally here) is the ONLY reliable surface for
 * them — a page-scoped watcher would miss cron-triggered fills entirely.
 *
 * Safety:
 *  - The first successful load is a silent BASELINE (records current ids, never
 *    toasts history).
 *  - Seen ids persist in per-user localStorage so a refresh never re-toasts.
 *  - Fed by the existing /feed/mine endpoint — no new backend, no schema.
 *
 * Spot TP/SL/buy-limit fills are handled separately (real-time) by
 * useOrderFillToasts(); manual perp closes toast at the moment of action. None
 * of those overlap with the events surfaced here.
 */

const SEEN_KEY = (uid: string) => `blackpebble.activityToasts.seen.v1.${uid}`;
const SEEN_CAP = 300;

/**
 * Decide whether a /feed/mine item should pop a ME-scoped toast, and which kind.
 * Perps auto-closes are detected by kind/action/closeReason (manual + system
 * closes are intentionally skipped — those aren't automated exit events). Tier
 * and achievement milestones use the normalized Activity Layer type.
 */
function toastKindFor(it: FeedActivityItem): ActivityToastKind | undefined {
  if (it.kind === "leverage") {
    if (it.action === "liquidated") return "liquidation";
    if (it.action === "close") {
      const reason = (it.meta as Record<string, unknown> | null)?.closeReason;
      if (reason === "stop_loss") return "sl_hit";
      if (reason === "take_profit") return "tp_hit";
    }
    return undefined;
  }
  if (it.type === "progression.tier_upgraded") return "tier_upgrade";
  if (it.type === "progression.achievement_unlocked") return "achievement";
  return undefined;
}

function loadSeen(uid: string): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY(uid));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeen(uid: string, set: Set<string>) {
  try {
    // Keep only the most recent ids to bound storage.
    const arr = [...set].slice(-SEEN_CAP);
    localStorage.setItem(SEEN_KEY(uid), JSON.stringify(arr));
  } catch {
    // Non-fatal: dedupe degrades to in-memory only.
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function emitToast(kind: ActivityToastKind, it: FeedActivityItem) {
  const avatar = it.user.x_avatar_url ?? null;
  if (kind === "tier_upgrade") {
    activityToast({
      kind,
      title: it.thesisTitle ?? "New tier reached",
      pfp: avatar,
      sourceActivityId: it.id,
    });
    return;
  }
  if (kind === "achievement") {
    activityToast({
      kind,
      title: "Achievement unlocked",
      description: it.badgeName ?? it.thesisTitle ?? undefined,
      pfp: avatar,
      sourceActivityId: it.id,
    });
    return;
  }
  // Perps auto-close: sl_hit | tp_hit | liquidation.
  const sym = it.token.symbol ?? "position";
  const meta = (it.meta ?? {}) as Record<string, unknown>;
  const mc = num(meta.marketCapUsd) ?? num(meta.triggerMc);
  const dir =
    it.direction === "short" ? "Short" : it.direction === "long" ? "Long" : null;
  const chips: ToastChip[] = [];
  if (it.pnlSol != null)
    chips.push({
      label: `${it.pnlSol >= 0 ? "+" : ""}${fmtSol(it.pnlSol)} SOL`,
      tone: it.pnlSol >= 0 ? "up" : "down",
    });
  if (mc != null)
    chips.push({
      label: kind === "liquidation" ? `Liq ${fmtMarketCap(mc)}` : `${fmtMarketCap(mc)} MC`,
      tone: "neutral",
    });
  const title =
    kind === "liquidation"
      ? "Position liquidated"
      : kind === "sl_hit"
        ? "Stop loss triggered"
        : "Take profit hit";
  activityToast({
    kind,
    title,
    description: dir ? `${sym} · ${dir}` : sym,
    chips: chips.length > 0 ? chips : undefined,
    tokenLogo: it.token.logo ?? null,
    sourceActivityId: it.id,
  });
}

/**
 * Mounted once at the app shell. Drives ME-scoped milestone/liquidation toasts
 * from the viewer's own timeline.
 */
export function useActivityToasts() {
  const { loggedIn, user } = useXAuth();
  const uid = user?.id ?? null;
  const seededRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ["feed-mine-toasts", uid],
    queryFn: () => api.feed.mine({ limit: 40 }),
    enabled: loggedIn && !!uid,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  // Re-baseline whenever the signed-in user changes.
  useEffect(() => {
    seededRef.current = false;
    seenRef.current = uid ? loadSeen(uid) : new Set();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const items = data?.items;
    if (!items) return;

    // First load for this user = silent baseline (never toast backlog).
    if (!seededRef.current) {
      for (const it of items) seenRef.current.add(it.id);
      saveSeen(uid, seenRef.current);
      seededRef.current = true;
      return;
    }

    const fresh: FeedActivityItem[] = [];
    for (const it of items) {
      if (seenRef.current.has(it.id)) continue;
      seenRef.current.add(it.id); // mark seen regardless of toastability
      if (toastKindFor(it)) fresh.push(it);
    }
    if (fresh.length > 0) {
      // Oldest-first so the newest ends up on top of the stack.
      fresh.sort((a, b) => a.timestamp - b.timestamp);
      for (const it of fresh) {
        const kind = toastKindFor(it);
        if (kind) emitToast(kind, it);
      }
    }
    saveSeen(uid, seenRef.current);
  }, [data, uid]);
}

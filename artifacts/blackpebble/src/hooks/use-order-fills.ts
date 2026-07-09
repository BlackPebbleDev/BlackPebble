import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type OrderFill, type Position } from "@/lib/api";
import { useAccount } from "@/hooks/use-account";
import { activityToast } from "@/lib/activity-toast";
import type { ToastChip } from "@/hooks/use-toast";
import {
  useGuestStore,
  useGuestValuedPositions,
  evaluateGuestOrders,
} from "@/lib/guest-store";
import { fmtMarketCap, fmtSol } from "@/lib/format";

/** Build metric chips from the real fields an OrderFill actually carries. */
function fillChips(f: OrderFill): ToastChip[] {
  const chips: ToastChip[] = [];
  if (f.orderType === "buy_limit") {
    if (f.solAmount != null)
      chips.push({ label: `${fmtSol(f.solAmount)} SOL`, tone: "neutral" });
    if (f.fillMarketCap != null)
      chips.push({ label: `Entry ${fmtMarketCap(f.fillMarketCap)}`, tone: "neutral" });
  } else {
    if (f.pnl != null)
      chips.push({
        label: `${f.pnl >= 0 ? "+" : ""}${fmtSol(f.pnl)} SOL`,
        tone: f.pnl >= 0 ? "up" : "down",
      });
    if (f.fillMarketCap != null)
      chips.push({ label: `${fmtMarketCap(f.fillMarketCap)} MC`, tone: "neutral" });
  }
  return chips;
}

/**
 * Premium typed toast + invalidations shared by all fill paths (TP/SL and buy
 * limits). Copy only uses fields the fill actually has — no fabricated token
 * counts / USD.
 */
function useFillReporter() {
  const qc = useQueryClient();
  return (fills: OrderFill[]) => {
    for (const f of fills) {
      const sym = f.tokenSymbol ?? "position";
      if (f.orderType === "buy_limit") {
        activityToast({
          kind: "buy_fill",
          title: "Buy limit filled",
          description: sym,
          chips: fillChips(f),
        });
      } else if (f.orderType === "take_profit") {
        activityToast({
          kind: "tp_hit",
          title: "Take profit hit",
          description: `Sold ${f.percent}% of ${sym}`,
          chips: fillChips(f),
        });
      } else {
        activityToast({
          kind: "sl_hit",
          title: "Stop loss triggered",
          description: `Sold ${f.percent}% of ${sym}`,
          chips: fillChips(f),
        });
      }
    }
    if (fills.length > 0) {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["pf"] });
      qc.invalidateQueries({ queryKey: ["pf-stats"] });
      qc.invalidateQueries({ queryKey: ["account"] });
    }
  };
}

/**
 * Watches the shared positions query for server-side TP/SL order fills (the
 * backend evaluates them on every positions refresh and returns orderFills) and
 * toasts each one exactly once. Mounted once at the app shell.
 */
function useServerOrderFills() {
  const { wallet, isGuest } = useAccount();
  const report = useFillReporter();
  const seen = useRef<Set<number>>(new Set());

  // Observe-only: read the shared positions cache that the Trading/Portfolio
  // pages already poll. Server-side TP/SL fills only happen when /trade/positions
  // is fetched, so this hook never needs to (and never does) issue its own
  // requests - it adds zero new external API calls.
  const { data } = useQuery({
    queryKey: ["positions", wallet],
    queryFn: () => api.positions(wallet!),
    enabled: false,
  });

  useEffect(() => {
    const fills = data?.orderFills;
    if (!fills || fills.length === 0) return;
    const fresh = fills.filter((f) => !seen.current.has(f.orderId));
    if (fresh.length === 0) return;
    for (const f of fresh) seen.current.add(f.orderId);
    report(fresh);
  }, [data, report]);
}

/**
 * Checks the server for buy-limit fills only when the session loads or the user
 * returns to the app - NOT on an always-on interval. The check fires on mount
 * (page load / refresh) and on window refocus, debounced by a 30 s staleTime so
 * rapid refocus never spams the endpoint. The backend evaluates only the current
 * wallet's active (pending) buy limits, reads token info from the 30 s cache, and
 * fills through executeBuy() with an atomic pending→filling claim, so the cost is
 * bounded by the per-user order cap (5) and fills are idempotent. Toasts any
 * fills and invalidates the relevant queries. Mounted once at the app shell.
 */
function useServerBuyLimitFills() {
  const { wallet, isGuest } = useAccount();
  const report = useFillReporter();
  const seen = useRef<Set<number>>(new Set());

  const { data } = useQuery({
    queryKey: ["buy-limit-check", wallet],
    queryFn: () => api.checkBuyLimits(wallet!),
    enabled: !!wallet && !isGuest,
    // Refresh-triggered only: run on load and on refocus, never on a timer.
    refetchInterval: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  useEffect(() => {
    const fills = data?.fills;
    if (!fills || fills.length === 0) return;
    const fresh = fills.filter((f) => !seen.current.has(f.orderId));
    if (fresh.length === 0) return;
    for (const f of fresh) seen.current.add(f.orderId);
    report(fresh);
  }, [data, report]);
}

/**
 * Guest mirror: evaluates local pending orders whenever the valued positions'
 * market caps/prices change (the values are already fetched - no new calls for
 * the check) and toasts any fills. Gated on a primitive signal string so it only
 * runs when the underlying numbers actually move, not on array identity.
 *
 * Note: guest buy-limit orders for tokens not currently held cannot be
 * evaluated here (no live MC available). They will be evaluated when the user
 * visits the token's trading page and the token info query fetches current data.
 */
function useGuestOrderFills() {
  const { isGuest } = useAccount();
  const guestState = useGuestStore();
  const report = useFillReporter();
  const { positions: valued } = useGuestValuedPositions({ observeOnly: true });
  const running = useRef(false);

  const signal = isGuest
    ? valued
        .map(
          (p: Position) =>
            `${p.token_mint}:${p.currentMarketCapUsd ?? ""}:${
              p.currentPriceSol ?? ""
            }`,
        )
        .join("|")
    : "";

  useEffect(() => {
    if (!isGuest) return;
    if (guestState.orders.length === 0) return;
    if (running.current) return;
    running.current = true;
    let cancelled = false;
    evaluateGuestOrders(valued)
      .then((fills) => {
        if (!cancelled && fills.length > 0) report(fills);
      })
      .finally(() => {
        running.current = false;
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, signal, guestState.orders.length]);
}

/**
 * Single hook mounted at the app shell that drives automatic order fill toasts
 * for both signed-in and guest sessions, covering TP/SL exits and buy limits.
 */
export function useOrderFillToasts() {
  useServerOrderFills();
  useServerBuyLimitFills();
  useGuestOrderFills();
}

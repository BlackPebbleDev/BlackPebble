import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type OrderFill, type Position } from "@/lib/api";
import { useAccount } from "@/hooks/use-account";
import { useToast } from "@/hooks/use-toast";
import {
  useGuestStore,
  useGuestValuedPositions,
  evaluateGuestOrders,
} from "@/lib/guest-store";
import { fmtMarketCap, fmtSol } from "@/lib/format";

/** Toast copy + invalidations shared by the server and guest fill paths. */
function useFillReporter() {
  const { toast } = useToast();
  const qc = useQueryClient();
  return (fills: OrderFill[]) => {
    for (const f of fills) {
      const isTp = f.orderType === "take_profit";
      const pnl =
        f.pnl != null
          ? ` · P&L ${fmtSol(f.pnl)} SOL`
          : "";
      toast({
        title: `${isTp ? "Take Profit" : "Stop Loss"} filled${
          f.tokenSymbol ? ` — ${f.tokenSymbol}` : ""
        }`,
        description: `Sold ${f.percent}% at ${fmtMarketCap(
          f.fillMarketCap,
        )} MC${pnl}`,
      });
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
 * Watches the shared positions query for server-side order fills (the backend
 * evaluates TP/SL on every positions refresh and returns orderFills) and toasts
 * each one exactly once. Mounted once at the app shell.
 */
function useServerOrderFills() {
  const { wallet, isGuest } = useAccount();
  const report = useFillReporter();
  const seen = useRef<Set<number>>(new Set());

  // Observe-only: read the shared positions cache that the Trading/Portfolio
  // pages already poll. Server-side TP/SL fills only happen when /trade/positions
  // is fetched, so this hook never needs to (and never does) issue its own
  // requests — it adds zero new external API calls.
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
 * Guest mirror: evaluates local pending orders whenever the valued positions'
 * market caps/prices change (the values are already fetched — no new calls for
 * the check) and toasts any fills. Gated on a primitive signal string so it only
 * runs when the underlying numbers actually move, not on array identity.
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
 * Single hook mounted at the app shell that drives automatic TP/SL fill toasts
 * for both signed-in and guest sessions.
 */
export function useOrderFillToasts() {
  useServerOrderFills();
  useGuestOrderFills();
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api, type PaperOrder } from "@/lib/api";
import { useAccount } from "@/hooks/use-account";
import { useToast } from "@/hooks/use-toast";
import {
  useGuestStore,
  guestActiveOrders,
  guestCancelOrder,
} from "@/lib/guest-store";
import { fmtMarketCap } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Active TP/SL exit orders attached to a single position, with cancel. Self
 * contained: reads server orders for a signed-in wallet (sharing the polled
 * ["orders", wallet, mint] cache) or the local guest store for guests. Renders
 * nothing when there are no active orders so it stays out of the way.
 */
export function PositionOrders({ mint }: { mint: string }) {
  const { wallet, isGuest } = useAccount();
  const { toast } = useToast();
  const qc = useQueryClient();
  const guestState = useGuestStore();

  const { data } = useQuery({
    queryKey: ["orders", wallet, mint],
    queryFn: () => api.orders(wallet!, mint),
    enabled: !!wallet && !isGuest,
    refetchInterval: 15_000,
  });

  const orders: PaperOrder[] = isGuest
    ? guestActiveOrders(guestState, mint)
    : data?.orders ?? [];

  if (orders.length === 0) return null;

  const cancel = async (id: number) => {
    if (isGuest) {
      guestCancelOrder(id);
      return;
    }
    try {
      await api.cancelOrder(wallet!, id);
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      toast({
        title: "Couldn't cancel order",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Exit Orders
      </div>
      {orders.map((o) => {
        const isTp = o.order_type === "take_profit";
        return (
          <div
            key={o.id}
            data-testid={`order-row-${o.id}`}
            className="flex items-center justify-between gap-2 border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                className={cn(
                  "font-medium shrink-0",
                  isTp ? "text-emerald-400" : "text-red-400",
                )}
              >
                {isTp ? "Take Profit" : "Stop Loss"}
              </span>
              <span className="text-muted-foreground truncate font-mono">
                {o.amount_value}% @ {o.trigger_direction === "gte" ? "≥" : "≤"}{" "}
                {fmtMarketCap(o.trigger_value)} MC
                {o.status === "filling" ? " · filling…" : ""}
              </span>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cancel(o.id);
              }}
              data-testid={`button-cancel-order-${o.id}`}
              aria-label="Cancel order"
              className="flex items-center gap-1 text-muted-foreground hover:text-red-400 transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        );
      })}
    </div>
  );
}

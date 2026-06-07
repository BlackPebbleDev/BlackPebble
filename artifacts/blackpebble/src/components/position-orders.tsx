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
 * Shared cancel logic used by both PositionOrders and AllExitOrders.
 */
function useCancelOrder() {
  const { wallet, isGuest } = useAccount();
  const { toast } = useToast();
  const qc = useQueryClient();

  return async (id: number) => {
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
}

/**
 * A single exit-order row. `showToken` adds a token symbol prefix useful in
 * the portfolio-level "all orders" list.
 */
function OrderRow({
  order,
  showToken,
  onCancel,
}: {
  order: PaperOrder;
  showToken?: boolean;
  onCancel: (id: number) => void;
}) {
  const isTp = order.order_type === "take_profit";
  return (
    <div
      key={order.id}
      data-testid={`order-row-${order.id}`}
      className="flex items-center justify-between gap-2 border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs"
    >
      <span className="flex items-center gap-1.5 min-w-0">
        {showToken && (
          <span className="font-mono font-medium text-foreground/80 shrink-0">
            {order.token_symbol ?? order.token_mint.slice(0, 6)}
          </span>
        )}
        <span
          className={cn(
            "font-medium shrink-0",
            isTp ? "text-emerald-400" : "text-red-400",
          )}
        >
          {isTp ? "Take Profit" : "Stop Loss"}
        </span>
        <span className="text-muted-foreground truncate font-mono">
          {order.amount_value}% @{" "}
          {order.trigger_direction === "gte" ? "≥" : "≤"}{" "}
          {fmtMarketCap(order.trigger_value)} MC
          {order.status === "filling" ? " · filling…" : ""}
        </span>
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCancel(order.id);
        }}
        data-testid={`button-cancel-order-${order.id}`}
        aria-label="Cancel order"
        className="flex items-center gap-1 text-muted-foreground hover:text-red-400 transition-colors shrink-0"
      >
        <X className="h-3.5 w-3.5" />
        Cancel
      </button>
    </div>
  );
}

/**
 * Active TP/SL exit orders attached to a single position, with cancel. Self
 * contained: reads server orders for a signed-in wallet (sharing the polled
 * ["orders", wallet, mint] cache) or the local guest store for guests. Renders
 * nothing when there are no active orders so it stays out of the way.
 */
export function PositionOrders({ mint }: { mint: string }) {
  const { wallet, isGuest } = useAccount();
  const guestState = useGuestStore();
  const cancel = useCancelOrder();

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

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Exit Orders
      </div>
      {orders.map((o) => (
        <OrderRow key={o.id} order={o} onCancel={cancel} />
      ))}
    </div>
  );
}

/**
 * Portfolio-level view: all active TP/SL exit orders across every position,
 * with token symbol prefix and cancel. Used on the Portfolio page.
 */
export function AllExitOrders() {
  const { wallet, isGuest } = useAccount();
  const guestState = useGuestStore();
  const cancel = useCancelOrder();

  const { data } = useQuery({
    queryKey: ["orders", wallet],
    queryFn: () => api.orders(wallet!),
    enabled: !!wallet && !isGuest,
    refetchInterval: 15_000,
  });

  const orders: PaperOrder[] = isGuest
    ? guestActiveOrders(guestState)
    : data?.orders ?? [];

  if (orders.length === 0) {
    return (
      <div
        data-testid="exit-orders-empty"
        className="border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground"
      >
        No active exit orders. Add a Take Profit or Stop Loss from an open
        position.
      </div>
    );
  }

  return (
    <div
      data-testid="exit-orders-list"
      className="border border-border bg-card divide-y divide-border/40"
    >
      {orders.map((o) => (
        <div key={o.id} className="px-3 py-1.5">
          <OrderRow order={o} showToken onCancel={cancel} />
        </div>
      ))}
    </div>
  );
}

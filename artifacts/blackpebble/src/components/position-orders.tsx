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
import { fmtMarketCap, fmtSol } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Shared cancel logic used by both PositionOrders and AllOrders.
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
 * A single order row. Handles take_profit, stop_loss, and buy_limit display.
 * `showToken` adds a token symbol prefix useful in the portfolio-level list.
 */
function OrderRow({
  order,
  showToken,
  onCancel,
  onNavigate,
}: {
  order: PaperOrder;
  showToken?: boolean;
  onCancel: (id: number) => void;
  onNavigate?: (mint: string) => void;
}) {
  const isBuyLimit = order.order_type === "buy_limit";
  const isTp = order.order_type === "take_profit";

  const labelColor = isBuyLimit
    ? "text-accent"
    : isTp
      ? "text-emerald-400"
      : "text-red-400";

  const label = isBuyLimit ? "Buy Limit" : isTp ? "Take Profit" : "Stop Loss";

  const detail = isBuyLimit
    ? `${fmtSol(order.amount_value)} SOL @ ≤ ${fmtMarketCap(order.trigger_value)} MC`
    : `${order.amount_value}% @ ${order.trigger_direction === "gte" ? "≥" : "≤"} ${fmtMarketCap(order.trigger_value)} MC`;

  return (
    <div
      key={order.id}
      data-testid={`order-row-${order.id}`}
      className="flex items-center justify-between gap-2 border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs"
    >
      <span className="flex items-center gap-1.5 min-w-0">
        {showToken &&
          (onNavigate ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(order.token_mint);
              }}
              data-testid={`button-order-token-${order.id}`}
              className="font-mono font-medium text-foreground/80 hover:text-accent transition-colors shrink-0"
            >
              {order.token_symbol ?? order.token_mint.slice(0, 6)}
            </button>
          ) : (
            <span className="font-mono font-medium text-foreground/80 shrink-0">
              {order.token_symbol ?? order.token_mint.slice(0, 6)}
            </span>
          ))}
        <span className={cn("font-medium shrink-0", labelColor)}>
          {label}
        </span>
        <span className="text-muted-foreground truncate font-mono">
          {detail}
          {order.status === "filling" ? " · filling…" : ""}
        </span>
      </span>
      {order.status === "pending" ? (
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
      ) : (
        <span className="text-[11px] text-muted-foreground shrink-0">
          Filling…
        </span>
      )}
    </div>
  );
}

/**
 * Active TP/SL exit orders attached to a single position, with cancel.
 * Buy limit orders are NOT shown here (they are not attached to a position).
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

  const allOrders: PaperOrder[] = isGuest
    ? guestActiveOrders(guestState, mint)
    : data?.orders ?? [];

  // Show only sell-side orders (TP/SL) on the position card.
  const orders = allOrders.filter((o) => o.order_type !== "buy_limit");

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
 * Two-line card row used only in the portfolio-level EXIT ORDERS section.
 * Line 1: [token symbol (linked)] [TP/SL label] [Cancel | Filling…]
 * Line 2: Sell X% · Trigger: MC ≥/≤ $Y
 */
function ExitOrderCard({
  order,
  onCancel,
  onNavigate,
}: {
  order: PaperOrder;
  onCancel: (id: number) => void;
  onNavigate?: (mint: string) => void;
}) {
  const isTp = order.order_type === "take_profit";
  const labelColor = isTp ? "text-emerald-400" : "text-red-400";
  const label = isTp ? "Take Profit" : "Stop Loss";
  const triggerDir = order.trigger_direction === "gte" ? "≥" : "≤";

  return (
    <div
      data-testid={`order-row-${order.id}`}
      className="px-3 py-2.5 space-y-1"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          {onNavigate ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(order.token_mint);
              }}
              data-testid={`button-order-token-${order.id}`}
              className="font-mono font-semibold text-sm text-foreground/90 hover:text-accent transition-colors shrink-0"
            >
              {order.token_symbol ?? order.token_mint.slice(0, 6)}
            </button>
          ) : (
            <span className="font-mono font-semibold text-sm text-foreground/90 shrink-0">
              {order.token_symbol ?? order.token_mint.slice(0, 6)}
            </span>
          )}
          <span className={cn("text-xs font-medium shrink-0", labelColor)}>
            {label}
          </span>
        </span>
        {order.status === "pending" ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancel(order.id);
            }}
            data-testid={`button-cancel-order-${order.id}`}
            aria-label="Cancel order"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        ) : (
          <span className="text-[11px] text-muted-foreground shrink-0">
            Filling…
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
        <span>Sell {order.amount_value}%</span>
        <span>·</span>
        <span>
          Trigger: MC {triggerDir} {fmtMarketCap(order.trigger_value)}
        </span>
      </div>
    </div>
  );
}

/**
 * Portfolio-level view: all active orders (TP/SL exits + buy limits) across
 * every position/token, with token symbol prefix and cancel. Used on the
 * Portfolio page. Renders its own section heading with live order count.
 */
export function AllOrders({
  onNavigate,
}: {
  onNavigate?: (mint: string) => void;
}) {
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

  const exitOrders = orders.filter((o) => o.order_type !== "buy_limit");
  const buyLimits = orders.filter((o) => o.order_type === "buy_limit");

  return (
    <div data-testid="all-orders-section" className="mt-8">
      <h2 className="text-lg font-semibold mb-3">
        Active Orders
        {orders.length > 0 && (
          <span className="text-base font-normal text-muted-foreground ml-1">
            ({orders.length})
          </span>
        )}
      </h2>

      {orders.length === 0 ? (
        <div
          data-testid="exit-orders-empty"
          className="border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground"
        >
          No active orders. Add a Take Profit or Stop Loss from an open
          position, or set a Buy Limit from the Trade Planner.
        </div>
      ) : (
        <div data-testid="exit-orders-list" className="space-y-3">
          {buyLimits.length > 0 && (
            <div className="border border-border bg-card">
              <div className="px-3 py-2 border-b border-border/60">
                <span className="text-[11px] font-medium uppercase tracking-wider text-accent">
                  Buy Limits
                </span>
              </div>
              <div className="divide-y divide-border/40">
                {buyLimits.map((o) => (
                  <div key={o.id} className="px-3 py-1.5">
                    <OrderRow
                      order={o}
                      showToken
                      onCancel={cancel}
                      onNavigate={onNavigate}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {exitOrders.length > 0 && (
            <div className="border border-border bg-card">
              <div className="px-3 py-2 border-b border-border/60">
                <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-400/80">
                  Exit Orders
                </span>
              </div>
              <div className="divide-y divide-border/40">
                {exitOrders.map((o) => (
                  <ExitOrderCard
                    key={o.id}
                    order={o}
                    onCancel={cancel}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

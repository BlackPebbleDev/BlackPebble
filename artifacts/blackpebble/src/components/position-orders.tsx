import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api, type PaperOrder, type LeveragePosition } from "@/lib/api";
import { useAccount } from "@/hooks/use-account";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
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
    : `Sell ${order.amount_value}% of remaining @ ${order.trigger_direction === "gte" ? "≥" : "≤"} ${fmtMarketCap(order.trigger_value)} MC`;

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
 * Read-only display of a leverage position's TP or SL trigger. Leverage TP/SL
 * live on the position itself (not the orders table), so there is no cancel —
 * closing the position removes them.
 */
function LeverageOrderRow({
  p,
  kind,
}: {
  p: LeveragePosition;
  kind: "tp" | "sl";
}) {
  const isTp = kind === "tp";
  const triggerMc = isTp ? p.tp_trigger_mc : p.sl_trigger_mc;
  if (triggerMc == null) return null;
  const label = isTp ? "Leverage TP" : "Leverage SL";
  const labelColor = isTp ? "text-emerald-400" : "text-red-400";
  return (
    <div
      data-testid={`leverage-order-row-${kind}-${p.id}`}
      className="flex items-center justify-between gap-2 border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs"
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={cn("font-medium shrink-0", labelColor)}>{label}</span>
        <span className="text-muted-foreground truncate font-mono">
          Close 100% @ {isTp ? "≥" : "≤"} {fmtMarketCap(triggerMc)} MC
        </span>
      </span>
      <span className="text-[11px] text-muted-foreground shrink-0">Auto</span>
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

/** Display order within a token group: Buy Limit, then Take Profit, then Stop Loss. */
function orderTypeRank(t: PaperOrder["order_type"]): number {
  return t === "buy_limit" ? 0 : t === "take_profit" ? 1 : 2;
}

/**
 * Portfolio-level view: all active orders grouped BY TOKEN. Each token gets one
 * card listing its Buy Limit / Take Profit / Stop Loss orders together, with
 * cancel. Used on the Portfolio and Trading pages. Renders its own section
 * heading with live order count.
 */
export function AllOrders({
  onNavigate,
}: {
  onNavigate?: (mint: string) => void;
}) {
  const { wallet, isGuest } = useAccount();
  const flags = useFeatureFlags();
  const guestState = useGuestStore();
  const cancel = useCancelOrder();

  const { data } = useQuery({
    queryKey: ["orders", wallet],
    queryFn: () => api.orders(wallet!),
    enabled: !!wallet && !isGuest,
    refetchInterval: 15_000,
  });

  // Leverage TP/SL live on the position (signed-in only) and are shown here
  // read-only alongside spot orders.
  const { data: levData } = useQuery({
    queryKey: ["leverage-positions", wallet],
    queryFn: () => api.leverage.positions(wallet!),
    enabled: !!wallet && !isGuest && flags.leverage,
    refetchInterval: 15_000,
  });

  const orders: PaperOrder[] = isGuest
    ? guestActiveOrders(guestState)
    : data?.orders ?? [];

  const levWithTriggers = (levData?.positions ?? []).filter(
    (p) => p.tp_trigger_mc != null || p.sl_trigger_mc != null,
  );
  const levTriggerCount = levWithTriggers.reduce(
    (n, p) => n + (p.tp_trigger_mc != null ? 1 : 0) + (p.sl_trigger_mc != null ? 1 : 0),
    0,
  );
  const totalCount = orders.length + levTriggerCount;

  // Group every active order by its token, preserving first-seen order. Each
  // group lists its Buy Limit / TP / SL together (display only — no engine change).
  const groups: { mint: string; symbol: string; orders: PaperOrder[] }[] = [];
  const indexByMint = new Map<string, number>();
  for (const o of orders) {
    let idx = indexByMint.get(o.token_mint);
    if (idx == null) {
      idx = groups.length;
      indexByMint.set(o.token_mint, idx);
      groups.push({
        mint: o.token_mint,
        symbol: o.token_symbol ?? o.token_mint.slice(0, 6),
        orders: [],
      });
    }
    groups[idx].orders.push(o);
  }
  for (const g of groups) {
    g.orders.sort((a, b) => orderTypeRank(a.order_type) - orderTypeRank(b.order_type));
  }

  return (
    <div data-testid="all-orders-section" className="mt-8">
      <h2 className="text-lg font-semibold mb-3">
        Active Orders
        {totalCount > 0 && (
          <span className="text-base font-normal text-muted-foreground ml-1">
            ({totalCount})
          </span>
        )}
      </h2>

      {totalCount === 0 ? (
        <div
          data-testid="exit-orders-empty"
          className="rounded-xl bg-card shadow-card px-4 py-8 text-center text-sm text-muted-foreground"
        >
          No active orders. Add a Take Profit or Stop Loss from an open
          position, or set a Buy Limit from the Trade Planner.
        </div>
      ) : (
        <div data-testid="exit-orders-list" className="space-y-3">
          {groups.map((g) => (
            <div
              key={g.mint}
              data-testid={`order-group-${g.mint}`}
              className="rounded-xl bg-card shadow-card overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60">
                {onNavigate ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(g.mint)}
                    data-testid={`button-order-group-${g.mint}`}
                    className="font-mono font-semibold text-sm text-foreground/90 hover:text-accent transition-colors"
                  >
                    {g.symbol}
                  </button>
                ) : (
                  <span className="font-mono font-semibold text-sm text-foreground/90">
                    {g.symbol}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {g.orders.length} {g.orders.length === 1 ? "order" : "orders"}
                </span>
              </div>
              <div className="p-2 space-y-1.5">
                {g.orders.map((o) => (
                  <OrderRow key={o.id} order={o} onCancel={cancel} />
                ))}
              </div>
            </div>
          ))}

          {levWithTriggers.map((p) => (
            <div
              key={`lev-${p.id}`}
              data-testid={`leverage-order-group-${p.id}`}
              className="rounded-xl bg-card shadow-card overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60">
                {onNavigate ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(p.token_mint)}
                    data-testid={`button-leverage-order-group-${p.id}`}
                    className="font-mono font-semibold text-sm text-foreground/90 hover:text-accent transition-colors"
                  >
                    {p.token_symbol ?? p.token_mint.slice(0, 6)}
                    <span className="ml-1.5 text-[11px] font-semibold uppercase text-accent">
                      {p.leverage}x Long
                    </span>
                  </button>
                ) : (
                  <span className="font-mono font-semibold text-sm text-foreground/90">
                    {p.token_symbol ?? p.token_mint.slice(0, 6)}
                    <span className="ml-1.5 text-[11px] font-semibold uppercase text-accent">
                      {p.leverage}x Long
                    </span>
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">Leverage</span>
              </div>
              <div className="p-2 space-y-1.5">
                <LeverageOrderRow p={p} kind="tp" />
                <LeverageOrderRow p={p} kind="sl" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X, Pencil, Check } from "lucide-react";
import {
  api,
  type LeverageExitKind,
  type LeverageExitOrder,
  type LeveragePosition,
  type LeverageTrade,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { fmtSol, fmtMarketCap, fmtPercent, pnlColor, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_TP = 4;
const MAX_SL = 1;
const PARTIAL_PRESETS = [25, 50, 75, 100] as const;

/** Parse a human market-cap input (e.g. "1.5m", "900k", "2,000,000") to a number. */
function parseMc(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!s) return null;
  const m = s.match(/^([0-9]*\.?[0-9]+)([kmb])?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = m[2] === "b" ? 1e9 : m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1;
  return n * mult;
}

/** Human labels + colors for a close reason in history. */
const REASON_BADGES: Record<string, { label: string; className: string }> = {
  manual: { label: "Manual", className: "bg-muted text-muted-foreground" },
  take_profit: { label: "Take Profit", className: "bg-success/15 text-success" },
  stop_loss: { label: "Stop Loss", className: "bg-danger/15 text-danger" },
  liquidated: { label: "Liquidated", className: "bg-red-500/25 text-danger" },
  system_correction: { label: "System", className: "bg-muted text-muted-foreground" },
};

function isShortPosition(direction: string): boolean {
  return direction === "short";
}

function directionLabel(direction: string): string {
  return isShortPosition(direction) ? "Short" : "Long";
}

/** Current market value of a leverage position: notional + unrealized P&L. */
function currentValueSol(p: LeveragePosition): number | null {
  return p.unrealizedPnlSol != null ? p.notional_sol + p.unrealizedPnlSol : null;
}

/**
 * Distance from the current market cap to the liquidation market cap, as a
 * percentage of the current market cap. Smaller = closer to liquidation.
 * Longs liquidate below the current MC, shorts above it - the distance is
 * positive while the position is alive either way.
 */
function distanceToLiqPercent(p: LeveragePosition): number | null {
  const cur = p.currentMarketCapUsd;
  const liq = p.liq_market_cap;
  if (cur == null || liq == null || cur <= 0) return null;
  return isShortPosition(p.direction)
    ? ((liq - cur) / cur) * 100
    : ((cur - liq) / cur) * 100;
}

function fmtDistance(d: number | null): string {
  if (d == null || !Number.isFinite(d)) return "—";
  return `${d.toFixed(1)}%`;
}

/**
 * Shared leverage data hook: polls positions (so the server can evaluate
 * liquidation / TP / SL), surfaces any auto-closes as toasts, exposes history,
 * and a close mutation. Exactly one mounted consumer should announce fills, so
 * pass `announce: false` for read-only consumers (e.g. summaries).
 */
function useLeverageData(wallet: string) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const seenFills = useRef<Set<number>>(new Set());

  const { data: posData } = useQuery({
    queryKey: ["leverage-positions", wallet],
    queryFn: () => api.leverage.positions(wallet),
    enabled: !!wallet,
    refetchInterval: 15_000,
  });
  const { data: histData } = useQuery({
    queryKey: ["leverage-history", wallet],
    queryFn: () => api.leverage.history(wallet),
    enabled: !!wallet,
  });

  // Perps positions can auto-close from the server cron (TP / SL / liquidation).
  // We deliberately do NOT toast here: the global /feed/mine watcher
  // (useActivityToasts) owns the premium toast + notification for auto-closes so
  // they fire on every page (and even after the fill happened while away), and
  // manual closes toast from the close mutation below. This effect only keeps
  // the balance + history fresh when a fill lands while a leverage view is open.
  // The first payload is a silent baseline: the server replays recent (~90s)
  // fills, which would otherwise re-invalidate on every mount.
  const fillsPrimed = useRef(false);
  useEffect(() => {
    const fills = posData?.fills ?? [];
    if (!fillsPrimed.current) {
      if (posData) {
        for (const f of fills) seenFills.current.add(f.tradeId ?? f.positionId);
        fillsPrimed.current = true;
      }
      return;
    }
    // Dedupe by trade id (unique per close event - a position can produce
    // several partial-close fills, so positionId alone is not enough).
    const fresh = fills.filter(
      (f) => !seenFills.current.has(f.tradeId ?? f.positionId),
    );
    if (fresh.length === 0) return;
    for (const f of fresh) seenFills.current.add(f.tradeId ?? f.positionId);
    qc.invalidateQueries({ queryKey: ["account"] });
    qc.invalidateQueries({ queryKey: ["leverage-history", wallet] });
  }, [posData, qc, wallet]);

  const closeMutation = useMutation({
    mutationFn: ({ id, percent }: { id: number; percent?: number }) =>
      api.leverage.close(wallet, id, percent),
    onSuccess: (res, vars) => {
      if (!res.ok) {
        toast({
          title: "Close failed",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      const partial = vars.percent != null && vars.percent < 100;
      toast({
        title: partial ? `Closed ${vars.percent}% of position` : "Position closed",
        description:
          res.realizedPnlSol != null
            ? `P&L ${fmtSol(res.realizedPnlSol)} SOL`
            : undefined,
      });
      qc.invalidateQueries({ queryKey: ["leverage-positions", wallet] });
      qc.invalidateQueries({ queryKey: ["leverage-history", wallet] });
      qc.invalidateQueries({ queryKey: ["account"] });
    },
    onError: (e: Error) =>
      toast({ title: "Close failed", description: e.message, variant: "destructive" }),
  });

  return {
    positions: posData?.positions ?? [],
    trades: histData?.trades ?? [],
    closeMutation,
  };
}

/**
 * Mutations for managing a position's take-profit / stop-loss exit orders.
 * All settle balance-only on the server; here we just invalidate the positions
 * query so the row re-renders with the updated order set.
 */
function useExitOrderMutations(wallet: string) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["leverage-positions", wallet] });
  const fail = (title: string) => (e: unknown) =>
    toast({
      title,
      description: e instanceof Error ? e.message : undefined,
      variant: "destructive",
    });

  const create = useMutation({
    mutationFn: (body: {
      positionId: number;
      kind: LeverageExitKind;
      triggerMc: number;
      percent: number;
    }) => api.leverage.createOrder({ wallet, ...body }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast({ title: "Couldn't add order", description: res.error, variant: "destructive" });
        return;
      }
      invalidate();
    },
    onError: fail("Couldn't add order"),
  });

  const update = useMutation({
    mutationFn: (body: { orderId: number; triggerMc?: number; percent?: number }) =>
      api.leverage.updateOrder({ wallet, ...body }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast({ title: "Couldn't update order", description: res.error, variant: "destructive" });
        return;
      }
      invalidate();
    },
    onError: fail("Couldn't update order"),
  });

  const cancel = useMutation({
    mutationFn: (orderId: number) => api.leverage.cancelOrder(wallet, orderId),
    onSuccess: (res) => {
      if (!res.ok) {
        toast({ title: "Couldn't cancel order", description: res.error, variant: "destructive" });
        return;
      }
      invalidate();
    },
    onError: fail("Couldn't cancel order"),
  });

  return { create, update, cancel };
}

/**
 * Portfolio-page leverage section: every open position (live unrealized P&L +
 * liquidation) plus full leverage trade history. Signed-in only.
 */
export function LeveragePortfolioSection({
  wallet,
  onNavigate,
}: {
  wallet: string;
  onNavigate: (mint: string) => void;
}) {
  const { positions, trades, closeMutation } = useLeverageData(wallet);

  const openMargin = positions.reduce((s, p) => s + p.margin_sol, 0);
  const unrealized = positions.reduce((s, p) => s + (p.unrealizedPnlSol ?? 0), 0);
  const realized = trades
    .filter((t) => t.action === "close" || t.action === "liquidated")
    .reduce((s, t) => s + (t.pnl_sol ?? 0), 0);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Perps Positions ({positions.length})
        </h2>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>
            Margin{" "}
            <span className="font-mono text-foreground">{fmtSol(openMargin)}</span>
          </span>
          <span>
            Unrealized{" "}
            <span className={cn("font-mono", pnlColor(unrealized))}>
              {fmtSol(unrealized)}
            </span>
          </span>
          <span>
            Realized{" "}
            <span className={cn("font-mono", pnlColor(realized))}>
              {fmtSol(realized)}
            </span>
          </span>
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="rounded-xl bg-card shadow-card px-4 py-8 text-center text-sm text-muted-foreground">
          No open perps positions.
        </div>
      ) : (
        <div className="space-y-2">
          {positions.map((p) => (
            <LeverageRow
              key={p.id}
              p={p}
              wallet={wallet}
              onNavigate={onNavigate}
              onClose={(percent) => closeMutation.mutate({ id: p.id, percent })}
              closing={closeMutation.isPending && closeMutation.variables?.id === p.id}
            />
          ))}
        </div>
      )}

      {trades.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-semibold">Perps History</h2>
          <LeverageHistoryTable trades={trades} onNavigate={onNavigate} />
        </>
      )}
    </section>
  );
}

/**
 * Token-page leverage box: a separate, tabbed Positions / History panel scoped
 * to a single token. Mirrors the spot Positions / History box but stays fully
 * isolated from spot. Signed-in only (leverage requires a wallet).
 */
export function TokenLeverageActivity({
  wallet,
  mint,
  onNavigate,
}: {
  wallet: string;
  mint: string;
  onNavigate: (mint: string) => void;
}) {
  const [tab, setTab] = useState<"positions" | "history">("positions");
  const { positions, trades, closeMutation } = useLeverageData(wallet);

  const tokenPositions = positions.filter((p) => p.token_mint === mint);
  const tokenTrades = trades.filter((t) => t.token_mint === mint);

  const tabs = [
    { id: "positions" as const, label: "Perps Positions" },
    { id: "history" as const, label: "Perps History" },
  ];

  return (
    <div className="mt-8 rounded-2xl bg-card shadow-card overflow-hidden" data-testid="leverage-activity">
      <div className="p-3 pb-0">
        <div
          role="tablist"
          aria-label="Leverage activity"
          className="flex border border-border rounded-md p-0.5"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              data-testid={`tab-leverage-${t.id}`}
              className={cn(
                "flex-1 py-2 rounded-md text-sm font-medium transition-colors",
                tab === t.id
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "positions" && (
        <div className="p-3">
          {tokenPositions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No open perps positions for this token.
            </div>
          ) : (
            <div className="space-y-2">
              {tokenPositions.map((p) => (
                <LeverageRow
                  key={p.id}
                  p={p}
                  wallet={wallet}
                  onNavigate={onNavigate}
                  onClose={(percent) => closeMutation.mutate({ id: p.id, percent })}
                  closing={
                    closeMutation.isPending && closeMutation.variables?.id === p.id
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="p-3">
          {tokenTrades.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No perps history for this token.
            </div>
          ) : (
            <LeverageHistoryTable trades={tokenTrades} onNavigate={onNavigate} />
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={cn("font-mono text-foreground", valueClass)}>{value}</div>
    </div>
  );
}

function LeverageRow({
  p,
  wallet,
  onNavigate,
  onClose,
  closing,
}: {
  p: LeveragePosition;
  wallet: string;
  onNavigate: (mint: string) => void;
  onClose: (percent?: number) => void;
  closing: boolean;
}) {
  const [manageOpen, setManageOpen] = useState(false);
  const pnl = p.unrealizedPnlSol;
  const roi = p.roiOnMargin;
  const curVal = currentValueSol(p);
  const dist = distanceToLiqPercent(p);
  const exits = p.exitOrders ?? [];
  return (
    <div className="rounded-xl bg-card shadow-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onNavigate(p.token_mint)}
          className="flex items-center gap-2 text-left"
          data-testid={`button-leverage-token-${p.id}`}
        >
          {p.token_logo && (
            <img
              src={p.token_logo}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
            />
          )}
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium">
              {p.token_symbol ?? "Token"}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                  isShortPosition(p.direction)
                    ? "bg-danger/15 text-danger"
                    : "bg-success/15 text-success",
                )}
              >
                {p.leverage}x {directionLabel(p.direction)}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {p.token_name ? `${p.token_name} · ` : ""}
              opened {timeAgo(p.opened_at)}
            </div>
          </div>
        </button>
        <div className="text-right">
          <div className={cn("font-mono text-sm", pnlColor(pnl ?? 0))}>
            {pnl != null ? `${fmtSol(pnl)} SOL` : "—"}
          </div>
          <div className={cn("text-[11px]", pnlColor(roi ?? 0))}>
            {roi != null ? fmtPercent(roi * 100) : "—"}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-[11px]">
        <StatCell label="Margin" value={`${fmtSol(p.margin_sol)} SOL`} />
        <StatCell label="Position Size" value={`${fmtSol(p.notional_sol)} SOL`} />
        <StatCell
          label="Current Value"
          value={curVal != null ? `${fmtSol(curVal)} SOL` : "—"}
        />
        <StatCell label="Entry MC" value={fmtMarketCap(p.entry_market_cap)} />
        <StatCell label="Current MC" value={fmtMarketCap(p.currentMarketCapUsd)} />
        <StatCell
          label="Liq MC"
          value={fmtMarketCap(p.liq_market_cap)}
          valueClass="text-danger"
        />
      </div>

      {exits.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {exits.map((o) => (
            <span
              key={o.id}
              data-testid={`leverage-exit-pill-${o.id}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                o.kind === "take_profit"
                  ? "bg-success/15 text-success"
                  : "bg-danger/15 text-danger",
              )}
            >
              {o.kind === "take_profit" ? "TP" : "SL"} {o.percent}% @{" "}
              {fmtMarketCap(o.trigger_mc)}
              {o.status === "filling" ? " · filling…" : ""}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">
          Distance to Liq:{" "}
          <span
            className={cn(
              "font-mono",
              dist != null && dist < 10 ? "text-danger" : "text-foreground",
            )}
          >
            {fmtDistance(dist)}
          </span>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setManageOpen((o) => !o)}
            data-testid={`button-leverage-manage-${p.id}`}
            className={cn(
              "h-8 px-3 text-xs font-medium border transition-colors rounded-md",
              manageOpen
                ? "border-accent text-accent"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Manage
          </button>
          <button
            type="button"
            onClick={() => onClose()}
            disabled={closing}
            data-testid={`button-leverage-close-${p.id}`}
            className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-danger/40 text-danger hover:bg-danger/15 transition-colors rounded-md disabled:opacity-40"
          >
            {closing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Close
          </button>
        </div>
      </div>

      {manageOpen && (
        <ManageExits
          p={p}
          wallet={wallet}
          exits={exits}
          onPartialClose={(percent) => onClose(percent)}
          closing={closing}
        />
      )}
    </div>
  );
}

/**
 * Expandable management surface for a leverage position: partial close (% of
 * remaining), plus add / modify / cancel of take-profit (≤4) and stop-loss (1)
 * exit orders. Triggers are USD market caps validated server-side.
 */
function ManageExits({
  p,
  wallet,
  exits,
  onPartialClose,
  closing,
}: {
  p: LeveragePosition;
  wallet: string;
  exits: LeverageExitOrder[];
  onPartialClose: (percent: number) => void;
  closing: boolean;
}) {
  const { create, update, cancel } = useExitOrderMutations(wallet);
  const [adding, setAdding] = useState<LeverageExitKind | null>(null);

  const tpCount = exits.filter((o) => o.kind === "take_profit").length;
  const slCount = exits.filter((o) => o.kind === "stop_loss").length;
  const canAddTp = tpCount < MAX_TP;
  const canAddSl = slCount < MAX_SL;

  return (
    <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
      {/* Partial close */}
      <div>
        <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Close Amount
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {PARTIAL_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              disabled={closing}
              onClick={() => onPartialClose(pct)}
              data-testid={`button-leverage-partial-${p.id}-${pct}`}
              className="h-8 rounded-md border border-border text-xs font-medium text-muted-foreground hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
            >
              {pct === 100 ? "Full" : `${pct}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Exit orders */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Take Profit / Stop Loss
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={!canAddTp}
              onClick={() => setAdding(adding === "take_profit" ? null : "take_profit")}
              data-testid={`button-leverage-add-tp-${p.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-success/40 px-2 py-1 text-[11px] font-medium text-success hover:bg-success/10 transition-colors disabled:opacity-30"
            >
              <Plus className="h-3 w-3" /> TP
            </button>
            <button
              type="button"
              disabled={!canAddSl}
              onClick={() => setAdding(adding === "stop_loss" ? null : "stop_loss")}
              data-testid={`button-leverage-add-sl-${p.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-danger/40 px-2 py-1 text-[11px] font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-30"
            >
              <Plus className="h-3 w-3" /> SL
            </button>
          </div>
        </div>

        {exits.length === 0 && !adding && (
          <p className="text-[11px] text-muted-foreground">
            No exit orders. Add a take-profit or stop-loss above.
          </p>
        )}

        <div className="space-y-1.5">
          {exits.map((o) => (
            <ExitOrderRow
              key={o.id}
              order={o}
              onSave={(triggerMc, percent) =>
                update.mutate({ orderId: o.id, triggerMc, percent })
              }
              onCancel={() => cancel.mutate(o.id)}
              busy={
                (update.isPending && update.variables?.orderId === o.id) ||
                (cancel.isPending && cancel.variables === o.id)
              }
            />
          ))}

          {adding && (
            <ExitOrderEditor
              kind={adding}
              busy={create.isPending}
              onSubmit={(triggerMc, percent) =>
                create.mutate(
                  { positionId: p.id, kind: adding, triggerMc, percent },
                  { onSuccess: () => setAdding(null) },
                )
              }
              onCancel={() => setAdding(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** One existing exit order: read-only summary with inline edit + cancel. */
function ExitOrderRow({
  order,
  onSave,
  onCancel,
  busy,
}: {
  order: LeverageExitOrder;
  onSave: (triggerMc: number, percent: number) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const isTp = order.kind === "take_profit";
  const filling = order.status === "filling";

  if (editing) {
    return (
      <ExitOrderEditor
        kind={order.kind}
        initialMc={String(order.trigger_mc)}
        initialPercent={order.percent}
        busy={busy}
        onSubmit={(mc, pct) => {
          onSave(mc, pct);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      data-testid={`leverage-exit-row-${order.id}`}
      className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-xs"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "font-medium shrink-0",
            isTp ? "text-success" : "text-danger",
          )}
        >
          {isTp ? "Take Profit" : "Stop Loss"}
        </span>
        <span className="truncate font-mono text-muted-foreground">
          Close {order.percent}% @ {isTp ? "≥" : "≤"} {fmtMarketCap(order.trigger_mc)} MC
          {filling ? " · filling…" : ""}
        </span>
      </span>
      {!filling && (
        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={busy}
            data-testid={`button-leverage-exit-edit-${order.id}`}
            aria-label="Edit order"
            className="flex items-center gap-1 text-muted-foreground hover:text-accent transition-colors disabled:opacity-40"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-testid={`button-leverage-exit-cancel-${order.id}`}
            aria-label="Cancel order"
            className="flex items-center gap-1 text-muted-foreground hover:text-danger transition-colors disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}

/** Inline editor for creating or modifying an exit order. */
function ExitOrderEditor({
  kind,
  initialMc = "",
  initialPercent = 100,
  busy,
  onSubmit,
  onCancel,
}: {
  kind: LeverageExitKind;
  initialMc?: string;
  initialPercent?: number;
  busy: boolean;
  onSubmit: (triggerMc: number, percent: number) => void;
  onCancel: () => void;
}) {
  const isTp = kind === "take_profit";
  const [mc, setMc] = useState(initialMc);
  const [percent, setPercent] = useState(String(initialPercent));
  const parsedMc = parseMc(mc);
  const parsedPct = Number(percent);
  const pctValid = Number.isFinite(parsedPct) && parsedPct > 0 && parsedPct <= 100;
  const valid = parsedMc != null && parsedMc > 0 && pctValid;

  return (
    <div
      data-testid={`leverage-exit-editor-${kind}`}
      className="rounded-md border border-border/60 bg-background/40 p-2 space-y-2"
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-[74px] shrink-0 text-xs font-medium",
            isTp ? "text-success" : "text-danger",
          )}
        >
          {isTp ? "Take Profit" : "Stop Loss"}
        </span>
        <input
          type="text"
          value={mc}
          onChange={(e) => setMc(e.target.value)}
          placeholder={isTp ? "Trigger MC (e.g. 2m)" : "Trigger MC (e.g. 600k)"}
          data-testid={`input-leverage-exit-mc-${kind}`}
          className="flex-1 h-9 rounded-xl bg-background border border-border px-2.5 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-[74px] shrink-0 text-[11px] text-muted-foreground">
          Close %
        </span>
        <input
          type="number"
          min={1}
          max={100}
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          data-testid={`input-leverage-exit-percent-${kind}`}
          className="w-20 h-9 rounded-xl bg-background border border-border px-2.5 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        <span className="text-[10px] text-muted-foreground">of remaining</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            data-testid={`button-leverage-exit-editor-cancel-${kind}`}
            aria-label="Discard"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => parsedMc != null && onSubmit(parsedMc, parsedPct)}
            data-testid={`button-leverage-exit-editor-save-${kind}`}
            aria-label="Save"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/50 text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Perps history. Mobile-first: stacked expandable cards below `md` (the
 * 9-column table can never fit an iPhone without horizontal scroll), the
 * classic table on desktop. Close reason is always visible as a badge so a
 * trader can tell manual closes, TP/SL fills and liquidations apart at a
 * glance - with the trigger level in the expanded details.
 */
function LeverageHistoryTable({
  trades,
  onNavigate,
}: {
  trades: LeverageTrade[];
  onNavigate: (mint: string) => void;
}) {
  return (
    <>
      {/* Mobile: cards */}
      <div className="space-y-2 md:hidden">
        {trades.map((t) => (
          <LeverageHistoryCard key={t.id} t={t} onNavigate={onNavigate} />
        ))}
      </div>
      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Token</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2 text-right">Lev</th>
              <th className="px-3 py-2 text-right">Margin</th>
              <th className="px-3 py-2 text-right">Size</th>
              <th className="px-3 py-2 text-right">MC</th>
              <th className="px-3 py-2 text-right">P&L</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <LeverageHistoryRow key={t.id} t={t} onNavigate={onNavigate} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function historyActionLabel(t: LeverageTrade): string {
  const dir = directionLabel(t.direction);
  if (t.action === "open") return `Opened ${dir}`;
  if (t.action === "liquidated") return "Liquidated";
  return `Closed ${dir}`;
}

function historyActionColor(t: LeverageTrade): string {
  if (t.action === "liquidated") return "text-danger";
  if (t.action === "open") return "text-muted-foreground";
  return "text-foreground";
}

function ReasonBadge({ t }: { t: LeverageTrade }) {
  if (t.action === "open") return null;
  const key = t.close_reason ?? (t.action === "liquidated" ? "liquidated" : "manual");
  const badge = REASON_BADGES[key] ?? REASON_BADGES.manual;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        badge.className,
      )}
      data-testid={`perps-reason-${t.id}`}
    >
      {badge.label}
    </span>
  );
}

/** Human explanation of what made this close happen (expanded details). */
function triggerExplanation(t: LeverageTrade): string | null {
  if (t.action === "open") return null;
  const reason = t.close_reason ?? (t.action === "liquidated" ? "liquidated" : "manual");
  switch (reason) {
    case "liquidated":
      return t.trigger_mc != null
        ? `Market cap crossed the ${fmtMarketCap(t.trigger_mc)} liquidation level - position force-closed, margin lost.`
        : "Market cap crossed the liquidation level - position force-closed, margin lost.";
    case "take_profit":
      return t.trigger_mc != null
        ? `Take-profit trigger at ${fmtMarketCap(t.trigger_mc)} MC filled.`
        : "Take-profit trigger filled.";
    case "stop_loss":
      return t.trigger_mc != null
        ? `Stop-loss trigger at ${fmtMarketCap(t.trigger_mc)} MC filled.`
        : "Stop-loss trigger filled.";
    case "system_correction":
      return "Closed by the system (e.g. season reset) - margin returned, no P&L.";
    default:
      return "Closed manually.";
  }
}

/** Mobile history card: key facts visible, trigger details expandable. */
function LeverageHistoryCard({
  t,
  onNavigate,
}: {
  t: LeverageTrade;
  onNavigate: (mint: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isOpen = t.action === "open";
  const explanation = triggerExplanation(t);
  return (
    <div className="rounded-xl bg-card shadow-card p-3">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left"
        data-testid={`perps-history-card-${t.id}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="truncate text-xs font-medium hover:text-accent transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(t.token_mint);
              }}
            >
              {t.token_symbol ?? "Token"}
            </span>
            <span className={cn("shrink-0 text-[11px] font-medium", historyActionColor(t))}>
              {historyActionLabel(t)}
            </span>
            <ReasonBadge t={t} />
          </span>
          <span
            className={cn(
              "shrink-0 font-mono text-xs",
              isOpen ? "text-muted-foreground" : pnlColor(t.pnl_sol ?? 0),
            )}
          >
            {isOpen || t.pnl_sol == null ? "—" : `${fmtSol(t.pnl_sol)} SOL`}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {t.leverage}x · {fmtSol(t.margin_sol)} SOL margin
          </span>
          <span>{timeAgo(t.executed_at)}</span>
        </div>
      </button>
      {expanded && (
        <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2 text-[11px]">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <StatCell label="Size" value={`${fmtSol(t.notional_sol)} SOL`} />
            <StatCell label="MC at fill" value={fmtMarketCap(t.market_cap)} />
          </div>
          {explanation && (
            <p className="leading-relaxed text-muted-foreground">{explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}

function LeverageHistoryRow({
  t,
  onNavigate,
}: {
  t: LeverageTrade;
  onNavigate: (mint: string) => void;
}) {
  const isOpen = t.action === "open";
  return (
    <tr className="border-t border-border/60" title={triggerExplanation(t) ?? undefined}>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {timeAgo(t.executed_at)}
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={() => onNavigate(t.token_mint)}
          className="text-xs font-medium hover:text-accent transition-colors"
        >
          {t.token_symbol ?? "Token"}
        </button>
      </td>
      <td className={cn("px-3 py-2 text-xs font-medium", historyActionColor(t))}>
        {historyActionLabel(t)}
      </td>
      <td className="px-3 py-2">
        <ReasonBadge t={t} />
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">{t.leverage}x</td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {fmtSol(t.margin_sol)}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {fmtSol(t.notional_sol)}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {fmtMarketCap(t.market_cap)}
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right font-mono text-xs",
          isOpen ? "text-muted-foreground" : pnlColor(t.pnl_sol ?? 0),
        )}
      >
        {isOpen || t.pnl_sol == null ? "—" : `${fmtSol(t.pnl_sol)} SOL`}
      </td>
    </tr>
  );
}


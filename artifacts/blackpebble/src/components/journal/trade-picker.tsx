import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Sparkles } from "lucide-react";
import {
  api,
  type LeveragePosition,
  type Trade,
} from "@/lib/api";
import { useAccount } from "@/hooks/use-account";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fmtMarketCap,
  fmtSignedSol,
  pnlColor,
  shortAddr,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A normalized trade the journal can prefill from - built from real spot trade
 * history and closed perps positions. No synthetic rows: everything here maps
 * 1:1 to a persisted trade/position the user executed.
 */
export interface PickedTrade {
  source: "spot" | "leverage";
  tradeType: "spot" | "leverage";
  direction: "long" | "short";
  token: string;
  tokenMint: string;
  /** Unix seconds of the execution/close. */
  ts: number;
  /** USD market cap at entry, when known. */
  entryMc: number | null;
  /** USD market cap at exit/close, when known. */
  exitMc: number | null;
  /** Realized PnL in SOL, when known (sells and closed perps). */
  pnlSol: number | null;
  /** Return on margin/position, percent, when known. */
  roiPct: number | null;
  outcome: "win" | "loss" | "neutral" | null;
  /** Spot side (buy/sell) or perps close reason, for display. */
  detail: string;
  leverage: number | null;
}

const CLOSE_REASON_LABELS: Record<string, string> = {
  manual: "Manual close",
  take_profit: "Take profit",
  stop_loss: "Stop loss",
  liquidation: "Liquidated",
};

function outcomeFromPnl(pnl: number | null): PickedTrade["outcome"] {
  if (pnl == null) return null;
  if (pnl > 0) return "win";
  if (pnl < 0) return "loss";
  return "neutral";
}

function fromSpot(t: Trade): PickedTrade {
  const isSell = t.side === "sell";
  const mc = t.market_cap_usd ?? null;
  return {
    source: "spot",
    tradeType: "spot",
    direction: "long",
    token: t.token_symbol || t.token_name || shortAddr(t.token_mint),
    tokenMint: t.token_mint,
    ts: t.executed_at,
    // For a buy the execution MC is the entry; for a sell it's the exit.
    entryMc: isSell ? null : mc,
    exitMc: isSell ? mc : null,
    pnlSol: isSell ? (t.pnl ?? null) : null,
    roiPct: null,
    outcome: isSell ? outcomeFromPnl(t.pnl ?? null) : null,
    detail: isSell ? "Sell" : "Buy",
    leverage: null,
  };
}

function fromPerp(p: LeveragePosition): PickedTrade {
  const pnl = p.realized_pnl_sol ?? null;
  const roi =
    pnl != null && p.margin_sol > 0 ? (pnl / p.margin_sol) * 100 : null;
  return {
    source: "leverage",
    tradeType: "leverage",
    direction: p.direction === "short" ? "short" : "long",
    token: p.token_symbol || p.token_name || shortAddr(p.token_mint),
    tokenMint: p.token_mint,
    ts: p.closed_at ?? p.updated_at,
    entryMc: p.entry_market_cap,
    exitMc: p.exit_market_cap,
    pnlSol: pnl,
    roiPct: roi,
    outcome: outcomeFromPnl(pnl),
    detail:
      (p.close_reason && CLOSE_REASON_LABELS[p.close_reason]) ||
      "Closed",
    leverage: p.leverage,
  };
}

function fmtWhen(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const OUTCOME_PILL: Record<string, string> = {
  win: "bg-success/12 text-success",
  loss: "bg-destructive/12 text-destructive",
  neutral: "bg-surface-3 text-muted-foreground",
};

function TradeRow({
  trade,
  onPick,
}: {
  trade: PickedTrade;
  onPick: (t: PickedTrade) => void;
}) {
  const isShort = trade.direction === "short";
  return (
    <button
      type="button"
      onClick={() => onPick(trade)}
      className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-surface-3 transition-colors"
      data-testid={`trade-pick-${trade.source}-${trade.ts}`}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
          trade.source === "leverage"
            ? isShort
              ? "bg-destructive/12 text-destructive"
              : "bg-success/12 text-success"
            : trade.detail === "Sell"
              ? "bg-destructive/12 text-destructive"
              : "bg-success/12 text-success",
        )}
      >
        {isShort || trade.detail === "Sell" ? (
          <ArrowDownRight className="w-4 h-4" />
        ) : (
          <ArrowUpRight className="w-4 h-4" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm truncate">{trade.token}</span>
          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-surface-2 text-muted-foreground">
            {trade.tradeType === "leverage"
              ? `${trade.leverage ?? "?"}x ${trade.direction}`
              : `Spot ${trade.detail.toLowerCase()}`}
          </span>
          {trade.outcome ? (
            <span
              className={cn(
                "text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full",
                OUTCOME_PILL[trade.outcome],
              )}
            >
              {trade.outcome}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
          <span>{fmtWhen(trade.ts)}</span>
          {trade.tradeType === "leverage" && (
            <>
              <span>·</span>
              <span>{trade.detail}</span>
            </>
          )}
          {trade.entryMc != null && (
            <>
              <span>·</span>
              <span>In {fmtMarketCap(trade.entryMc)}</span>
            </>
          )}
          {trade.exitMc != null && (
            <>
              <span>·</span>
              <span>Out {fmtMarketCap(trade.exitMc)}</span>
            </>
          )}
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        {trade.pnlSol != null ? (
          <>
            <div className={cn("font-mono text-sm", pnlColor(trade.pnlSol))}>
              {fmtSignedSol(trade.pnlSol)} SOL
            </div>
            {trade.roiPct != null && (
              <div
                className={cn("font-mono text-[11px]", pnlColor(trade.roiPct))}
              >
                {trade.roiPct >= 0 ? "+" : ""}
                {trade.roiPct.toFixed(1)}%
              </div>
            )}
          </>
        ) : (
          <div className="text-[11px] text-muted-foreground">no PnL</div>
        )}
      </div>
    </button>
  );
}

type SourceFilter = "all" | "spot" | "leverage";

/**
 * "From Trade" picker: lists the user's real spot trades and closed perps
 * positions, newest first. Picking one hands a normalized PickedTrade back to
 * the journal so the editor opens prefilled.
 */
export function TradePickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (t: PickedTrade) => void;
}) {
  const { wallet } = useAccount();
  const [filter, setFilter] = useState<SourceFilter>("all");

  const spotQuery = useQuery({
    queryKey: ["journal-trade-history", wallet],
    queryFn: () => api.history(wallet!),
    enabled: open && !!wallet,
    staleTime: 30_000,
  });
  const perpsQuery = useQuery({
    queryKey: ["journal-perps-closed", wallet],
    queryFn: () => api.leverage.closed(wallet!),
    enabled: open && !!wallet,
    staleTime: 30_000,
  });

  const trades = useMemo(() => {
    const spot = (spotQuery.data?.trades ?? []).map(fromSpot);
    const perps = (perpsQuery.data?.positions ?? [])
      .filter((p) => p.status !== "open")
      .map(fromPerp);
    return [...spot, ...perps].sort((a, b) => b.ts - a.ts);
  }, [spotQuery.data, perpsQuery.data]);

  const filtered = useMemo(
    () => (filter === "all" ? trades : trades.filter((t) => t.source === filter)),
    [trades, filter],
  );

  const loading = spotQuery.isLoading || perpsQuery.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 flex flex-col max-h-[85vh] overflow-x-hidden">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            Create entry from a trade
          </DialogTitle>
          <DialogDescription>
            Pick one of your trades to prefill the journal entry - reasoning,
            emotions, and lessons stay yours to write.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-3 flex items-center gap-1.5">
          {(
            [
              { key: "all", label: "All" },
              { key: "spot", label: "Spot" },
              { key: "leverage", label: "Perps" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                filter === f.key
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
              data-testid={`trade-filter-${f.key}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto border-t border-border min-h-0">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading your trade history…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 px-6 text-center space-y-1">
              <p className="font-semibold text-sm">No trades found</p>
              <p className="text-xs text-muted-foreground">
                {filter === "all"
                  ? "Place a paper trade or perps trade first, then journal it here."
                  : "No trades match this filter."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((t) => (
                <TradeRow
                  key={`${t.source}-${t.tokenMint}-${t.ts}-${t.detail}-${t.pnlSol ?? "x"}`}
                  trade={t}
                  onPick={onPick}
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-border text-[11px] text-muted-foreground">
          Sells and closed perps carry realized PnL. Buys prefill entry data
          only. Showing {filtered.length} trade
          {filtered.length === 1 ? "" : "s"} from your current season.
        </div>
      </DialogContent>
    </Dialog>
  );
}

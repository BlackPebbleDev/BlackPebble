import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import type { Trade } from "@/lib/api";
import {
  fmtSol,
  fmtTokenAmount,
  fmtPrice,
  pnlColor,
  shortAddr,
  timeAgo,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Detailed, stacked trade entries used by both "Recent Paper Trades" and the
 * History tab. Each entry is a self-contained card that wraps instead of
 * scrolling sideways, so it reads cleanly on mobile and desktop alike.
 *
 * Buy rows are green, sell rows red. Price / slippage / pnl come from the
 * audit columns recorded at execution and degrade gracefully when an older
 * trade predates them.
 */
export function TradeList({
  trades,
  empty,
  compact = false,
  onNavigate,
  limit,
  showExpand,
  expanded,
  onExpandChange,
}: {
  trades: Trade[];
  empty: string;
  compact?: boolean;
  /** When provided, each row is tappable and navigates to that token's mint. */
  onNavigate?: (mint: string) => void;
  /** When set with showExpand, only this many trades are shown by default. */
  limit?: number;
  /** When true and trades exceed limit, an expand/collapse toggle is shown. */
  showExpand?: boolean;
  /** Optional external control of expanded state. If omitted, internal state is used. */
  expanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = expanded ?? internalExpanded;
  const doExpand = (v: boolean) => {
    setInternalExpanded(v);
    onExpandChange?.(v);
  };

  if (trades.length === 0) {
    return empty ? (
      <div className="px-4 py-8 text-center text-muted-foreground text-sm">
        {empty}
      </div>
    ) : null;
  }

  const hasLimit = showExpand && limit != null && limit > 0;
  const showAll = !hasLimit || isExpanded;
  const visibleTrades = showAll ? trades : trades.slice(0, limit);
  const canExpand = hasLimit && trades.length > limit;

  return (
    <div>
      <div className="divide-y divide-border/50">
        {visibleTrades.map((t) => (
          <TradeRow key={t.id} t={t} compact={compact} onNavigate={onNavigate} />
        ))}
      </div>
      {canExpand && (
        <button
          type="button"
          onClick={() => doExpand(!isExpanded)}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors border-t border-border/50"
          data-testid={isExpanded ? "button-show-less" : "button-view-all-trades"}
        >
          {isExpanded ? (
            <>
              Show less <ChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              View all trades <ChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

function TradeRow({
  t,
  compact,
  onNavigate,
}: {
  t: Trade;
  compact: boolean;
  onNavigate?: (mint: string) => void;
}) {
  const isBuy = t.side === "buy";
  const sym = t.token_symbol ?? shortAddr(t.token_mint);
  const price = t.effective_price_usd ?? t.raw_price_usd ?? null;
  const slippage = t.slippage_percent;

  return (
    <div
      className={cn(
        compact ? "px-3 py-2.5" : "px-4 py-3",
        onNavigate && "cursor-pointer hover:bg-accent/5 transition-colors",
      )}
      onClick={onNavigate ? () => onNavigate(t.token_mint) : undefined}
      data-testid={`trade-row-${t.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium min-w-0",
            isBuy ? "text-emerald-400" : "text-red-400",
          )}
        >
          {isBuy ? (
            <ArrowUpRight className="w-4 h-4 shrink-0" />
          ) : (
            <ArrowDownRight className="w-4 h-4 shrink-0" />
          )}
          <span className="shrink-0">{isBuy ? "Bought" : "Sold"}</span>
          <span className="text-foreground truncate">{sym}</span>
          {!isBuy && (t.source === "take_profit" || t.source === "stop_loss") && (
            <span
              data-testid={`trade-source-${t.id}`}
              className={cn(
                "shrink-0 px-1.5 py-0.5 text-[9px] uppercase tracking-wider border",
                t.source === "take_profit"
                  ? "border-emerald-500/40 text-emerald-400"
                  : "border-red-500/40 text-red-400",
              )}
            >
              {t.source === "take_profit" ? "TP" : "SL"}
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {timeAgo(t.executed_at)}
        </span>
      </div>

      <div className="mt-1 font-mono text-xs text-foreground/90 break-words">
        {isBuy
          ? `${fmtSol(t.sol_amount)} SOL → ${fmtTokenAmount(t.token_amount)} ${sym}`
          : `${fmtTokenAmount(t.token_amount)} ${sym} → ${fmtSol(t.sol_amount)} SOL`}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono text-muted-foreground">
        {price != null && <span>Price: {fmtPrice(price)}</span>}
        {!isBuy && t.pnl != null && (
          <span className={pnlColor(t.pnl)}>
            PnL: {t.pnl >= 0 ? "+" : ""}
            {fmtSol(t.pnl)} SOL
          </span>
        )}
        {slippage != null && <span>Slippage: {slippage.toFixed(2)}%</span>}
      </div>
    </div>
  );
}

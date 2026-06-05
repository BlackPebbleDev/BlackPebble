import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink } from "lucide-react";
import { api, type Position, type Trade } from "@/lib/api";
import { useAccount } from "@/hooks/use-account";
import {
  fmtSol,
  fmtPrice,
  fmtPercent,
  fmtTokenAmount,
  pnlColor,
  shortAddr,
  timeAgo,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { TradeList } from "./trade-list";

/**
 * Open positions, rendered as stacked cards on mobile (no horizontal scroll)
 * and a table on desktop. Each position is tappable to reveal full details and
 * the per-token trade history (including slippage paid on entry).
 *
 * The full trade history is fetched lazily — only once the first row is
 * expanded — so the list stays cheap when nobody drills in.
 */
export function OpenPositions({
  positions,
  solUsd,
  empty,
  onNavigate,
}: {
  positions: Position[];
  solUsd: number;
  empty: string;
  onNavigate: (mint: string) => void;
}) {
  const { wallet } = useAccount();
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: histData } = useQuery({
    queryKey: ["history", wallet],
    queryFn: () => api.history(wallet!),
    enabled: !!wallet && expanded != null,
  });
  const allTrades = histData?.trades ?? [];
  const tradesFor = (mint: string) =>
    allTrades.filter((t: Trade) => t.token_mint === mint);

  if (positions.length === 0) {
    return (
      <div className="border border-border bg-card text-center py-12 text-muted-foreground text-sm">
        {empty}
      </div>
    );
  }

  const toggle = (id: number) => setExpanded((cur) => (cur === id ? null : id));

  return (
    <>
      {/* Mobile: stacked cards */}
      <div className="md:hidden space-y-3">
        {positions.map((p) => (
          <PositionCard
            key={p.id}
            p={p}
            solUsd={solUsd}
            open={expanded === p.id}
            onToggle={() => toggle(p.id)}
            trades={tradesFor(p.token_mint)}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {/* Desktop: table with expandable detail rows */}
      <div className="hidden md:block border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="font-medium px-4 py-3">Token</th>
              <th className="font-medium px-4 py-3 text-right">Value</th>
              <th className="font-medium px-4 py-3 text-right">Cost</th>
              <th className="font-medium px-4 py-3 text-right">Avg Entry</th>
              <th className="font-medium px-4 py-3 text-right">Current</th>
              <th className="font-medium px-4 py-3 text-right">P&L</th>
              <th className="font-medium px-4 py-3 text-right">%</th>
              <th className="font-medium px-2 py-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const avgEntryUsd = p.avg_entry_price * solUsd;
              const currentUsd =
                p.currentPriceSol != null ? p.currentPriceSol * solUsd : null;
              const open = expanded === p.id;
              return (
                <PositionTableRow
                  key={p.id}
                  p={p}
                  open={open}
                  onToggle={() => toggle(p.id)}
                  avgEntryUsd={avgEntryUsd}
                  currentUsd={currentUsd}
                  solUsd={solUsd}
                  trades={tradesFor(p.token_mint)}
                  onNavigate={onNavigate}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PositionTableRow({
  p,
  open,
  onToggle,
  avgEntryUsd,
  currentUsd,
  solUsd,
  trades,
  onNavigate,
}: {
  p: Position;
  open: boolean;
  onToggle: () => void;
  avgEntryUsd: number;
  currentUsd: number | null;
  solUsd: number;
  trades: Trade[];
  onNavigate: (mint: string) => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        data-testid={`row-position-${p.token_mint}`}
        className={cn(
          "border-b border-border/50 hover:bg-accent/5 cursor-pointer transition-colors",
          open && "bg-accent/5",
        )}
      >
        <td className="px-4 py-3">
          <div className="text-foreground font-medium">
            {p.token_symbol ?? shortAddr(p.token_mint)}
          </div>
          {p.token_name && (
            <div className="text-xs text-muted-foreground">{p.token_name}</div>
          )}
        </td>
        <td className="px-4 py-3 text-right font-mono">
          {fmtSol(p.currentValueSol)}
        </td>
        <td className="px-4 py-3 text-right font-mono">
          {fmtSol(p.total_sol_spent)}
        </td>
        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
          {fmtPrice(avgEntryUsd)}
        </td>
        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
          {currentUsd != null ? fmtPrice(currentUsd) : "—"}
        </td>
        <td className={cn("px-4 py-3 text-right font-mono", pnlColor(p.unrealizedPnlSol))}>
          {fmtSol(p.unrealizedPnlSol)}
        </td>
        <td className={cn("px-4 py-3 text-right font-mono", pnlColor(p.unrealizedPnlPercent))}>
          {fmtPercent(p.unrealizedPnlPercent)}
        </td>
        <td className="px-2 py-3 text-muted-foreground">
          <ChevronDown
            className={cn("w-4 h-4 transition-transform", open && "rotate-180")}
          />
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border/50 bg-background/40">
          <td colSpan={8} className="px-4 py-4">
            <PositionDetails
              p={p}
              avgEntryUsd={avgEntryUsd}
              currentUsd={currentUsd}
              trades={trades}
              onNavigate={onNavigate}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function PositionCard({
  p,
  solUsd,
  open,
  onToggle,
  trades,
  onNavigate,
}: {
  p: Position;
  solUsd: number;
  open: boolean;
  onToggle: () => void;
  trades: Trade[];
  onNavigate: (mint: string) => void;
}) {
  const avgEntryUsd = p.avg_entry_price * solUsd;
  const currentUsd =
    p.currentPriceSol != null ? p.currentPriceSol * solUsd : null;

  return (
    <div className="border border-border bg-card" data-testid={`card-position-${p.token_mint}`}>
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex flex-col gap-2"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">
              {p.token_symbol ?? shortAddr(p.token_mint)}
            </div>
            {p.token_name && (
              <div className="text-xs text-muted-foreground truncate">
                {p.token_name}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <div className={cn("font-mono text-sm", pnlColor(p.unrealizedPnlSol))}>
                {fmtSol(p.unrealizedPnlSol)} SOL
              </div>
              <div className={cn("font-mono text-xs", pnlColor(p.unrealizedPnlPercent))}>
                {fmtPercent(p.unrealizedPnlPercent)}
              </div>
            </div>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <Field label="Quantity" value={fmtTokenAmount(p.total_tokens)} />
          <Field label="Value" value={`${fmtSol(p.currentValueSol)} SOL`} />
          <Field label="Cost" value={`${fmtSol(p.total_sol_spent)} SOL`} />
          <Field label="Avg Entry" value={fmtPrice(avgEntryUsd)} />
          <Field
            label="Current"
            value={currentUsd != null ? fmtPrice(currentUsd) : "—"}
          />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border/60">
          <PositionDetails
            p={p}
            avgEntryUsd={avgEntryUsd}
            currentUsd={currentUsd}
            trades={trades}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
}

function PositionDetails({
  p,
  avgEntryUsd,
  currentUsd,
  trades,
  onNavigate,
}: {
  p: Position;
  avgEntryUsd: number;
  currentUsd: number | null;
  trades: Trade[];
  onNavigate: (mint: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Field label="Opened" value={timeAgo(p.opened_at) || "—"} />
        <Field
          label="Quantity"
          value={`${fmtTokenAmount(p.total_tokens)} ${p.token_symbol ?? ""}`.trim()}
        />
        <Field label="Avg entry" value={fmtPrice(avgEntryUsd)} />
        <Field
          label="Current price"
          value={currentUsd != null ? fmtPrice(currentUsd) : "—"}
        />
        <Field label="Position value" value={`${fmtSol(p.currentValueSol)} SOL`} />
        <Field label="Cost basis" value={`${fmtSol(p.total_sol_spent)} SOL`} />
        <Field
          label="Unrealized P&L"
          value={`${fmtSol(p.unrealizedPnlSol)} SOL (${fmtPercent(p.unrealizedPnlPercent)})`}
          cls={pnlColor(p.unrealizedPnlSol)}
        />
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Trade history
        </div>
        {trades.length > 0 ? (
          <div className="border border-border/60 bg-card">
            <TradeList trades={trades} empty="" compact />
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            No trades recorded for this token yet.
          </div>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onNavigate(p.token_mint);
        }}
        data-testid={`button-open-${p.token_mint}`}
        className="flex items-center gap-1.5 text-xs text-accent hover:underline"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Open trading desk
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  cls,
}: {
  label: string;
  value: string;
  cls?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-foreground", cls)}>{value}</span>
    </div>
  );
}

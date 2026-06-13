import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronDown, ArrowRight, BarChart3 } from "lucide-react";
import { type Position } from "@/lib/api";
import { PnlAmount } from "@/components/pnl-amount";
import { PositionOrders } from "@/components/position-orders";
import {
  fmtSol,
  fmtPrice,
  fmtPercent,
  fmtTokenAmount,
  fmtMarketCap,
  fmtMultiple,
  fmtHoldTime,
  pnlColor,
  shortAddr,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Open positions as a 3-level information hierarchy so a trader can scan many
 * positions without endless scrolling:
 *
 *  L1 — collapsed card / table row: the at-a-glance signals
 *       (Token, Unrealized P&L, ROI%, Entry MC, Current MC, MC Multiple).
 *  L2 — expanded: the trader-focused grid (the L1 set plus Position Value,
 *       Cost Basis, Hold Time, Quantity) and quick actions.
 *  L3 — the dedicated /position/:mint page (full Market Cap + Position
 *       Analytics and the complete Trade History). Linked from L2.
 *
 * Nothing is removed by the collapse — every field remains reachable in L2/L3.
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
  const [expanded, setExpanded] = useState<number | null>(null);

  if (positions.length === 0) {
    return (
      <div className="rounded-xl bg-card shadow-card text-center py-12 text-muted-foreground text-sm">
        {empty}
      </div>
    );
  }

  const toggle = (id: number) => setExpanded((cur) => (cur === id ? null : id));

  return (
    <>
      {/* Mobile: stacked cards */}
      <div className="md:hidden space-y-2">
        {positions.map((p) => (
          <PositionCard
            key={p.id}
            p={p}
            solUsd={solUsd}
            open={expanded === p.id}
            onToggle={() => toggle(p.id)}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {/* Desktop: table with expandable detail rows */}
      <div className="hidden md:block rounded-2xl bg-card shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="font-medium px-4 py-3">Token</th>
              <th className="font-medium px-4 py-3 text-right">Entry MC</th>
              <th className="font-medium px-4 py-3 text-right">Current MC</th>
              <th className="font-medium px-4 py-3 text-right">MC ×</th>
              <th className="font-medium px-4 py-3 text-right">Value</th>
              <th className="font-medium px-4 py-3 text-right">ROI</th>
              <th className="font-medium px-4 py-3 text-right">Unrealized P&L</th>
              <th className="font-medium px-2 py-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <PositionTableRow
                key={p.id}
                p={p}
                solUsd={solUsd}
                open={expanded === p.id}
                onToggle={() => toggle(p.id)}
                onNavigate={onNavigate}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function mcMultipleOf(p: Position): number | null {
  if (
    p.entry_market_cap != null &&
    p.entry_market_cap > 0 &&
    p.currentMarketCapUsd != null
  ) {
    return p.currentMarketCapUsd / p.entry_market_cap;
  }
  return null;
}

function PositionTableRow({
  p,
  solUsd,
  open,
  onToggle,
  onNavigate,
}: {
  p: Position;
  solUsd: number;
  open: boolean;
  onToggle: () => void;
  onNavigate: (mint: string) => void;
}) {
  const mult = mcMultipleOf(p);
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(p.token_mint);
            }}
            data-testid={`token-link-${p.token_mint}`}
            className="text-left group"
          >
            <div className="text-foreground font-medium group-hover:text-accent group-hover:underline">
              {p.token_symbol ?? shortAddr(p.token_mint)}
            </div>
            {p.token_name && (
              <div className="text-xs text-muted-foreground">{p.token_name}</div>
            )}
          </button>
        </td>
        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
          {fmtMarketCap(p.entry_market_cap)}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="font-mono text-foreground">
            {fmtMarketCap(p.currentMarketCapUsd)}
          </div>
          <div className="text-xs">
            <McChange pct={p.marketCapChangePercent} />
          </div>
        </td>
        <td
          className={cn(
            "px-4 py-3 text-right font-mono",
            pnlColor(mult != null ? mult - 1 : null),
          )}
        >
          {fmtMultiple(mult)}
        </td>
        <td className="px-4 py-3 text-right font-mono">
          {fmtSol(p.currentValueSol)}
        </td>
        <td
          className={cn(
            "px-4 py-3 text-right font-mono",
            pnlColor(p.unrealizedPnlPercent),
          )}
        >
          {fmtPercent(p.unrealizedPnlPercent)}
        </td>
        <td
          className={cn(
            "px-4 py-3 text-right font-mono",
            pnlColor(p.unrealizedPnlSol),
          )}
        >
          <PnlAmount sol={p.unrealizedPnlSol} solUsd={solUsd} unit={false} />
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
            <ExpandedAnalytics p={p} solUsd={solUsd} onNavigate={onNavigate} />
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
  onNavigate,
}: {
  p: Position;
  solUsd: number;
  open: boolean;
  onToggle: () => void;
  onNavigate: (mint: string) => void;
}) {
  const mult = mcMultipleOf(p);
  return (
    <div
      className="rounded-xl bg-card shadow-card overflow-hidden"
      data-testid={`card-position-${p.token_mint}`}
    >
      {/* L1 header: tap anywhere to expand/collapse. Token + Unrealized P&L /
          ROI% + chevron. Navigation moves into the expanded "Continue Trading". */}
      <button
        type="button"
        onClick={onToggle}
        data-testid={`toggle-position-${p.token_mint}`}
        aria-expanded={open}
        aria-label={open ? "Collapse position" : "Expand position"}
        className="flex w-full items-stretch text-left"
      >
        <div className="min-w-0 flex-1 px-4 py-2.5">
          <div className="font-medium text-foreground truncate">
            {p.token_symbol ?? shortAddr(p.token_mint)}
          </div>
          {p.token_name && (
            <div className="text-xs text-muted-foreground truncate">
              {p.token_name}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5">
          <div className="text-right">
            <div className={cn("font-mono text-sm", pnlColor(p.unrealizedPnlSol))}>
              <PnlAmount sol={p.unrealizedPnlSol} solUsd={solUsd} />
            </div>
            <div
              className={cn(
                "font-mono text-xs",
                pnlColor(p.unrealizedPnlPercent),
              )}
            >
              {fmtPercent(p.unrealizedPnlPercent)}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform shrink-0",
              open && "rotate-180",
            )}
          />
        </div>
      </button>

      {/* L1 market-cap strip: Entry MC · Current MC · MC Multiple (also taps to expand). */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={open ? "Collapse position" : "Expand position"}
        className="w-full text-left px-4 pb-3"
      >
        <div className="grid grid-cols-3 rounded-xl bg-surface-1 overflow-hidden divide-x divide-border/60">
          <McCell label="Entry MC" value={fmtMarketCap(p.entry_market_cap)} />
          <McCell
            label="Current MC"
            value={fmtMarketCap(p.currentMarketCapUsd)}
            extra={<McChange pct={p.marketCapChangePercent} small />}
          />
          <McCell
            label="MC ×"
            value={fmtMultiple(mult)}
            valueClass={pnlColor(mult != null ? mult - 1 : null)}
          />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border/60">
          <ExpandedAnalytics p={p} solUsd={solUsd} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
}

function McCell({
  label,
  value,
  extra,
  valueClass,
}: {
  label: string;
  value: string;
  extra?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-0.5 font-mono text-sm font-semibold text-foreground", valueClass)}>
        {value}
      </div>
      {extra && <div className="text-[10px]">{extra}</div>}
    </div>
  );
}

/**
 * Level 2 — the trader-focused expanded grid. Mirrors the spec field set and
 * links to the full Level-3 analytics page (where the complete trade history
 * lives). No analytics are dropped here; they move one tap deeper.
 */
function ExpandedAnalytics({
  p,
  solUsd,
  onNavigate,
}: {
  p: Position;
  solUsd: number;
  onNavigate: (mint: string) => void;
}) {
  const [, navigate] = useLocation();
  const mult = mcMultipleOf(p);
  const avgEntryUsd = p.avg_entry_price * solUsd;
  const currentUsd =
    p.currentPriceSol != null ? p.currentPriceSol * solUsd : null;

  return (
    <div className="pt-3 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
        <Field label="Entry MC" value={fmtMarketCap(p.entry_market_cap)} />
        <Field label="Current MC" value={fmtMarketCap(p.currentMarketCapUsd)} />
        <Field
          label="MC Multiple"
          value={fmtMultiple(mult)}
          cls={pnlColor(mult != null ? mult - 1 : null)}
        />
        <Field
          label="Position Value"
          value={`${fmtSol(p.currentValueSol)} SOL`}
        />
        <Field label="Cost Basis" value={`${fmtSol(p.total_sol_spent)} SOL`} />
        <Field
          label="ROI"
          value={fmtPercent(p.unrealizedPnlPercent)}
          cls={pnlColor(p.unrealizedPnlPercent)}
        />
        <Field
          label="P&L (Market)"
          value={<PnlAmount sol={p.unrealizedPnlMarketSol} solUsd={solUsd} />}
          cls={pnlColor(p.unrealizedPnlMarketSol)}
        />
        <Field
          label="Trading Costs"
          value={<PnlAmount sol={p.tradingCostsSol} solUsd={solUsd} />}
          cls={pnlColor(p.tradingCostsSol)}
        />
        <Field
          label="Net Result"
          value={<PnlAmount sol={p.netResultSol} solUsd={solUsd} />}
          cls={pnlColor(p.netResultSol)}
        />
        <Field label="Hold Time" value={fmtHoldTime(p.opened_at)} />
        <Field label="Quantity" value={fmtTokenAmount(p.total_tokens)} />
      </div>

      <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
        P&amp;L (Market) is pure price movement vs. the mid-price cost basis.
        Trading Costs is the slippage paid entering this position. Net Result =
        Market + Costs and is your true unrealized P&amp;L.
      </p>

      <div className="text-[11px] font-mono text-muted-foreground">
        Avg entry {fmtPrice(avgEntryUsd)} · Current{" "}
        {currentUsd != null ? fmtPrice(currentUsd) : "—"}
      </div>

      <PositionOrders mint={p.token_mint} />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/position/${p.token_mint}`);
          }}
          data-testid={`button-detail-${p.token_mint}`}
          className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium rounded-xl border border-accent/50 text-accent hover:bg-accent/10 transition-colors"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          View Full Detail
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(p.token_mint);
          }}
          data-testid={`button-open-${p.token_mint}`}
          className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium rounded-xl border border-border text-foreground hover:bg-secondary transition-colors"
        >
          Continue Trading
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Inline ▲/▼ change badge for market-cap movement since entry. */
function McChange({ pct, small }: { pct: number | null; small?: boolean }) {
  if (pct == null || !Number.isFinite(pct)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "•";
  return (
    <span className={cn("font-mono", small && "text-[10px]", pnlColor(pct))}>
      {arrow} {fmtPercent(pct)}
    </span>
  );
}

function Field({
  label,
  value,
  cls,
}: {
  label: string;
  value: React.ReactNode;
  cls?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-foreground", cls)}>{value}</span>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ArrowRight } from "lucide-react";
import { api, type Position, type Trade } from "@/lib/api";
import { useAccount } from "@/hooks/use-account";
import {
  fmtSol,
  fmtPrice,
  fmtPercent,
  fmtTokenAmount,
  fmtMarketCap,
  pnlColor,
  shortAddr,
  timeAgo,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { TradeList } from "./trade-list";

/**
 * Open positions, rendered as stacked cards on mobile (no horizontal scroll)
 * and a table on desktop. The token name navigates straight to the trading desk
 * for that mint; the chevron (and the rest of the row) expands the drilldown.
 *
 * The expanded drilldown is split into three labelled sections — Position
 * Analytics, Trade History, Actions — and the per-token trade history is fetched
 * lazily, only once the first row is expanded.
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
      <div className="md:hidden space-y-2">
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
              <th className="font-medium px-4 py-3 text-right">Market Cap</th>
              <th className="font-medium px-4 py-3 text-right">Qty</th>
              <th className="font-medium px-4 py-3 text-right">Value</th>
              <th className="font-medium px-4 py-3 text-right">Cost</th>
              <th className="font-medium px-4 py-3 text-right">Avg Entry</th>
              <th className="font-medium px-4 py-3 text-right">Current</th>
              <th className="font-medium px-4 py-3 text-right">P&L</th>
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
  trades,
  onNavigate,
}: {
  p: Position;
  open: boolean;
  onToggle: () => void;
  avgEntryUsd: number;
  currentUsd: number | null;
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
        <td className="px-4 py-3 text-right">
          <div className="font-mono text-foreground">
            {fmtMarketCap(p.currentMarketCapUsd)}
          </div>
          <div className="text-xs">
            <McChange pct={p.marketCapChangePercent} />
          </div>
        </td>
        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
          {fmtTokenAmount(p.total_tokens)}
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
          <div>{fmtSol(p.unrealizedPnlSol)}</div>
          <div className="text-xs">{fmtPercent(p.unrealizedPnlPercent)}</div>
        </td>
        <td className="px-2 py-3 text-muted-foreground">
          <ChevronDown
            className={cn("w-4 h-4 transition-transform", open && "rotate-180")}
          />
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border/50 bg-background/40">
          <td colSpan={9} className="px-4 py-4">
            <PositionDetails
              p={p}
              avgEntryUsd={avgEntryUsd}
              currentUsd={currentUsd}
              trades={trades}
              onNavigate={onNavigate}
              variant="table"
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
      {/* Header row: token (navigates) + PnL + chevron (toggles). Kept as a
          flex row of buttons so the token link and the expand toggle are
          independent tap targets. */}
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => onNavigate(p.token_mint)}
          data-testid={`token-link-${p.token_mint}`}
          className="min-w-0 flex-1 text-left px-4 py-2.5"
        >
          <div className="font-medium text-foreground truncate hover:text-accent">
            {p.token_symbol ?? shortAddr(p.token_mint)}
          </div>
          {p.token_name && (
            <div className="text-xs text-muted-foreground truncate">
              {p.token_name}
            </div>
          )}
        </button>
        <button
          type="button"
          onClick={onToggle}
          data-testid={`toggle-position-${p.token_mint}`}
          aria-label={open ? "Collapse position" : "Expand position"}
          className="flex items-center gap-2 px-4 py-2.5"
        >
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
              "w-4 h-4 text-muted-foreground transition-transform shrink-0",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      {/* Market cap is the headline metric for a memecoin position. The
          collapsed card deliberately shows only the MC block + P&L (in the
          header) — all the granular fields live in the expanded Position
          Analytics so nothing is duplicated. */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 pb-3"
      >
        <div className="border border-border/60 bg-background/40 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Market Cap
            </span>
            <McChange pct={p.marketCapChangePercent} />
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-lg font-semibold text-foreground">
              {fmtMarketCap(p.currentMarketCapUsd)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Entry {fmtMarketCap(p.entry_market_cap)}
            </span>
          </div>
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
            variant="card"
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
  variant,
}: {
  p: Position;
  avgEntryUsd: number;
  currentUsd: number | null;
  trades: Trade[];
  onNavigate: (mint: string) => void;
  /**
   * "card" (mobile): the collapsed view shows Market Cap + P&L (P&L lives in
   * the header), so the analytics grid carries every other field and never
   * repeats P&L. "table" (desktop): the row already shows
   * qty/value/cost/avg/current/P&L/MC, so the grid only adds the fields the row
   * omits (entry MC, opened). Either way, no field is repeated.
   */
  variant: "card" | "table";
}) {
  return (
    <div className="space-y-4 pt-3">
      {/* Position Analytics */}
      <Section title="Position Analytics">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          {variant === "card" ? (
            <>
              <Field label="Quantity" value={fmtTokenAmount(p.total_tokens)} />
              <Field label="Avg entry" value={fmtPrice(avgEntryUsd)} />
              <Field
                label="Current price"
                value={currentUsd != null ? fmtPrice(currentUsd) : "—"}
              />
              <Field label="Cost basis" value={`${fmtSol(p.total_sol_spent)} SOL`} />
              <Field
                label="Position value"
                value={`${fmtSol(p.currentValueSol)} SOL`}
              />
              <Field label="Opened" value={timeAgo(p.opened_at) || "—"} />
            </>
          ) : (
            <>
              <Field
                label="Entry market cap"
                value={fmtMarketCap(p.entry_market_cap)}
              />
              <Field label="Opened" value={timeAgo(p.opened_at) || "—"} />
            </>
          )}
        </div>
      </Section>

      {/* Trade History */}
      <Section title="Trade History">
        {trades.length > 0 ? (
          <div className="border border-border/60 bg-card">
            <TradeList trades={trades} empty="" compact />
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            No trades recorded for this token yet.
          </div>
        )}
      </Section>

      {/* Actions */}
      <Section title="Actions">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(p.token_mint);
          }}
          data-testid={`button-open-${p.token_mint}`}
          className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium border border-accent/50 text-accent hover:bg-accent/10 transition-colors"
        >
          Continue Trading
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}

/** Inline ▲/▼ change badge for market-cap movement since entry. */
function McChange({ pct }: { pct: number | null }) {
  if (pct == null || !Number.isFinite(pct)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "•";
  return (
    <span className={cn("font-mono", pnlColor(pct))}>
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

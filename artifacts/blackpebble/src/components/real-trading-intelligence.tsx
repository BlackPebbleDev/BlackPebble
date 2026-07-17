/**
 * Phase 2B intelligence sections — Historical Risk, Report Coverage, and
 * Current Holdings Quality. Kept in a separate module so the main analysis
 * component does not grow into an unmaintainable monolith. These consume only
 * shared primitives (api types, formatters, MetricTile) and never read raw
 * open positions — current-holdings data comes solely from the reconciled
 * `holdingsQuality` snapshot the backend produced.
 */

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Info } from "lucide-react";
import type {
  RealAnalysisSummary,
  RealHistoricalRisk,
  RealReportCoverage,
  RealHoldingsQuality,
  RealHoldingQuality,
  RealPositionClass,
} from "@/lib/api";
import { fmtNum, fmtSignedSolMag, fmtSolMag, pnlColor } from "@/lib/format";
import { MetricTile, type MetricTone } from "@/components/metric-tile";
import { cn } from "@/lib/utils";

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-0.5">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {description && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

function fmtDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "—";
  const d = Math.floor(sec / 86400);
  if (d >= 1) return `${d}d`;
  const h = Math.floor(sec / 3600);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(sec / 60);
  if (m >= 1) return `${m}m`;
  return `${Math.round(sec)}s`;
}

function shortMint(mint: string): string {
  return mint.length > 10 ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : mint;
}

// ── Historical Risk Intelligence (Part 4) ────────────────────────────────────

const RISK_TIER_LABEL: Record<string, string> = {
  controlled: "Controlled",
  moderate: "Moderate",
  aggressive: "Aggressive",
  highly_volatile: "Highly volatile",
  insufficient: "Insufficient data",
};

const RISK_TIER_TONE: Record<string, string> = {
  controlled: "bg-success/10 text-success",
  moderate: "bg-accent/10 text-accent",
  aggressive: "bg-amber-500/10 text-warning",
  highly_volatile: "bg-danger/10 text-danger",
  insufficient: "bg-surface-3 text-muted-foreground",
};

export function HistoricalRiskSection({
  analysis,
}: {
  analysis: RealAnalysisSummary;
}) {
  const r: RealHistoricalRisk | null | undefined = analysis.historicalRisk;
  if (!r) return null;

  const insufficient = r.profileTier === "insufficient";

  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <SectionHeader
          title="Historical Risk Intelligence"
          description="How you've historically taken and recovered from risk. Reconstructed from completed trades, historical rather than your live wallet."
        />
        <span
          className={cn(
            "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0",
            RISK_TIER_TONE[r.profileTier] ?? "bg-surface-3 text-muted-foreground",
          )}
        >
          {RISK_TIER_LABEL[r.profileTier] ?? r.profileTier}
        </span>
      </div>

      {insufficient ? (
        <p className="rounded-xl bg-surface-2 border border-white/[0.05] px-4 py-3 text-xs text-muted-foreground leading-relaxed">
          Not enough completed round trips to assess historical risk reliably yet
          ({r.sampleSize} analyzed). These metrics appear once you have more
          closed trades.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            <MetricTile
              label="Profit Factor"
              value={r.profitFactor != null ? r.profitFactor.toFixed(2) : "—"}
              tone={
                r.profitFactor == null
                  ? "default"
                  : r.profitFactor >= 1.5
                    ? "positive"
                    : r.profitFactor >= 1
                      ? "default"
                      : "negative"
              }
              hint="Gross realized gains ÷ gross realized losses. Above 1 means profitable overall."
            />
            <MetricTile
              label="Expectancy / Trade"
              value={`${fmtSignedSolMag(r.expectancySol)} SOL`}
              tone={
                r.expectancySol > 0
                  ? "positive"
                  : r.expectancySol < 0
                    ? "negative"
                    : "default"
              }
              hint="Average realized P&L per completed round trip."
            />
            <MetricTile
              label="Payoff Ratio"
              value={r.payoffRatio != null ? r.payoffRatio.toFixed(2) : "—"}
              hint="Average win size ÷ average loss size."
            />
            <MetricTile
              label="Max Drawdown"
              value={`${fmtSolMag(r.maxDrawdownSol)} SOL`}
              tone={r.maxDrawdownSol > 0 ? "warning" : "default"}
              hint={
                r.maxDrawdownPercent != null
                  ? `Deepest peak-to-trough dip in realized equity (~${Math.round(r.maxDrawdownPercent)}% off peak).`
                  : "Deepest peak-to-trough dip in realized equity."
              }
            />
            <MetricTile
              label="Current Drawdown"
              value={`${fmtSolMag(r.currentDrawdownSol)} SOL`}
              tone={r.currentDrawdownSol > 0 ? "warning" : "positive"}
              hint="How far realized equity currently sits below its all-time high."
            />
            <MetricTile
              label="Median Recovery"
              value={fmtDuration(r.medianRecoverySec)}
              hint="Typical time to climb back to a new high after a drawdown."
            />
            <MetricTile
              label="Max Loss Streak"
              value={r.maxConsecutiveLosses}
              tone={r.maxConsecutiveLosses >= 5 ? "warning" : "default"}
              hint="Longest run of consecutive losing round trips."
            />
            <MetricTile
              label="Max Win Streak"
              value={r.maxConsecutiveWins}
              tone="positive"
              hint="Longest run of consecutive winning round trips."
            />
            <MetricTile
              label="Result Volatility"
              value={`${fmtSolMag(r.resultVolatilitySol)} SOL`}
              hint="Standard deviation of per-trade P&L. Higher means wider swings."
            />
            <MetricTile
              label="Worst-3 Loss Share"
              value={`${Math.round(r.tailLossConcentration * 100)}%`}
              tone={r.tailLossConcentration > 0.7 ? "warning" : "default"}
              hint="Share of all realized losses concentrated in your worst three trades."
            />
            <MetricTile
              label="Best-3 Gain Share"
              value={`${Math.round(r.tailGainConcentration * 100)}%`}
              hint="Share of all realized gains concentrated in your best three trades."
            />
            <MetricTile
              label="Drawdowns"
              value={r.drawdownCount}
              hint="Number of realized-equity drawdown episodes detected."
            />
          </div>
          {r.limitations.length > 0 && (
            <ul className="space-y-1">
              {r.limitations.map((l) => (
                <li
                  key={l}
                  className="text-[11px] text-muted-foreground/80 leading-relaxed flex items-start gap-1.5"
                >
                  <Info className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground/60" />
                  {l}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

// ── Report Coverage & Confidence (Part 15) ───────────────────────────────────

const COVERAGE_LABEL: Record<string, string> = {
  high: "High coverage",
  moderate: "Moderate coverage",
  limited: "Limited coverage",
  insufficient: "Insufficient data",
};

const COVERAGE_TONE: Record<string, string> = {
  high: "bg-success/10 text-success border-success/20",
  moderate: "bg-accent/10 text-accent border-accent/20",
  limited: "bg-amber-500/10 text-warning border-amber-500/20",
  insufficient: "bg-surface-3 text-muted-foreground border-white/[0.06]",
};

export function CoverageBanner({
  analysis,
}: {
  analysis: RealAnalysisSummary;
}) {
  const c: RealReportCoverage | null | undefined = analysis.coverage;
  const [open, setOpen] = useState(false);
  if (!c) return null;

  const dateRange =
    c.firstTradeAt != null && c.lastTradeAt != null
      ? `${new Date(c.firstTradeAt * 1000).toLocaleDateString("en-US", { month: "short", year: "2-digit" })} – ${new Date(c.lastTradeAt * 1000).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}`
      : "—";

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 sm:p-5 space-y-3",
        COVERAGE_TONE[c.tier] ?? COVERAGE_TONE.insufficient,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/20 shrink-0">
            {COVERAGE_LABEL[c.tier] ?? c.tier}
          </span>
          <span className="text-xs text-foreground/90 leading-snug">
            {c.summary}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-2 text-xs">
        <CoverageStat label="Swaps parsed" value={fmtNum(c.parsedSwaps)} />
        <CoverageStat label="Completed trades" value={fmtNum(c.completedTrades)} />
        <CoverageStat label="Verified holdings" value={fmtNum(c.verifiedHoldings)} />
        <CoverageStat
          label="Pricing coverage"
          value={`${Math.round(c.pricingCoverage * 100)}%`}
        />
        <CoverageStat label="Date range" value={dateRange} />
      </div>

      {c.limitations.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 text-[11px] text-foreground/80 hover:underline"
          >
            {open ? (
              <>
                Hide limitations <ChevronUp className="w-3 h-3" />
              </>
            ) : (
              <>
                {c.limitations.length} coverage limitation
                {c.limitations.length === 1 ? "" : "s"}{" "}
                <ChevronDown className="w-3 h-3" />
              </>
            )}
          </button>
          {open && (
            <ul className="mt-1.5 space-y-1">
              {c.limitations.map((l) => (
                <li
                  key={l}
                  className="text-[11px] text-foreground/75 leading-relaxed flex items-start gap-1.5"
                >
                  <Info className="w-3 h-3 shrink-0 mt-0.5 opacity-70" />
                  {l}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CoverageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-foreground/60">
        {label}
      </div>
      <div className="tabular-nums font-medium break-words">{value}</div>
    </div>
  );
}

// ── Current Holdings Quality (Part 7) ────────────────────────────────────────

const POSITION_CLASS_LABEL: Record<RealPositionClass, string> = {
  core: "Core",
  high_conviction: "High conviction",
  oversized: "Oversized",
  small_speculative: "Small speculative",
  dust: "Dust",
  unpriced: "Unpriced",
  recently_opened: "Recently opened",
  long_held: "Long-held",
};

const POSITION_CLASS_TONE: Record<RealPositionClass, string> = {
  core: "bg-accent/10 text-accent",
  high_conviction: "bg-success/10 text-success",
  oversized: "bg-danger/10 text-danger",
  small_speculative: "bg-surface-3 text-muted-foreground",
  dust: "bg-surface-3 text-muted-foreground",
  unpriced: "bg-amber-500/10 text-warning",
  recently_opened: "bg-surface-3 text-muted-foreground",
  long_held: "bg-surface-3 text-muted-foreground",
};

function HoldingQualityRow({ p }: { p: RealHoldingQuality }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/[0.04] last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">
            {p.symbol ?? shortMint(p.tokenMint)}
          </span>
          <span
            className={cn(
              "text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0",
              POSITION_CLASS_TONE[p.classification],
            )}
          >
            {POSITION_CLASS_LABEL[p.classification]}
          </span>
          {p.tags.map((t) => (
            <span
              key={t}
              className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface-3 text-muted-foreground/80 shrink-0"
            >
              {POSITION_CLASS_LABEL[t]}
            </span>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground truncate mt-0.5">
          {p.sharePercent != null ? `${Math.round(p.sharePercent)}% of portfolio` : "unpriced"}
          {p.sizeVsMedian != null ? ` · ${p.sizeVsMedian.toFixed(1)}× median entry` : ""}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-mono tabular-nums">
          {p.currentValueSol != null ? `${fmtSolMag(p.currentValueSol)} SOL` : "—"}
        </div>
        <div
          className={cn(
            "text-[10px] font-mono tabular-nums",
            p.unrealizedPnlSol != null
              ? pnlColor(p.unrealizedPnlSol)
              : "text-muted-foreground",
          )}
        >
          {p.unrealizedPnlSol != null
            ? `${fmtSignedSolMag(p.unrealizedPnlSol)} SOL`
            : "no market data"}
        </div>
      </div>
    </div>
  );
}

export function HoldingsQualitySection({
  analysis,
}: {
  analysis: RealAnalysisSummary;
}) {
  const q: RealHoldingsQuality | null | undefined = analysis.holdingsQuality;
  const [showAll, setShowAll] = useState(false);
  // Unverified holdings never render quality — mirrors the reconciliation gate.
  if (!q || !q.holdingsVerified || q.positions.length === 0) return null;

  const sorted = [...q.positions].sort(
    (a, b) => (b.currentValueSol ?? 0) - (a.currentValueSol ?? 0),
  );
  const shown = showAll ? sorted : sorted.slice(0, 6);

  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <SectionHeader
        title="Current Holdings Quality"
        description="Conviction and sizing of your live, verified positions, reconciled against on-chain balances."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {q.dimensions.map((d) => (
          <MetricTile
            key={d.key}
            label={d.label}
            value={d.available && d.value != null ? d.value : "Unavailable"}
            tone={
              !d.available || d.value == null
                ? "default"
                : d.value >= 66
                  ? "positive"
                  : d.value >= 40
                    ? "default"
                    : ("warning" as MetricTone)
            }
            hint={d.note}
          />
        ))}
      </div>

      <div className="rounded-xl bg-surface-2 border border-white/[0.05] overflow-hidden">
        {shown.map((p) => (
          <HoldingQualityRow key={p.tokenMint} p={p} />
        ))}
      </div>
      {sorted.length > 6 && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="flex items-center gap-1 text-xs text-accent hover:underline"
        >
          {showAll ? (
            <>
              Show less <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              Show all {sorted.length} <ChevronDown className="w-3 h-3" />
            </>
          )}
        </button>
      )}

      {q.limitations.length > 0 && (
        <ul className="space-y-1">
          {q.limitations.map((l) => (
            <li
              key={l}
              className="text-[11px] text-muted-foreground/80 leading-relaxed flex items-start gap-1.5"
            >
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground/50" />
              {l}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

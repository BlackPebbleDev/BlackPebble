import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Filler,
} from "chart.js";
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Dna,
  Loader2,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
} from "lucide-react";
import {
  api,
  type RealAnalysisSummary,
  type RealTradingSignal,
  type RealTimelineEvent,
  type RealOpenPosition,
  type RealTokenPerformance,
  type RealPerformanceReport,
} from "@/lib/api";
import { useSolUsd } from "@/hooks/use-sol-usd";
import {
  fmtPercent,
  fmtSol,
  fmtSignedSol,
  fmtUsd,
  fmtNum,
  pnlColor,
} from "@/lib/format";
import {
  bpScales,
  bpTooltip,
  accentLineDataset,
  crosshairPlugin,
  filterByRange,
  type ChartRange,
} from "@/lib/chart-theme";
import { ChartRangeToggle } from "@/components/chart-range-toggle";
import { MetricTile, type MetricTone } from "@/components/metric-tile";
import { cn } from "@/lib/utils";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Filler,
);

// ── Signal dictionary ────────────────────────────────────────────────────────

const SIGNAL_LABELS: Record<string, string> = {
  consistency: "Consistency",
  risk: "Risk Appetite",
  discipline: "Discipline",
  timing: "Timing",
  patience: "Patience",
  recovery: "Recovery",
  profitability: "Profitability",
  conviction: "Conviction",
  position_sizing: "Sizing",
  diversification: "Diversification",
  drawdown_management: "Drawdowns",
  activity: "Activity",
};

const SIGNAL_HINTS: Record<string, string> = {
  consistency: "How steady your results are trade to trade.",
  risk: "How aggressive your position sizing and token selection are. High isn't bad - it's a style.",
  discipline: "Whether you follow repeatable rules on sizing and exits.",
  timing: "Quality of your entries and exits relative to outcomes.",
  patience: "Willingness to let positions develop instead of exiting instantly.",
  recovery: "How well you bounce back after losing streaks.",
  profitability: "Realized profit efficiency across closed trades.",
  conviction: "Tendency to take meaningful positions in fewer names.",
  position_sizing: "How well position sizes match your account and outcomes.",
  diversification: "Spread of exposure across different tokens.",
  drawdown_management: "How well losses are contained when trades go wrong.",
  activity: "How active this wallet has been recently.",
};

function signalTone(key: string, value: number): MetricTone {
  // Risk is direction-neutral: high = aggressive, not bad - render it amber.
  if (key === "risk") return value >= 70 ? "warning" : "muted";
  if (value >= 70) return "positive";
  if (value >= 40) return "warning";
  return "muted";
}

// ── Small shared helpers ─────────────────────────────────────────────────────

function formatHoldDuration(sec: number): string {
  if (sec <= 0) return "—";
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

function timeAgo(unixSec: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSec);
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function TokenLogo({
  logo,
  symbol,
  sizeClass = "w-7 h-7",
}: {
  logo: string | null;
  symbol: string | null;
  sizeClass?: string;
}) {
  const initial = (symbol ?? "?").slice(0, 2).toUpperCase();
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        className={cn("rounded-full object-cover shrink-0", sizeClass)}
        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full bg-surface-3 text-muted-foreground flex items-center justify-center text-[10px] font-semibold shrink-0",
        sizeClass,
      )}
    >
      {initial}
    </div>
  );
}

function shortMint(mint: string): string {
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

/** Numbered section header - gives the report its narrative spine. */
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

// ── Chart theming - shared BlackPebble chart language ────────────────────────

const baseScales = bpScales;

function fullDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", " ’");
}

function fullMonthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const HOLD_BUCKET_EXPLAIN: Record<string, string> = {
  "<10m": "held under 10 minutes",
  "10–60m": "held 10–60 minutes",
  "1–6h": "held 1–6 hours",
  "6–24h": "held 6–24 hours",
  "1–7d": "held 1–7 days",
  ">7d": "held over a week",
};

// ── Data hooks ───────────────────────────────────────────────────────────────

/** Shared data hook for both the portfolio card and the full utility page. */
export function useRealAnalysis() {
  const { publicKey, connected } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const queryClient = useQueryClient();
  const [syncError, setSyncError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["real-analysis", wallet],
    queryFn: () => api.realAnalysis.get(wallet!),
    enabled: !!wallet,
    staleTime: 5 * 60_000,
  });

  const hasData = !!query.data?.analysis && !query.data.analysis.empty;

  const timelineQuery = useQuery({
    queryKey: ["real-analysis-timeline", wallet],
    queryFn: () => api.realAnalysis.timeline(wallet!, 10),
    enabled: !!wallet && hasData,
    staleTime: 5 * 60_000,
  });

  const performanceQuery = useQuery({
    queryKey: ["real-analysis-performance", wallet],
    queryFn: () => api.realAnalysis.performance(wallet!),
    enabled: !!wallet && hasData,
    staleTime: 5 * 60_000,
  });

  const syncMutation = useMutation({
    mutationFn: () => api.realAnalysis.sync(wallet!),
    onSuccess: () => {
      setSyncError(null);
      queryClient.invalidateQueries({ queryKey: ["real-analysis", wallet] });
      queryClient.invalidateQueries({
        queryKey: ["real-analysis-timeline", wallet],
      });
      queryClient.invalidateQueries({
        queryKey: ["real-analysis-performance", wallet],
      });
    },
    onError: (e: Error) => setSyncError(e.message),
  });

  return {
    wallet,
    connected,
    analysis: query.data?.analysis ?? null,
    timeline: timelineQuery.data?.events ?? [],
    performance: performanceQuery.data?.performance ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    syncMutation,
    syncError,
  };
}

/** Live SOL balance of the connected wallet (read-only RPC call). */
function useWalletSolBalance(): number | null {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { data } = useQuery({
    queryKey: ["wallet-sol-balance", publicKey?.toBase58() ?? null],
    queryFn: async () => {
      const lamports = await connection.getBalance(publicKey!);
      return lamports / 1e9;
    },
    enabled: !!publicKey,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  return data ?? null;
}

function SyncButton({
  onClick,
  busy,
  label = "Refresh",
}: {
  onClick: () => void;
  busy: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent transition-colors disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <RefreshCw className="w-3 h-3" />
      )}
      {label}
    </button>
  );
}

// ── 1. Wallet Summary (hero) ─────────────────────────────────────────────────

function WalletSummaryHero({
  analysis,
  solBalance,
  solUsd,
  onSync,
  syncBusy,
  syncError,
}: {
  analysis: RealAnalysisSummary;
  solBalance: number | null;
  solUsd: number;
  onSync: () => void;
  syncBusy: boolean;
  syncError: string | null;
}) {
  const m = analysis.metrics;
  const holdingsSol = analysis.openPositions.reduce(
    (s, p) => s + (p.currentValueSol ?? 0),
    0,
  );
  const walletValueSol = solBalance != null ? solBalance + holdingsSol : null;
  const quality = analysis.walletHealth.score;
  const qualityTone: MetricTone =
    quality >= 70 ? "positive" : quality >= 40 ? "warning" : "negative";

  return (
    <div className="hairline-accent overflow-hidden rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-5">

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Dna className="w-4 h-4 text-accent shrink-0" />
            <span
              className="text-lg font-semibold text-accent tracking-tight"
              data-testid="text-archetype"
            >
              {analysis.personality.personality}
            </span>
            {analysis.dna?.secondaryLabel && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface-3 text-muted-foreground">
                + {analysis.dna.secondaryLabel}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mt-1 max-w-xl">
            {analysis.personality.description}
          </p>
          {analysis.personality.traits.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {analysis.personality.traits.map((t) => (
                <span
                  key={t}
                  className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-3 text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          <SyncButton onClick={onSync} busy={syncBusy} />
          <span className="text-[10px] text-muted-foreground/70">
            {analysis.tradeCount} swaps ·{" "}
            {new Date(analysis.computedAt * 1000).toLocaleDateString()}
          </span>
        </div>
      </div>

      {syncError && <p className="text-xs text-danger">{syncError}</p>}

      {!analysis.holdingsVerified && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3.5 py-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/90 leading-relaxed">
            Holdings shown are trade-history estimates that haven't been
            verified against your live on-chain balances yet. Hit Refresh to
            re-verify.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <MetricTile
          label="Wallet Value"
          size="lg"
          value={
            walletValueSol != null ? `${fmtSol(walletValueSol)} SOL` : "—"
          }
          sub={
            walletValueSol != null && solUsd > 0
              ? fmtUsd(walletValueSol * solUsd)
              : "SOL + verified holdings"
          }
          tone={analysis.holdingsVerified ? "default" : "warning"}
          hint="Your wallet's live SOL balance plus the current value of open positions verified against actual on-chain token balances. Tokens you traded but no longer hold are excluded."
          data-testid="tile-wallet-value"
        />
        <MetricTile
          label="Total P&L"
          size="lg"
          value={`${fmtSignedSol(m.totalPnlSol)} SOL`}
          sub={solUsd > 0 ? fmtUsd(m.totalPnlSol * solUsd) : undefined}
          tone={m.totalPnlSol > 0 ? "positive" : m.totalPnlSol < 0 ? "negative" : "default"}
          hint="Realized P&L from closed trades plus estimated unrealized P&L on open positions."
          data-testid="tile-total-pnl"
        />
        <MetricTile
          label="Realized / Unrealized"
          size="lg"
          value={
            <span className="flex items-baseline gap-1.5 text-base md:text-lg">
              <span className={pnlColor(m.realizedPnlSol)}>
                {fmtSignedSol(m.realizedPnlSol)}
              </span>
              <span className="text-muted-foreground text-xs">/</span>
              <span className={pnlColor(m.unrealizedPnlSol)}>
                {fmtSignedSol(m.unrealizedPnlSol)}
              </span>
            </span>
          }
          sub="SOL, closed vs open"
          hint="Left: locked-in profit from closed round trips. Right: estimated P&L on positions still open."
        />
        <MetricTile
          label="Portfolio Quality"
          size="lg"
          value={quality}
          tone={qualityTone}
          sub="Structure & diversification"
          hint="Measures how well-structured your current holdings are: concentration, diversification, dead and dust positions. Different from Wallet Cleanup's Wallet Health, which scores spam/hygiene."
          data-testid="tile-portfolio-quality"
        />
      </div>
    </div>
  );
}

// ── 2. Performance Overview ──────────────────────────────────────────────────

function PerformanceSection({
  performance,
}: {
  performance: RealPerformanceReport;
}) {
  const [range, setRange] = useState<ChartRange>("all");
  const hasSeries = performance.pnlSeries.length > 1;
  const hasActivity = performance.monthlyActivity.length > 0;
  const hasHolds = performance.holdBuckets.some((b) => b.count > 0);
  if (!hasSeries && !hasActivity && !hasHolds) return null;

  // Range-filter the P&L curve; fall back to the full series when the window
  // is too sparse to draw a line (fewer than 2 points).
  const filtered = filterByRange(performance.pnlSeries, range);
  const series = filtered.length > 1 ? filtered : performance.pnlSeries;
  const rangeIsSparse = filtered.length <= 1 && range !== "all";

  // Include the year on axis labels when the history spans more than one year.
  const spansYears =
    hasSeries &&
    new Date(series[0]!.t * 1000).getFullYear() !==
      new Date(series[series.length - 1]!.t * 1000).getFullYear();

  const pnlData = {
    labels: series.map((p) =>
      new Date(p.t * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...(spansYears ? { year: "2-digit" as const } : {}),
      }),
    ),
    datasets: [
      {
        ...accentLineDataset,
        label: "Cumulative Realized P&L",
        data: series.map((p) => p.cumRealizedPnlSol),
      },
    ],
  };

  const totalClosed = performance.holdBuckets.reduce((s, b) => s + b.count, 0);

  const activityData = {
    labels: performance.monthlyActivity.map((a) => monthLabel(a.month)),
    datasets: [
      {
        label: "Buys",
        data: performance.monthlyActivity.map((a) => a.buys),
        backgroundColor: "rgba(52,211,153,0.55)",
        hoverBackgroundColor: "rgba(52,211,153,0.85)",
        borderRadius: 4,
        borderSkipped: false as const,
        maxBarThickness: 28,
      },
      {
        label: "Sells",
        data: performance.monthlyActivity.map((a) => a.sells),
        backgroundColor: "rgba(248,113,113,0.45)",
        hoverBackgroundColor: "rgba(248,113,113,0.8)",
        borderRadius: 4,
        borderSkipped: false as const,
        maxBarThickness: 28,
      },
    ],
  };

  const holdData = {
    labels: performance.holdBuckets.map((b) => b.label),
    datasets: [
      {
        label: "Closed trades",
        data: performance.holdBuckets.map((b) => b.count),
        backgroundColor: "rgba(201,169,110,0.45)",
        hoverBackgroundColor: "rgba(201,169,110,0.8)",
        borderRadius: 4,
        borderSkipped: false as const,
        maxBarThickness: 40,
      },
    ],
  };

  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <SectionHeader
        title="Performance Overview"
        description="Built from your actual on-chain round trips - how your realized results have evolved."
      />

      {hasSeries && (
        <div>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="stat-label mb-0.5">Cumulative Realized P&L</div>
              <p className="text-[11px] text-muted-foreground">
                Your running total of locked-in profit and loss, trade by
                trade. Hover anywhere on the line for the value at that point.
              </p>
            </div>
            <ChartRangeToggle value={range} onChange={setRange} className="shrink-0" />
          </div>
          {rangeIsSparse && (
            <p className="text-[11px] text-warning/80 mb-2">
              Not enough closed trades in this window - showing full history.
            </p>
          )}
          <div className="h-56">
            <Line
              data={pnlData}
              plugins={[crosshairPlugin]}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    ...bpTooltip,
                    callbacks: {
                      title: (items) =>
                        items[0] != null
                          ? fullDate(series[items[0].dataIndex]!.t)
                          : "",
                      label: (item) =>
                        `Total realized P&L: ${fmtSignedSol(item.parsed.y)} SOL`,
                    },
                  },
                },
                scales: baseScales,
              }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hasActivity && (
          <div className="rounded-xl bg-surface-2 border border-white/[0.05] p-4">
            <div className="stat-label mb-0.5">Monthly Trading Activity</div>
            <p className="text-[11px] text-muted-foreground mb-2">
              <span className="text-success">■</span> buys and{" "}
              <span className="text-danger">■</span> sells per month - taller
              bars mean a more active month.
            </p>
            <div className="h-40">
              <Bar
                data={activityData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: "index", intersect: false },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      ...bpTooltip,
                      callbacks: {
                        title: (items) =>
                          items[0] != null
                            ? fullMonthLabel(
                                performance.monthlyActivity[
                                  items[0].dataIndex
                                ]!.month,
                              )
                            : "",
                        label: (item) =>
                          `${item.dataset.label}: ${item.parsed.y}`,
                        footer: (items) => {
                          const bucket =
                            items[0] != null
                              ? performance.monthlyActivity[items[0].dataIndex]
                              : null;
                          return bucket
                            ? `Volume traded: ${fmtSol(bucket.volumeSol)} SOL`
                            : "";
                        },
                      },
                    },
                  },
                  scales: {
                    x: { ...baseScales.x, stacked: true },
                    y: {
                      ...baseScales.y,
                      stacked: true,
                      ticks: { ...baseScales.y.ticks, precision: 0 },
                    },
                  },
                }}
              />
            </div>
          </div>
        )}
        {hasHolds && (
          <div className="rounded-xl bg-surface-2 border border-white/[0.05] p-4">
            <div className="stat-label mb-0.5">How Long You Hold</div>
            <p className="text-[11px] text-muted-foreground mb-2">
              Each bar counts closed trades by how long you held before
              selling - left is quick flips, right is long holds.
            </p>
            <div className="h-40">
              <Bar
                data={holdData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: "index", intersect: false },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      ...bpTooltip,
                      callbacks: {
                        title: (items) => {
                          const label =
                            items[0] != null
                              ? performance.holdBuckets[items[0].dataIndex]!
                                  .label
                              : "";
                          return `Trades ${HOLD_BUCKET_EXPLAIN[label] ?? label}`;
                        },
                        label: (item) => {
                          const count = item.parsed.y ?? 0;
                          const pct =
                            totalClosed > 0
                              ? Math.round((count / totalClosed) * 100)
                              : 0;
                          return `${count} trade${count === 1 ? "" : "s"} (${pct}% of all closed trades)`;
                        },
                      },
                    },
                  },
                  scales: {
                    ...baseScales,
                    y: {
                      ...baseScales.y,
                      ticks: { ...baseScales.y.ticks, precision: 0 },
                    },
                  },
                }}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── 3. Trader Intelligence (signals) ─────────────────────────────────────────

function IntelligenceSection({ analysis }: { analysis: RealAnalysisSummary }) {
  if (analysis.signals.length === 0) return null;
  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <SectionHeader
        title="Trader Intelligence"
        description="Twelve signals scored 0–100 from your history, with 30-day change. These evolve as you trade."
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {analysis.signals.map((s: RealTradingSignal) => (
          <MetricTile
            key={s.key}
            label={SIGNAL_LABELS[s.key] ?? s.key}
            value={s.value}
            delta={s.delta30d}
            tone={signalTone(s.key, s.value)}
            hint={
              (SIGNAL_HINTS[s.key] ?? "") +
              (s.evidence.length > 0 ? ` - ${s.evidence.join(" · ")}` : "")
            }
            data-testid={`signal-${s.key}`}
          />
        ))}
      </div>
    </section>
  );
}

// ── 4. Behavior Analysis ─────────────────────────────────────────────────────

function BehaviorSection({ analysis }: { analysis: RealAnalysisSummary }) {
  const [expanded, setExpanded] = useState(false);
  if (analysis.insights.length === 0) return null;

  const strengths = analysis.insights.filter((i) => i.severity === "positive");
  const watch = analysis.insights.filter((i) => i.severity === "warning");
  const notes = analysis.insights.filter((i) => i.severity === "info");
  const hiddenNotes = expanded ? notes : notes.slice(0, 2);

  const InsightRow = ({
    insight,
  }: {
    insight: RealAnalysisSummary["insights"][number];
  }) => (
    <div
      className={cn(
        "rounded-xl px-3.5 py-3 text-sm border",
        insight.severity === "positive"
          ? "border-success/20 bg-success/5"
          : insight.severity === "warning"
            ? "border-warning/20 bg-amber-500/5"
            : "border-white/[0.05] bg-surface-2",
      )}
    >
      <div className="font-medium">{insight.title}</div>
      <div className="text-muted-foreground text-xs mt-0.5 leading-relaxed">
        {insight.description}
      </div>
    </div>
  );

  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <SectionHeader
        title="Behavior Analysis"
        description="Patterns detected in how you actually trade - your strengths and what to watch."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {strengths.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 stat-label">
              <ThumbsUp className="w-3.5 h-3.5 text-success" />
              Strengths
            </div>
            {strengths.map((i) => (
              <InsightRow key={i.key} insight={i} />
            ))}
          </div>
        )}
        {watch.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 stat-label">
              <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              Areas to Watch
            </div>
            {watch.map((i) => (
              <InsightRow key={i.key} insight={i} />
            ))}
          </div>
        )}
      </div>
      {notes.length > 0 && (
        <div className="space-y-2">
          <div className="stat-label">Observations</div>
          {hiddenNotes.map((i) => (
            <InsightRow key={i.key} insight={i} />
          ))}
          {notes.length > 2 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-accent hover:underline"
            >
              {expanded ? (
                <>
                  Show less <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  Show {notes.length - 2} more <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ── 5. Risk & Exposure ───────────────────────────────────────────────────────

function RiskSection({ analysis }: { analysis: RealAnalysisSummary }) {
  const m = analysis.metrics;
  const h = analysis.walletHealth;
  const exposureSol = analysis.openPositions.reduce(
    (s, p) => s + (p.currentValueSol ?? p.costBasisSol),
    0,
  );
  const concentrationTone: MetricTone =
    h.concentrationRisk > 60 ? "negative" : h.concentrationRisk > 35 ? "warning" : "positive";

  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <SectionHeader
        title="Risk & Exposure"
        description="How much is at risk right now, and how you size when you take a shot."
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <MetricTile
          label="Current Exposure"
          value={`${fmtSol(exposureSol)} SOL`}
          hint="Total current value of open positions from your traced history."
        />
        <MetricTile
          label="Concentration"
          value={`${h.concentrationRisk}%`}
          tone={concentrationTone}
          hint="How much of your holdings sit in a few tokens. Lower is safer."
        />
        <MetricTile
          label="Avg Position"
          value={`${fmtSol(m.avgPositionSizeSol)} SOL`}
          hint="Average SOL committed per buy."
        />
        <MetricTile
          label="Largest Loss"
          value={`${fmtSol(m.largestLossSol)} SOL`}
          tone={m.largestLossSol > 0 ? "negative" : "default"}
          hint="Your single worst realized round trip."
        />
        <MetricTile
          label="Largest Gain"
          value={`${fmtSol(m.largestGainSol)} SOL`}
          tone={m.largestGainSol > 0 ? "positive" : "default"}
          hint="Your single best realized round trip."
        />
        <MetricTile
          label="Dead / Dust"
          value={`${h.deadPositions} / ${h.dustPositions}`}
          tone={h.deadPositions > 0 ? "warning" : "default"}
          hint="Positions that look inactive or worthless / positions too small to matter."
        />
      </div>
      {h.notes.length > 0 && (
        <ul className="space-y-1">
          {h.notes.map((n) => (
            <li
              key={n}
              className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px text-muted-foreground/60" />
              {n}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── 6. Holdings & Trades ─────────────────────────────────────────────────────

function TokenPerfRow({ t }: { t: RealTokenPerformance }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-surface-2 border border-white/[0.05] px-3 py-2.5">
      <TokenLogo logo={t.logo} symbol={t.symbol} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">
          {t.symbol ?? shortMint(t.tokenMint)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {t.roundTrips} round trip{t.roundTrips === 1 ? "" : "s"}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={cn("text-sm font-mono font-medium", pnlColor(t.realizedPnlSol))}>
          {fmtSignedSol(t.realizedPnlSol)} SOL
        </div>
        <div className={cn("text-[10px] font-mono", pnlColor(t.roiPercent))}>
          {fmtPercent(t.roiPercent, 1)}
        </div>
      </div>
    </div>
  );
}

function PositionRow({ p }: { p: RealOpenPosition }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/[0.04] last:border-0">
      <TokenLogo logo={p.logo} symbol={p.symbol} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">
          {p.symbol ?? shortMint(p.tokenMint)}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">
          {fmtNum(p.tokenAmount)} tokens · cost {fmtSol(p.costBasisSol)} SOL
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-mono">
          {p.currentValueSol != null ? `${fmtSol(p.currentValueSol)} SOL` : "—"}
        </div>
        <div
          className={cn(
            "text-[10px] font-mono",
            p.unrealizedPnlSol != null
              ? pnlColor(p.unrealizedPnlSol)
              : "text-muted-foreground",
          )}
        >
          {p.unrealizedPnlSol != null
            ? `${fmtSignedSol(p.unrealizedPnlSol)} SOL`
            : "no market data"}
        </div>
      </div>
    </div>
  );
}

function HoldingsSection({
  analysis,
  performance,
}: {
  analysis: RealAnalysisSummary;
  performance: RealPerformanceReport | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const positions = [...analysis.openPositions].sort(
    (a, b) =>
      (b.currentValueSol ?? b.costBasisSol) - (a.currentValueSol ?? a.costBasisSol),
  );
  const shown = showAll ? positions : positions.slice(0, 6);
  const winners = performance?.topWinners ?? [];
  const losers = performance?.topLosers ?? [];
  if (positions.length === 0 && winners.length === 0 && losers.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <SectionHeader
        title="Holdings & Trades"
        description="Open positions from your traced swaps, and the tokens that made - or cost - you the most."
      />

      {positions.length > 0 && (
        <div>
          <div className="stat-label mb-2">
            Open Positions ({positions.length})
          </div>
          <div className="rounded-xl bg-surface-2 border border-white/[0.05] overflow-hidden">
            {shown.map((p) => (
              <PositionRow key={p.tokenMint} p={p} />
            ))}
          </div>
          {positions.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="mt-2 flex items-center gap-1 text-xs text-accent hover:underline"
            >
              {showAll ? (
                <>
                  Show less <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  Show all {positions.length} <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          )}
        </div>
      )}

      {(winners.length > 0 || losers.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {winners.length > 0 && (
            <div className="space-y-2">
              <div className="stat-label">Top Winners</div>
              {winners.map((t) => (
                <TokenPerfRow key={t.tokenMint} t={t} />
              ))}
            </div>
          )}
          {losers.length > 0 && (
            <div className="space-y-2">
              <div className="stat-label">Top Losers</div>
              {losers.map((t) => (
                <TokenPerfRow key={t.tokenMint} t={t} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── 7. Historical Evolution ──────────────────────────────────────────────────

function EvolutionSection({ events }: { events: RealTimelineEvent[] }) {
  if (events.length === 0) return null;
  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <SectionHeader
        title="Your Evolution"
        description="Milestones BlackPebble has detected as your trading develops."
      />
      <div className="space-y-1.5">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="flex items-start gap-3 rounded-xl bg-surface-2 border border-white/[0.05] px-3.5 py-3"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{ev.title}</div>
              {ev.body && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {ev.body}
                </div>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground/70 shrink-0">
              {timeAgo(ev.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Detailed metrics (expandable advanced analysis) ──────────────────────────

function DetailedMetricsSection({ analysis }: { analysis: RealAnalysisSummary }) {
  const [open, setOpen] = useState(false);
  const m = analysis.metrics;

  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 text-left"
        data-testid="toggle-detailed-metrics"
      >
        <SectionHeader
          title="Detailed Metrics"
          description="Every number behind the analysis."
        />
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          <MetricTile
            label="Win Rate"
            value={m.closedRoundTrips > 0 ? fmtPercent(m.winRate * 100, 1) : "—"}
            tone={m.winRate >= 0.5 ? "positive" : "default"}
          />
          <MetricTile label="Closed Trades" value={m.closedRoundTrips} />
          <MetricTile label="Total Swaps" value={m.totalTrades} />
          <MetricTile
            label="Buys / Sells"
            value={`${m.buyCount} / ${m.sellCount}`}
          />
          <MetricTile
            label="Avg Gain"
            value={`${fmtSol(m.avgGainSol)} SOL`}
            tone={m.avgGainSol > 0 ? "positive" : "default"}
          />
          <MetricTile
            label="Avg Loss"
            value={`${fmtSol(m.avgLossSol)} SOL`}
            tone={m.avgLossSol > 0 ? "negative" : "default"}
          />
          <MetricTile
            label="Avg Hold"
            value={formatHoldDuration(m.avgHoldDurationSec)}
          />
          <MetricTile
            label="Median Hold"
            value={formatHoldDuration(m.medianHoldDurationSec)}
          />
          <MetricTile
            label="Trades / Week"
            value={m.tradingFrequencyPerWeek.toFixed(1)}
          />
          <MetricTile label="Unique Tokens" value={m.uniqueTokensTraded} />
          <MetricTile
            label="Avg Mkt Cap Bought"
            value={m.avgMarketCapPurchasedUsd != null ? fmtUsd(m.avgMarketCapPurchasedUsd) : "—"}
          />
          <MetricTile label="Wallet Age" value={`${m.walletAgeDays}d`} />
        </div>
      )}
    </section>
  );
}

function DataTransparency({ analysis }: { analysis: RealAnalysisSummary }) {
  return (
    <div className="flex items-start gap-2 text-[11px] text-muted-foreground/70 leading-relaxed">
      <Shield className="w-3 h-3 shrink-0 mt-0.5" />
      <span>
        Read-only analysis of public blockchain data. {analysis.tradeCount}{" "}
        swaps analyzed · wallet age ~{analysis.metrics.walletAgeDays}d.
        {analysis.holdingsVerified
          ? " Holdings verified against live on-chain balances."
          : " Holdings pending on-chain verification."}
        {analysis.droppedGhostMints > 0 &&
          ` ${analysis.droppedGhostMints} token${analysis.droppedGhostMints > 1 ? "s" : ""} from your trade history ${analysis.droppedGhostMints > 1 ? "are" : "is"} no longer in the wallet and ${analysis.droppedGhostMints > 1 ? "were" : "was"} excluded.`}{" "}
        BlackPebble never requests keys, signing, or approvals - and this never
        touches your paper trading stats.
      </span>
    </div>
  );
}

// ── Full page assembly ───────────────────────────────────────────────────────

/**
 * Full analysis experience - used by the /utilities/trading-analysis page.
 * Structured as an intelligence report: summary → performance → intelligence
 * → behavior → risk → holdings → detailed metrics → evolution.
 */
export function RealTradingAnalysisFull() {
  const {
    wallet,
    connected,
    analysis,
    timeline,
    performance,
    isLoading,
    isFetching,
    syncMutation,
    syncError,
  } = useRealAnalysis();
  const solBalance = useWalletSolBalance();
  const solUsd = useSolUsd();

  if (!connected || !wallet) {
    return (
      <div className="rounded-2xl bg-card shadow-card p-6 space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
          Connect a wallet to analyze your real on-chain trading history.
          BlackPebble reads public blockchain data only - it never requests seed
          phrases, private keys, approvals, or transaction signing.
        </p>
        <WalletMultiButton />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-card shadow-card p-6 flex items-center gap-2 text-sm text-muted-foreground justify-center py-12">
        <Loader2 className="w-4 h-4 animate-spin text-accent" />
        Analyzing on-chain history…
      </div>
    );
  }

  if (!analysis) return null;

  if (analysis.empty) {
    return (
      <div className="rounded-2xl bg-card shadow-card p-6 space-y-3">
        <p className="text-sm text-muted-foreground">
          {analysis.message ?? "No swap history found yet."}
        </p>
        {syncError && <p className="text-xs text-danger">{syncError}</p>}
        <button
          type="button"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="inline-flex items-center gap-2 text-sm text-accent hover:underline disabled:opacity-50"
        >
          {syncMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Sync wallet history
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <WalletSummaryHero
        analysis={analysis}
        solBalance={solBalance}
        solUsd={solUsd}
        onSync={() => syncMutation.mutate()}
        syncBusy={syncMutation.isPending || isFetching}
        syncError={syncError}
      />
      {performance && <PerformanceSection performance={performance} />}
      <IntelligenceSection analysis={analysis} />
      <BehaviorSection analysis={analysis} />
      <RiskSection analysis={analysis} />
      <HoldingsSection analysis={analysis} performance={performance} />
      <DetailedMetricsSection analysis={analysis} />
      <EvolutionSection events={timeline} />
      <DataTransparency analysis={analysis} />
    </div>
  );
}

// ── Compact portfolio card ───────────────────────────────────────────────────

/**
 * Compact summary card for the Portfolio - links to the full utility page.
 * Strictly separate from paper-trading metrics.
 */
export function RealTradingAnalysisSection() {
  const { wallet, connected, analysis, isLoading } = useRealAnalysis();

  const topSignals = (analysis?.signals ?? [])
    .filter((s) => s.key !== "activity")
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  return (
    <div
      className="rounded-xl bg-card shadow-card p-4 sm:p-5 mb-6"
      data-testid="real-trading-analysis"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-accent/12 flex items-center justify-center flex-shrink-0">
            <Brain className="w-5 h-5 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold">Trading Analysis</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              On-chain intelligence · separate from paper trading
            </p>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
          Read-only
        </span>
      </div>

      {!connected || !wallet ? (
        <p className="text-sm text-muted-foreground mt-3">
          Connect a wallet to unlock your on-chain trading intelligence.
        </p>
      ) : isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-accent" />
          Analyzing…
        </div>
      ) : analysis && !analysis.empty ? (
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Dna className="w-4 h-4 text-accent shrink-0" />
            <span className="text-sm font-medium truncate">
              {analysis.personality.personality}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            {topSignals.map((s) => (
              <MetricTile
                key={s.key}
                size="sm"
                label={SIGNAL_LABELS[s.key] ?? s.key}
                value={s.value}
                tone={signalTone(s.key, s.value)}
                className="min-w-[88px] text-center"
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mt-3">
          No swap history analyzed yet.
        </p>
      )}

      <Link
        href="/utilities/trading-analysis"
        className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline"
        data-testid="link-full-analysis"
      >
        Full analysis
        <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

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
import {
  canonicalOpenPositions,
  holdingsAreVerified,
} from "@/lib/real-analysis-select";
import { selectPreviewSignals } from "@/lib/real-analysis-preview";
import { useSolUsd } from "@/hooks/use-sol-usd";
import {
  fmtPercent,
  fmtSol,
  fmtSignedSol,
  fmtUsdSmart,
  fmtSolMag,
  fmtSignedSolMag,
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
import {
  MetricTile,
  type MetricTone,
  type DeltaInfo,
} from "@/components/metric-tile";
import {
  HistoricalRiskSection,
  CoverageBanner,
  HoldingsQualitySection,
} from "@/components/real-trading-intelligence";
import {
  EntryIntelligenceSection,
  ExitIntelligenceSection,
  CurrentLiquiditySection,
} from "@/components/trader-intelligence/entry-exit-intelligence";
import { TradeReplaySection } from "@/components/trader-intelligence/trade-replay";
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
  diversification: "Trading Breadth",
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
  diversification:
    "How many different tokens you have traded over time (a descriptive style reading). This is your historical trading breadth, not your current portfolio concentration.",
  drawdown_management: "How well losses are contained when trades go wrong.",
  activity: "How active this wallet has been recently.",
};

/**
 * Static, honest explainability content per signal (Phase 2, Part 6). Direction
 * is the single source of truth for how to colour a change; `basis` states which
 * raw inputs the score reads (no fake formula, no AI claims). `meaning` maps a
 * score band to plain language; `improve` is one practical, non-judgmental idea.
 */
type SignalDirectionFe = "higher_better" | "descriptive";

interface SignalExplain {
  direction: SignalDirectionFe;
  basis: string;
  meaning: string;
  improve: string;
}

const SIGNAL_EXPLAIN: Record<string, SignalExplain> = {
  consistency: {
    direction: "higher_better",
    basis: "Completed round trips and swap cadence",
    meaning: "Higher means your results vary less from trade to trade.",
    improve: "Keeping position sizes steadier tends to raise consistency.",
  },
  risk: {
    direction: "descriptive",
    basis: "Position sizing and token selection across buys",
    meaning: "A style reading, not a grade: higher means more aggressive.",
    improve: "There is no target here. Lower can mean safer, not better.",
  },
  discipline: {
    direction: "higher_better",
    basis: "Completed round trips",
    meaning: "Higher means you follow repeatable sizing and exit rules.",
    improve: "Pre-planning exits before entering supports discipline.",
  },
  timing: {
    direction: "higher_better",
    basis: "Completed round trips",
    meaning: "Higher means entries and exits landed well relative to outcomes.",
    improve: "Avoiding entries into extended moves tends to help timing.",
  },
  patience: {
    direction: "descriptive",
    basis: "Hold durations on completed round trips",
    meaning: "A style reading: higher means you let positions develop longer.",
    improve: "There is no target here. It reflects your natural hold style.",
  },
  recovery: {
    direction: "higher_better",
    basis: "Sequences of completed round trips",
    meaning: "Higher means you bounce back well after losing streaks.",
    improve: "Reducing size after a losing streak can support recovery.",
  },
  profitability: {
    direction: "higher_better",
    basis: "Realized P&L across completed round trips",
    meaning: "Higher means better realized profit efficiency on closed trades.",
    improve: "Letting winners run longer than losers tends to raise this.",
  },
  conviction: {
    direction: "descriptive",
    basis: "Buy sizing concentration across names",
    meaning: "A style reading: higher means larger positions in fewer names.",
    improve: "There is no target here. It reflects how you allocate.",
  },
  position_sizing: {
    direction: "higher_better",
    basis: "Buy sizes relative to outcomes",
    meaning: "Higher means your position sizes match your results well.",
    improve: "Sizing losers smaller than winners tends to raise this.",
  },
  diversification: {
    direction: "descriptive",
    basis: "Distinct tokens traded over time (historical breadth)",
    meaning:
      "A style reading, not a grade: higher means you have traded a wider set of tokens historically. This is separate from current portfolio concentration.",
    improve: "There is no target here. It reflects your historical variety.",
  },
  drawdown_management: {
    direction: "higher_better",
    basis: "Loss size distribution across completed round trips",
    meaning: "Higher means losses are contained when trades go wrong.",
    improve: "Consistent stop discipline tends to contain drawdowns.",
  },
  activity: {
    direction: "descriptive",
    basis: "Recent swap frequency",
    meaning: "A style reading: higher means a more active recent cadence.",
    improve: "There is no target here. Activity is descriptive only.",
  },
};

/** Confidence tier -> short human label for the detail view. */
const TIER_LABEL: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  insufficient: "Insufficient data",
};

function signalTone(key: string, value: number): MetricTone {
  // Descriptive signals (risk, patience, conviction, activity) have no good/bad
  // direction - render them neutral so a "style" reading never looks like a grade.
  if (SIGNAL_EXPLAIN[key]?.direction === "descriptive") {
    return key === "risk" && value >= 70 ? "warning" : "muted";
  }
  if (value >= 70) return "positive";
  if (value >= 40) return "warning";
  return "muted";
}

/**
 * Build a direction-aware change badge from the auditable comparison. A numeric
 * change only shows when the comparison is trustworthy ("comparable"); a first
 * reading shows "New"; a thin/absent prior shows no badge (never a fake delta).
 */
function signalDelta(s: RealTradingSignal): DeltaInfo | null {
  const status = s.comparison?.status;
  if (status === "new") return { value: 0, label: "New" };
  if (status === "comparable" && s.delta30d != null && s.delta30d !== 0) {
    const dir =
      SIGNAL_EXPLAIN[s.key]?.direction === "descriptive"
        ? "neutral"
        : "up-good";
    return { value: s.delta30d, direction: dir };
  }
  // Legacy snapshots without a comparison object: fall back to the old delta.
  if (status == null && s.delta30d != null && s.delta30d !== 0) {
    return { value: s.delta30d, direction: "up-good" };
  }
  return null;
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
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    performanceFailed: performanceQuery.isError,
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
  const verified = holdingsAreVerified(analysis);
  // Prefer the server's truthful "Total On-Chain Portfolio" (native SOL + every
  // priced live holding). When that reconciliation is unavailable we fall back
  // to the live NATIVE SOL balance ONLY - never native + reconstructed
  // trade-history holdings, which can be "ghost" positions the wallet already
  // sold/transferred and would massively overstate the wallet's real value.
  const portfolio = analysis.portfolio ?? null;
  const walletValueSol =
    portfolio != null
      ? portfolio.totalOnChainPortfolioSol
      : solBalance != null
        ? solBalance
        : null;
  // When we only have native SOL, this is an explicitly PARTIAL total - the
  // wallet's token holdings could not be read - never presented as complete.
  const walletValueUnverified = portfolio == null;
  const unpricedCount = portfolio?.counts.unpriced ?? 0;
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

      {!verified && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3.5 py-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/90 leading-relaxed">
            Your current token holdings could not be verified against live
            on-chain balances yet, so current positions and exposure are marked
            unverified. Hit Refresh to re-verify.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <MetricTile
          label={walletValueUnverified ? "Native SOL Only" : "On-Chain Portfolio"}
          size="lg"
          value={
            walletValueSol != null ? `${fmtSolMag(walletValueSol)} SOL` : "—"
          }
          sub={
            walletValueUnverified
              ? "Token valuation unavailable - reconnect/refresh to include held tokens"
              : walletValueSol != null && solUsd > 0
                ? fmtUsdSmart(walletValueSol * solUsd)
                : "Native SOL + priced holdings"
          }
          tone={verified ? "default" : "warning"}
          hint={
            walletValueUnverified
              ? "Native SOL only. Your live on-chain token holdings could not be read right now, so this shows your native SOL balance - not your complete wallet total. Hit Refresh to reconcile against live balances."
              : "Total On-Chain Portfolio: your live native SOL plus the current value of every priced token you hold." +
                (unpricedCount > 0
                  ? ` ${unpricedCount} holding${unpricedCount === 1 ? "" : "s"} could not be priced and are disclosed separately, excluded from this total (not counted as zero).`
                  : "")
          }
          data-testid="tile-wallet-value"
        />
        <MetricTile
          label="Historical Trading P&L"
          size="lg"
          value={`${fmtSignedSolMag(
            verified ? m.totalPnlSol : m.realizedPnlSol,
          )} SOL`}
          sub={
            !verified
              ? "Reconstructed from closed trades"
              : solUsd > 0
                ? fmtUsdSmart(m.totalPnlSol * solUsd)
                : "Reconstructed from analyzed trades"
          }
          tone={
            (verified ? m.totalPnlSol : m.realizedPnlSol) > 0
              ? "positive"
              : (verified ? m.totalPnlSol : m.realizedPnlSol) < 0
                ? "negative"
                : "default"
          }
          hint={
            verified
              ? "Reconstructed from your analyzed completed round trips plus estimated unrealized P&L on traced open positions. This is trading performance, not your current wallet balance."
              : "Reconstructed realized P&L from your analyzed completed round trips. Unrealized P&L is excluded because current holdings could not be verified. This is trading performance, not your current wallet balance."
          }
          data-testid="tile-total-pnl"
        />
        <MetricTile
          label="Realized / Unrealized"
          size="lg"
          value={
            // Stacked label-over-value blocks (never a side-by-side row): a large
            // SOL value, negative sign, or 360px width can't push the number
            // outside the card. break-words + min-w-0 guarantee no clipping.
            <span className="flex w-full flex-col gap-2 text-lg sm:text-xl">
              <span className="flex min-w-0 flex-col">
                <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-muted-foreground">
                  Realized
                </span>
                <span
                  className={cn(
                    "tabular-nums break-words leading-tight",
                    pnlColor(m.realizedPnlSol),
                  )}
                >
                  {fmtSignedSolMag(m.realizedPnlSol)} SOL
                </span>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-muted-foreground">
                  Unrealized
                </span>
                {verified ? (
                  <span
                    className={cn(
                      "tabular-nums break-words leading-tight",
                      pnlColor(m.unrealizedPnlSol),
                    )}
                  >
                    {fmtSignedSolMag(m.unrealizedPnlSol)} SOL
                  </span>
                ) : (
                  <span className="text-warning text-sm">Unverified</span>
                )}
              </span>
            </span>
          }
          sub="Closed trades vs open positions"
          hint="Realized: locked-in profit from completed round trips (historical). Unrealized: current estimated P&L on verified open positions (hidden when holdings can't be verified)."
        />
        <MetricTile
          label="Portfolio Quality"
          size="lg"
          value={quality}
          tone={qualityTone}
          sub="Structure, concentration & asset quality"
          hint="Measures how well-structured your current holdings are: concentration, dead and dust positions, and cleanliness. Different from Wallet Cleanup's Wallet Health, which scores spam/hygiene."
          data-testid="tile-portfolio-quality"
        />
      </div>
    </div>
  );
}

// ── 1b. Trader Profile (expanded identity from existing DNA + signals) ────────

/**
 * Frontend interpretation of the already-computed DNA trait vector into
 * plain-language style descriptors. These are LABELS over existing numeric
 * traits (0-1) — no new calculation, no backend change. When a trait is absent
 * (older snapshots) the style is simply omitted.
 */
function deriveTraderStyles(
  vector: Record<string, number>,
): Array<{ label: string; value: string; hint: string }> {
  const v = (k: string): number | null =>
    typeof vector[k] === "number" ? vector[k]! : null;
  const styles: Array<{ label: string; value: string; hint: string }> = [];

  const risk = v("risk_tolerance");
  if (risk != null) {
    styles.push({
      label: "Risk Style",
      value: risk >= 0.66 ? "Aggressive" : risk >= 0.4 ? "Balanced" : "Conservative",
      hint: "How much risk you take on sizing and token selection (from your risk-tolerance trait). A style, not a grade.",
    });
  }

  const discipline = v("discipline");
  const fomo = v("fomo");
  if (discipline != null || fomo != null) {
    const d = discipline ?? 0;
    const f = fomo ?? 0;
    styles.push({
      label: "Decision Style",
      value: d >= 0.55 ? "Rule-based" : f >= 0.5 ? "Reactive" : "Adaptive",
      hint: "Whether you tend to follow repeatable rules or react to price action (from your discipline and FOMO traits).",
    });
  }

  const patience = v("patience");
  const scalping = v("scalping");
  const swing = v("swing");
  if (patience != null || scalping != null || swing != null) {
    const sc = scalping ?? 0;
    const pt = Math.max(patience ?? 0, swing ?? 0);
    styles.push({
      label: "Exit Style",
      value: sc >= 0.55 && sc >= pt ? "Fast exits" : pt >= 0.55 ? "Patient" : "Mixed",
      hint: "How long you let positions develop before exiting (from your patience, swing and scalping traits).",
    });
  }

  const momentum = v("momentum");
  const rotation = v("rotation");
  if (momentum != null || rotation != null) {
    const mo = momentum ?? 0;
    const ro = rotation ?? 0;
    styles.push({
      label: "Trading Pace",
      value: ro >= 0.55 && ro >= mo ? "Rotational" : mo >= 0.55 ? "Momentum" : "Selective",
      hint: "How you move between opportunities: chasing momentum, rotating across themes, or waiting for select setups.",
    });
  }

  return styles;
}

/** Top strengths / weaknesses derived from the scored, gradeable signals. */
function deriveStrengthsWeaknesses(signals: RealTradingSignal[]): {
  strengths: RealTradingSignal[];
  weaknesses: RealTradingSignal[];
} {
  const gradeable = signals.filter(
    (s) =>
      s.tier !== "insufficient" &&
      SIGNAL_EXPLAIN[s.key]?.direction === "higher_better",
  );
  const byValueDesc = [...gradeable].sort((a, b) => b.value - a.value);
  const strengths = byValueDesc.filter((s) => s.value >= 60).slice(0, 3);
  const weaknesses = [...gradeable]
    .sort((a, b) => a.value - b.value)
    .filter((s) => s.value <= 50)
    .slice(0, 3);
  return { strengths, weaknesses };
}

function TraderProfileSection({ analysis }: { analysis: RealAnalysisSummary }) {
  const dna = analysis.dna;
  if (!dna) return null;
  const styles = deriveTraderStyles(dna.vector ?? {});
  const { strengths, weaknesses } = deriveStrengthsWeaknesses(analysis.signals);
  const confidencePct = Math.round((dna.confidence ?? 0) * 100);
  const hasBody =
    styles.length > 0 || strengths.length > 0 || weaknesses.length > 0;
  if (!hasBody && !dna.primaryDescription) return null;

  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <SectionHeader
        title="Trader Profile"
        description="Who you are as a trader: your archetype, natural style, and where you're strong or still developing."
      />

      <div className="rounded-xl bg-surface-2 border border-white/[0.05] p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Dna className="w-4 h-4 text-accent shrink-0" />
          <span className="text-base font-semibold tracking-tight">
            {dna.primaryLabel}
          </span>
          {confidencePct > 0 && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
              {confidencePct}% confidence
            </span>
          )}
          {dna.secondaryLabel && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface-3 text-muted-foreground">
              + {dna.secondaryLabel}
            </span>
          )}
        </div>
        {dna.primaryDescription && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {dna.primaryDescription}
          </p>
        )}
        {dna.evolvedTraits.length > 0 && (
          <p className="text-[11px] text-accent/80">
            Recently evolving: {dna.evolvedTraits.join(", ")}
          </p>
        )}
      </div>

      {styles.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {styles.map((s) => (
            <MetricTile
              key={s.label}
              label={s.label}
              value={<span className="text-base sm:text-lg">{s.value}</span>}
              tone="muted"
              hint={s.hint}
            />
          ))}
        </div>
      )}

      {(strengths.length > 0 || weaknesses.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 stat-label">
              <ThumbsUp className="w-3.5 h-3.5 text-success" />
              Strongest Traits
            </div>
            {strengths.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {strengths.map((s) => (
                  <span
                    key={s.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/5 px-2.5 py-1 text-xs"
                  >
                    <span className="font-medium">
                      {SIGNAL_LABELS[s.key] ?? s.key}
                    </span>
                    <span className="tabular-nums text-success">{s.value}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No standout strengths scored with confidence yet.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 stat-label">
              <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              Areas to Develop
            </div>
            {weaknesses.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {weaknesses.map((s) => (
                  <span
                    key={s.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-amber-500/5 px-2.5 py-1 text-xs"
                  >
                    <span className="font-medium">
                      {SIGNAL_LABELS[s.key] ?? s.key}
                    </span>
                    <span className="tabular-nums text-warning">{s.value}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nothing scoring low with confidence. Keep it up.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
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

  const pnlLabels = series.map((p) =>
    new Date(p.t * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(spansYears ? { year: "2-digit" as const } : {}),
    }),
  );

  const pnlData = {
    labels: pnlLabels,
    datasets: [
      {
        ...accentLineDataset,
        label: "Cumulative Realized P&L",
        data: series.map((p) => p.cumRealizedPnlSol),
      },
    ],
  };

  // Collapse repeated consecutive date ticks (e.g. many "Jul 13") to a single
  // labelled tick so the axis stays readable at 360px instead of a wall of
  // identical dates. Chart.js still plots every point; only labels are thinned.
  const pnlXScale = {
    ...baseScales.x,
    ticks: {
      ...baseScales.x.ticks,
      autoSkip: true,
      maxRotation: 0,
      maxTicksLimit: 6,
      callback(this: unknown, _val: unknown, index: number): string | null {
        const label = pnlLabels[index];
        if (label == null) return null;
        return index > 0 && pnlLabels[index - 1] === label ? "" : label;
      },
    },
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
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-2">
            <div className="min-w-0">
              <div className="stat-label mb-0.5">Cumulative Realized P&L</div>
              <p className="text-[11px] text-muted-foreground">
                Your running total of locked-in profit and loss, trade by
                trade. Tap or hover the line for the value at that point.
              </p>
            </div>
            <ChartRangeToggle value={range} onChange={setRange} className="shrink-0 self-start" />
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
                scales: { ...baseScales, x: pnlXScale },
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

/** Plain-language meaning of a score band for the detail view. */
function scoreBandLabel(value: number): string {
  if (value >= 80) return "Very strong";
  if (value >= 65) return "Strong";
  if (value >= 45) return "Moderate";
  if (value >= 25) return "Developing";
  return "Weak";
}

/** Inline explainability panel for one signal (tap-to-open, no hover needed). */
const SIGNAL_CLASS_LABEL: Record<string, string> = {
  elite: "Elite",
  strong: "Strong",
  developing: "Developing",
  weak: "Weak",
  insufficient: "Insufficient data",
  descriptive: "Descriptive only",
};

function SignalDetail({ s }: { s: RealTradingSignal }) {
  const meta = SIGNAL_EXPLAIN[s.key];
  const detail = s.detail;
  const insufficient = s.tier === "insufficient";
  const cmp = s.comparison;
  // Prefer the backend's structured evidence metadata; fall back to the static
  // frontend dictionary for older cached snapshots without `detail`.
  const measures = detail?.measures ?? meta?.meaning ?? SIGNAL_HINTS[s.key] ?? "";
  const improvementList =
    detail?.improvement && detail.improvement.length > 0
      ? detail.improvement
      : meta?.improve
        ? [meta.improve]
        : [];
  const rows: Array<{ k: string; v: React.ReactNode }> = [
    { k: "Score", v: insufficient ? "Not enough data" : `${s.value} / 100` },
    {
      k: "Classification",
      v: detail?.classification
        ? (SIGNAL_CLASS_LABEL[detail.classification] ?? detail.classification)
        : insufficient
          ? "Insufficient data"
          : scoreBandLabel(s.value),
    },
    {
      k: "What it measures",
      v: insufficient
        ? "There is not enough evidence to score this reliably yet."
        : measures,
    },
    { k: "Confidence", v: TIER_LABEL[s.tier] ?? s.tier },
    {
      k: "Sample size",
      v: `${s.sampleSize} observation${s.sampleSize === 1 ? "" : "s"}`,
    },
    { k: "Reads from", v: meta?.basis ?? "Analyzed trading history" },
    {
      k: "30-day change",
      v:
        cmp?.status === "comparable" && s.delta30d != null
          ? `${s.delta30d > 0 ? "+" : ""}${s.delta30d} vs ${s.previousValue} (30 days ago)`
          : cmp?.status === "new"
            ? "First reading - no prior period to compare"
            : "Not enough comparable prior data",
    },
  ];
  if (s.evidence.length > 0) {
    rows.push({ k: "Main evidence", v: s.evidence.join(" · ") });
  }
  if (!insufficient && detail?.expectedImpact) {
    rows.push({ k: "Expected impact", v: detail.expectedImpact });
  }
  return (
    <div className="rounded-xl bg-surface-2 border border-white/[0.06] px-3.5 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          {SIGNAL_LABELS[s.key] ?? s.key}
        </span>
        {meta?.direction === "descriptive" && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Style, not a grade
          </span>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-1.5">
        {rows.map((r) => (
          <div
            key={r.k}
            className="flex items-start justify-between gap-3 text-xs"
          >
            <dt className="text-muted-foreground shrink-0">{r.k}</dt>
            <dd className="text-right text-foreground/90 leading-snug break-words min-w-0">
              {r.v}
            </dd>
          </div>
        ))}
      </dl>
      {!insufficient && improvementList.length > 0 && (
        <div className="pt-1 border-t border-white/[0.05]">
          <div className="stat-label mb-1">How to improve</div>
          <ul className="space-y-0.5">
            {improvementList.map((a) => (
              <li
                key={a}
                className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5"
              >
                <ChevronRight className="w-3 h-3 shrink-0 mt-0.5 text-accent/70" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
      {detail?.limitations && detail.limitations.length > 0 && (
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed pt-1">
          Limitations: {detail.limitations.join(" ")}
        </p>
      )}
    </div>
  );
}

function IntelligenceSection({ analysis }: { analysis: RealAnalysisSummary }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (analysis.signals.length === 0) return null;
  const open = analysis.signals.find((s) => s.key === openKey) ?? null;
  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <SectionHeader
        title="Trader Intelligence"
        description="Twelve signals scored 0-100 from your history. Tap any signal for what it means, its evidence, confidence and 30-day change."
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {analysis.signals.map((s: RealTradingSignal) => {
          // Confidence gating: never present a precise score without enough
          // evidence. Older snapshots (no tier) are shown as before.
          const insufficient = s.tier === "insufficient";
          return (
            <MetricTile
              key={s.key}
              label={SIGNAL_LABELS[s.key] ?? s.key}
              value={insufficient ? "—" : s.value}
              delta={insufficient ? null : signalDelta(s)}
              tone={insufficient ? "default" : signalTone(s.key, s.value)}
              active={openKey === s.key}
              onClick={() =>
                setOpenKey((prev) => (prev === s.key ? null : s.key))
              }
              data-testid={`signal-${s.key}`}
            />
          );
        })}
      </div>
      {open && <SignalDetail s={open} />}
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
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium break-words min-w-0">{insight.title}</div>
        {insight.evidenceCount != null && insight.evidenceCount > 0 && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground tabular-nums shrink-0 mt-0.5">
            {insight.evidenceCount}× evidence
          </span>
        )}
      </div>
      <div className="text-muted-foreground text-xs mt-0.5 leading-relaxed">
        {insight.description}
      </div>
      {insight.guidance && (
        <div className="text-[11px] text-foreground/70 mt-1 leading-relaxed flex items-start gap-1.5">
          <ChevronRight className="w-3 h-3 shrink-0 mt-0.5 text-accent/70" />
          {insight.guidance}
        </div>
      )}
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
  const h = analysis.walletHealth;
  // Current Exposure and Concentration are only meaningful when open positions
  // were reconciled against LIVE on-chain balances. If that reconciliation is
  // unavailable (holdingsVerified false / no portfolio), the position values are
  // unverified trade-history estimates that can overstate reality - so we show
  // "Unverified" instead of a misleading number, and prompt a refresh.
  const holdingsVerified =
    holdingsAreVerified(analysis) && analysis.portfolio != null;
  const exposureSol =
    analysis.portfolio != null
      ? analysis.portfolio.analyzedTradingPortfolioSol
      : null;
  const positions = canonicalOpenPositions(analysis);
  const unrealized = positions.reduce(
    (s, p) => s + (p.unrealizedPnlSol ?? 0),
    0,
  );
  const unpricedCount = analysis.portfolio?.counts.unpriced ?? 0;
  const concentrationTone: MetricTone =
    h.concentrationRisk > 60
      ? "negative"
      : h.concentrationRisk > 35
        ? "warning"
        : "positive";

  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-5">
      <SectionHeader
        title="Risk & Exposure"
        description="What you are risking right now: your live, reconciled current portfolio only. Historical sizing and loss stats live in Detailed Metrics."
      />

      {/* Current Portfolio Risk - live, reconciled wallet only. */}
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          <MetricTile
            label="Current Exposure"
            value={
              holdingsVerified && exposureSol != null
                ? `${fmtSolMag(exposureSol)} SOL`
                : "Unverified"
            }
            tone={holdingsVerified ? "default" : "warning"}
            hint={
              holdingsVerified
                ? "Current value of the verified, traced open positions reconciled against your live on-chain balances."
                : "Live holdings could not be verified, so exposure from trade history is not shown (it can include tokens you've already sold or transferred). Hit Refresh to reconcile."
            }
          />
          <MetricTile
            label="Concentration"
            value={holdingsVerified ? `${h.concentrationRisk}%` : "Unverified"}
            tone={holdingsVerified ? concentrationTone : "warning"}
            hint="How much of your current holdings sit in a few tokens. Lower is safer."
          />
          <MetricTile
            label="Open Positions"
            value={holdingsVerified ? positions.length : "Unverified"}
            tone={holdingsVerified ? "default" : "warning"}
            hint="Count of live-reconciled current positions traceable to your swap history."
          />
          <MetricTile
            label="Unrealized P&L"
            value={
              holdingsVerified ? `${fmtSignedSolMag(unrealized)} SOL` : "Unverified"
            }
            tone={
              !holdingsVerified
                ? "warning"
                : unrealized > 0
                  ? "positive"
                  : unrealized < 0
                    ? "negative"
                    : "default"
            }
            hint="Current estimated P&L on your verified open positions. Depends on live prices; hidden when holdings can't be verified."
          />
          <MetricTile
            label="Unpriced Holdings"
            value={holdingsVerified ? unpricedCount : "Unverified"}
            tone={holdingsVerified && unpricedCount > 0 ? "warning" : "default"}
            hint="Current holdings we could not price. They are disclosed and excluded from exposure (never counted as zero)."
          />
          <MetricTile
            label="Dead / Dust"
            value={`${h.deadPositions} / ${h.dustPositions}`}
            tone={h.deadPositions > 0 ? "warning" : "default"}
            hint="Current positions that look inactive or worthless / positions too small to matter."
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
      </div>
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
        <div className={cn("text-sm font-mono font-medium tabular-nums", pnlColor(t.realizedPnlSol))}>
          {fmtSignedSolMag(t.realizedPnlSol)} SOL
        </div>
        <div className={cn("text-[10px] font-mono tabular-nums", pnlColor(t.roiPercent))}>
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
          {fmtNum(p.tokenAmount)} tokens · cost {fmtSolMag(p.costBasisSol)} SOL
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

function HoldingsSection({
  analysis,
  performance,
  onRefresh,
  refreshBusy,
}: {
  analysis: RealAnalysisSummary;
  performance: RealPerformanceReport | null;
  onRefresh: () => void;
  refreshBusy: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  // Canonical rule: current open positions are ONLY the reconciled set derived
  // from the live-balance reconciliation audit. When holdings could not be
  // verified we show nothing here (never historical/ghost positions) and prompt
  // a refresh. canonicalOpenPositions enforces this at a single choke point.
  const holdingsVerified = holdingsAreVerified(analysis);
  const positions = [...canonicalOpenPositions(analysis)].sort(
    (a, b) =>
      (b.currentValueSol ?? b.costBasisSol) -
      (a.currentValueSol ?? a.costBasisSol),
  );
  const shown = showAll ? positions : positions.slice(0, 6);
  const winners = performance?.topWinners ?? [];
  const losers = performance?.topLosers ?? [];

  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <SectionHeader
        title="Holdings & Trades"
        description="Your live current open positions, kept separate from your best and worst completed round trips (historical)."
      />

      {!holdingsVerified && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-amber-100">
                Open positions unverified
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed mt-0.5">
                BlackPebble could not confirm your current on-chain token
                balances. Refresh to try again. Your completed trades and
                realized P&amp;L below remain accurate.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshBusy}
            className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline disabled:opacity-50"
          >
            {refreshBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Refresh
          </button>
        </div>
      )}

      {holdingsVerified && (
        <div>
          <div className="stat-label mb-2">
            Current Open Positions
            {positions.length > 0 ? ` (${positions.length})` : ""}
          </div>
          {positions.length > 0 ? (
            <>
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
                      Show all {positions.length}{" "}
                      <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
              )}
              <p className="text-[11px] text-muted-foreground/80 mt-2 leading-relaxed">
                Live-reconciled tokens you currently hold, traceable to your swap
                history. Quantities are capped to your on-chain balance.
              </p>
            </>
          ) : (
            <p className="rounded-xl bg-surface-2 border border-white/[0.05] px-4 py-3 text-xs text-muted-foreground">
              No verified open positions. Your traced holdings have all been
              closed or are below dust.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="stat-label">Historical Top Winners</div>
          {winners.length > 0 ? (
            winners.map((t) => <TokenPerfRow key={t.tokenMint} t={t} />)
          ) : (
            <p className="rounded-xl bg-surface-2 border border-white/[0.05] px-4 py-3 text-xs text-muted-foreground">
              No completed winning trades yet.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <div className="stat-label">Historical Top Losers</div>
          {losers.length > 0 ? (
            losers.map((t) => <TokenPerfRow key={t.tokenMint} t={t} />)
          ) : (
            <p className="rounded-xl bg-surface-2 border border-white/[0.05] px-4 py-3 text-xs text-muted-foreground">
              No completed losing trades yet.
            </p>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
        Winners and losers are completed historical round trips, not current
        holdings.
      </p>
    </section>
  );
}

// ── 7. Historical Evolution ──────────────────────────────────────────────────

function EvolutionSection({ events }: { events: RealTimelineEvent[] }) {
  // Defensive frontend dedup of any legacy duplicate rows the backend read-time
  // dedup did not cover, keyed by canonical identity (type + title + body).
  const seen = new Set<string>();
  const deduped = events.filter((ev) => {
    const id = `${ev.eventType}|${ev.title}|${ev.body ?? ""}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const [open, setOpen] = useState(false);
  if (deduped.length === 0) return null;
  const shown = open ? deduped : deduped.slice(0, 3);
  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <SectionHeader
        title="Your Evolution"
        description="Milestones BlackPebble has detected as your trading develops."
      />
      <div className="space-y-1.5">
        {shown.map((ev) => (
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
      {deduped.length > 3 && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 text-xs text-accent hover:underline"
        >
          {open ? (
            <>
              Show less <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              Show full history ({deduped.length}){" "}
              <ChevronDown className="w-3 h-3" />
            </>
          )}
        </button>
      )}
    </section>
  );
}

// ── 8. Growth & Coaching (AI architecture preview) ───────────────────────────

/**
 * Forward-looking coaching preview. This is intentionally NOT AI yet — it
 * derives a small set of practical focus areas from the same gradeable signals
 * and their static `improve` guidance, and states plainly that personalised AI
 * coaching is coming. It establishes the surface future coaching will populate.
 */
const COACHING_PRIORITY_TONE: Record<string, string> = {
  high: "bg-danger/10 text-danger",
  medium: "bg-amber-500/10 text-warning",
  low: "bg-surface-3 text-muted-foreground",
};

function CoachingSection({ analysis }: { analysis: RealAnalysisSummary }) {
  const coaching = analysis.coaching;

  // Prefer the backend's deterministic coaching context (rule-based, evidence
  // -backed). Older cached snapshots without it fall back to a signal-derived
  // focus list so the section is never empty on legacy data.
  const insights = coaching?.insights ?? [];
  const fallback = !coaching
    ? deriveStrengthsWeaknesses(analysis.signals)
        .weaknesses.map((s) => ({
          key: s.key,
          label: SIGNAL_LABELS[s.key] ?? s.key,
          value: s.value,
          improve: SIGNAL_EXPLAIN[s.key]?.improve ?? null,
        }))
        .filter((f) => f.improve != null)
    : [];

  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <SectionHeader
          title="Growth & Coaching"
          description="Evidence-backed focus areas, generated from your on-chain history."
        />
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/10 text-accent shrink-0">
          BlackPebble Coaching Insights
        </span>
      </div>

      {insights.length > 0 ? (
        <div className="space-y-2">
          {insights.map((f) => (
            <div
              key={f.key}
              className="rounded-xl bg-surface-2 border border-white/[0.05] px-3.5 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium break-words min-w-0">
                  {f.title}
                </span>
                <span
                  className={cn(
                    "text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0",
                    COACHING_PRIORITY_TONE[f.priority] ??
                      "bg-surface-3 text-muted-foreground",
                  )}
                >
                  {f.priority}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {f.body}
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-1 leading-relaxed">
                {f.basis}
              </p>
            </div>
          ))}
        </div>
      ) : fallback.length > 0 ? (
        <div className="space-y-2">
          {fallback.map((f) => (
            <div
              key={f.key}
              className="rounded-xl bg-surface-2 border border-white/[0.05] px-3.5 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{f.label}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
                  {f.value} / 100
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {f.improve}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-surface-2 border border-white/[0.05] px-4 py-3 text-xs text-muted-foreground leading-relaxed">
          No clear weak spots scored with confidence right now. As you trade
          more, focus areas will appear here.
        </p>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-accent/15 bg-accent/[0.04] px-3.5 py-2.5">
        <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          These are rule-based insights, not AI. A future AI coach will consume
          this same structured analysis (behavior patterns, how you've changed,
          and what to improve next) and turn it into personalised guidance.
        </p>
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
            hint="Share of completed round trips that closed in profit. Breakeven trades count as non-wins."
          />
          <MetricTile
            label="Completed Round Trips"
            value={m.closedRoundTrips}
            hint="FIFO-matched buy-to-sell results (not the same as swaps)."
          />
          <MetricTile
            label="Swaps Analyzed"
            value={m.totalTrades}
            hint="Individual parsed on-chain executions (buys plus sells)."
          />
          <MetricTile
            label="Buys / Sells"
            value={`${m.buyCount} / ${m.sellCount}`}
            hint="Swap sides. Buys plus sells equals total swaps analyzed."
          />
          <MetricTile
            label="Avg Gain"
            value={`${fmtSolMag(m.avgGainSol)} SOL`}
            tone={m.avgGainSol > 0 ? "positive" : "default"}
            hint="Average size of your winning completed round trips (historical)."
          />
          <MetricTile
            label="Avg Loss"
            value={`${fmtSolMag(m.avgLossSol)} SOL`}
            tone={m.avgLossSol > 0 ? "negative" : "default"}
            hint="Average size of your losing completed round trips (historical)."
          />
          <MetricTile
            label="Largest Gain"
            value={`${fmtSolMag(m.largestGainSol)} SOL`}
            tone={m.largestGainSol > 0 ? "positive" : "default"}
            hint="Your single best realized completed round trip (historical)."
          />
          <MetricTile
            label="Largest Loss"
            value={`${fmtSolMag(m.largestLossSol)} SOL`}
            tone={m.largestLossSol > 0 ? "negative" : "default"}
            hint="Your single worst realized completed round trip (historical)."
          />
          <MetricTile
            label="Avg Entry Size"
            value={`${fmtSolMag(m.avgPositionSizeSol)} SOL`}
            hint="Average SOL committed per historical buy (mean initial position size across all analyzed buys)."
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
            label="Swaps / Week"
            value={m.tradingFrequencyPerWeek.toFixed(1)}
          />
          <MetricTile label="Unique Tokens" value={m.uniqueTokensTraded} />
          <MetricTile
            label="Breakeven Trades"
            value={m.breakevenCount ?? 0}
            hint="Completed round trips within a tiny rounding band. Not counted as wins or losses."
          />
          <MetricTile
            label={m.avgMarketCapIsFdv ? "Avg FDV Bought" : "Avg Mkt Cap Bought"}
            value={m.avgMarketCapPurchasedUsd != null ? fmtUsdSmart(m.avgMarketCapPurchasedUsd) : "—"}
            hint={
              m.avgMarketCapIsFdv
                ? "Fully-diluted valuation of buys. True market cap was unavailable, so this is labeled FDV, not market cap."
                : "Circulating market cap of buys, when available (not FDV)."
            }
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
        {holdingsAreVerified(analysis)
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
 * Structured as a trader story where each section answers a different question:
 * identity (wallet summary → trader profile) → performance → behavior →
 * intelligence scores → risk → holdings & trades → detailed metrics →
 * evolution → growth & coaching.
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
    isError,
    error,
    refetch,
    performanceFailed,
    syncMutation,
    syncError,
  } = useRealAnalysis();
  const solBalance = useWalletSolBalance();
  const solUsd = useSolUsd();
  const enrichMutation = useMutation({
    mutationFn: async () => {
      await api.realAnalysis.enrich(wallet!);
    },
    onSuccess: () => {
      // Recompute analysis so entry/exit quality picks up newly cached candles.
      syncMutation.mutate();
    },
  });
  const enriching = enrichMutation.isPending || syncMutation.isPending;

  if (!connected || !wallet) {
    return (
      <div className="rounded-2xl bg-card shadow-card p-6 space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
          Connect a wallet to analyze your real on-chain trading history.
          BlackPebble reads public blockchain data only - it never requests seed
          phrases, private keys, approvals, or transaction signing.
        </p>
        <WalletMultiButton />
        <p className="text-xs text-muted-foreground/80 leading-relaxed max-w-lg">
          Connecting lets BlackPebble read public wallet data. It does not give
          permission to move funds. Wallet utility actions require a separate
          signature.
        </p>
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

  if (!analysis) {
    // Never blank the page on a fetch failure - show a recoverable error state.
    return (
      <div className="rounded-2xl bg-card shadow-card p-6 space-y-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Couldn't load your trading analysis
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-lg">
              {isError && error?.message
                ? error.message
                : "The analysis service is temporarily unavailable. Your on-chain history is safe - this is only a display issue."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 text-sm text-accent hover:underline disabled:opacity-50"
        >
          {isFetching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Retry
        </button>
      </div>
    );
  }

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

  // Report story flow (Phase 2B, Part 10):
  // Trader Profile → Executive Summary (+coverage) → Performance → Trader
  // Intelligence (strengths/dev) → Behavioral → Current Risk → Historical Risk
  // → Current Holdings (+quality) → Detailed Metrics → Evolution → Coaching.
  return (
    <div className="space-y-5">
      <TraderProfileSection analysis={analysis} />
      <WalletSummaryHero
        analysis={analysis}
        solBalance={solBalance}
        solUsd={solUsd}
        onSync={() => syncMutation.mutate()}
        syncBusy={syncMutation.isPending || isFetching}
        syncError={syncError}
      />
      <CoverageBanner analysis={analysis} />
      {analysis.historyTruncated && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3.5 py-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/90 leading-relaxed">
            Analysis may be incomplete due to transaction history limits. This
            wallet has more swaps than a single sync can reconstruct, so older
            trades are not yet included in the numbers below.
          </p>
        </div>
      )}
      {performance ? (
        <PerformanceSection performance={performance} />
      ) : (
        performanceFailed && (
          <div className="rounded-2xl bg-card shadow-card p-5 text-xs text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
            Performance charts are temporarily unavailable. The rest of your
            analysis is shown below.
          </div>
        )
      )}
      <IntelligenceSection analysis={analysis} />
      <EntryIntelligenceSection
        analysis={analysis}
        onEnrich={() => enrichMutation.mutate()}
        enriching={enriching}
      />
      <ExitIntelligenceSection
        analysis={analysis}
        onEnrich={() => enrichMutation.mutate()}
        enriching={enriching}
      />
      <TradeReplaySection wallet={wallet} />
      <BehaviorSection analysis={analysis} />
      <RiskSection analysis={analysis} />
      <HistoricalRiskSection analysis={analysis} />
      <HoldingsSection
        analysis={analysis}
        performance={performance}
        onRefresh={() => syncMutation.mutate()}
        refreshBusy={syncMutation.isPending || isFetching}
      />
      <HoldingsQualitySection analysis={analysis} />
      <CurrentLiquiditySection analysis={analysis} />
      <DetailedMetricsSection analysis={analysis} />
      <EvolutionSection events={timeline} />
      <CoachingSection analysis={analysis} />
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

  const previewSignals = selectPreviewSignals(analysis?.signals ?? []);

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
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 min-w-0">
            <Dna className="w-4 h-4 text-accent shrink-0" />
            <span className="text-sm font-medium truncate">
              {analysis.personality.personality}
            </span>
          </div>
          {previewSignals.length > 0 && (
            // 2 tiles on the first row, the third full-width beneath, so signal
            // labels stay fully readable on mobile (no CONVIC.../DIVERSIFICA...).
            <div className="grid grid-cols-2 gap-2">
              {previewSignals.map((s, i) => (
                <MetricTile
                  key={s.key}
                  size="sm"
                  label={SIGNAL_LABELS[s.key] ?? s.key}
                  value={s.value}
                  tone={signalTone(s.key, s.value)}
                  className={cn(i === 2 && "col-span-2")}
                />
              ))}
            </div>
          )}
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

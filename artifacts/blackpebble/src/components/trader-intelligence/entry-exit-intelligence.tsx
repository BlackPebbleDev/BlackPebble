/**
 * Entry / Exit Intelligence + Current Liquidity sections (Phase 2C, Part 12 + 8).
 *
 * Compact, report-style sections: one executive summary, a few supporting
 * metrics, pattern rows, an expandable methodology, honest limitations, and a
 * link to supporting trades (Trade Replay). Copy uses calm, evidence-based
 * language and hindsight labels. No metric here duplicates another section.
 *
 * These live in the trader-intelligence module (not the analysis monolith) so
 * the report is composed from focused, testable section components.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp, LogOut, Droplets } from "lucide-react";
import type {
  RealAnalysisSummary,
  RealEntryQualitySummary,
  RealExitQualitySummary,
  RealLiquidityRiskSummary,
  RealConfidenceTier,
  RealLiquidityBand,
} from "@/lib/api";
import { cn } from "@/lib/utils";

function pct(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}
function scoreText(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : `${Math.round(v)}`;
}

const CONFIDENCE_LABEL: Record<RealConfidenceTier, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  insufficient: "Insufficient data",
};

function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "good" | "warn" | "bad";
}) {
  const tones: Record<string, string> = {
    muted: "bg-surface-3 text-muted-foreground",
    good: "bg-success/10 text-success",
    warn: "bg-amber-500/10 text-warning",
    bad: "bg-danger/10 text-danger",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

function confidenceTone(t: RealConfidenceTier): "good" | "warn" | "muted" {
  return t === "high" ? "good" : t === "insufficient" || t === "low" ? "muted" : "warn";
}

function SectionShell({
  icon,
  title,
  description,
  coverage,
  confidence,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  coverage: number;
  confidence: RealConfidenceTier;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5 text-accent shrink-0">{icon}</span>
          <div className="space-y-0.5 min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Badge tone={coverage >= 60 ? "good" : coverage > 0 ? "warn" : "muted"}>
            {coverage}% coverage
          </Badge>
          <Badge tone={confidenceTone(confidence)}>{CONFIDENCE_LABEL[confidence]}</Badge>
        </div>
      </div>
      {children}
    </section>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
      <span className="text-xs text-muted-foreground min-w-0 break-words">{label}</span>
      <span className="text-sm font-semibold tabular-nums shrink-0">{value}</span>
    </div>
  );
}

function Methodology({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-xs font-medium text-muted-foreground">
          Methodology &amp; limitations
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <ul className="space-y-1 px-3 pb-3 text-[11px] text-muted-foreground leading-relaxed">
          {items.map((l, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
              <span className="break-words">{l}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ENTRY_PATTERN_LABEL: Record<string, string> = {
  rapid_rise: "Buying after a run-up",
  pullback: "Buying into a pullback",
  consolidation: "Buying during consolidation",
  breakdown: "Buying into a breakdown",
  insufficient_data: "Insufficient data",
};

const EXIT_PATTERN_LABEL: Record<string, string> = {
  near_local_high: "Exiting near a local high",
  before_further_upside: "Exiting before further upside",
  before_further_downside: "Exiting before further downside",
  sharp_reversal: "Exiting on a reversal",
  panic: "Panic-style exit",
  insufficient_data: "Insufficient data",
};

function ProcessingNote({
  status,
  onEnrich,
  enriching,
  kind,
}: {
  status: string | null | undefined;
  onEnrich?: () => void;
  enriching?: boolean;
  kind: string;
}) {
  const label =
    status === "processing"
      ? `Historical price data for ${kind} is not loaded yet.`
      : status === "partial"
        ? `Only part of your ${kind} history has price data so far.`
        : `Historical price data for ${kind} is unavailable.`;
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-3 space-y-2">
      <p className="text-xs text-muted-foreground leading-relaxed">{label}</p>
      {onEnrich && (
        <button
          type="button"
          onClick={onEnrich}
          disabled={enriching}
          className="rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent disabled:opacity-60"
        >
          {enriching ? "Loading historical prices…" : "Load historical price data"}
        </button>
      )}
    </div>
  );
}

export function EntryIntelligenceSection({
  analysis,
  onOpenTrades,
  onEnrich,
  enriching,
}: {
  analysis: RealAnalysisSummary;
  onOpenTrades?: () => void;
  onEnrich?: () => void;
  enriching?: boolean;
}) {
  const e: RealEntryQualitySummary | null | undefined = analysis.entryQuality;
  if (!e) return null;
  const ready = e.analyzedEntries > 0;

  return (
    <SectionShell
      icon={<TrendingUp className="h-4 w-4" />}
      title="Entry Intelligence"
      description="How your entries looked against actual historical price action."
      coverage={e.coveragePercent}
      confidence={e.confidence}
    >
      {!ready ? (
        <ProcessingNote status={analysis.enrichmentStatus} onEnrich={onEnrich} enriching={enriching} kind="entries" />
      ) : (
        <>
          <div className="rounded-xl bg-surface-2 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Average entry score</div>
              <div className="text-2xl font-bold tabular-nums">{scoreText(e.avgEntryScore)}<span className="text-sm text-muted-foreground">/100</span></div>
            </div>
            <div className="text-right min-w-0">
              <div className="text-[11px] text-muted-foreground">Strongest pattern</div>
              <div className="text-sm font-medium break-words">
                {e.bestSupportedPattern ? ENTRY_PATTERN_LABEL[e.bestSupportedPattern] : "—"}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatRow label="Median score" value={scoreText(e.medianEntryScore)} />
            <StatRow label="Positive follow-through" value={pct(e.positiveFollowThroughRate)} />
            <StatRow label="Bought after a run-up" value={pct(e.buyingAfterRunUpRate)} />
            <StatRow label="Bought a pullback" value={pct(e.pullbackEntryRate)} />
            <StatRow label="Immediate adverse move" value={pct(e.immediateAdverseMoveRate)} />
            <StatRow label="Entries analyzed" value={`${e.analyzedEntries}/${e.eligibleEntries}`} />
          </div>
          {onOpenTrades && (
            <button
              type="button"
              onClick={onOpenTrades}
              className="text-xs font-medium text-accent hover:underline"
            >
              Inspect supporting trades →
            </button>
          )}
        </>
      )}
      <Methodology
        items={[
          "Entry score (0-100): base 50, adjusted by post-entry follow-through, upside that became available, and immediate adverse move. Fully deterministic.",
          "All returns are candle-derived and measured relative to the entry-reference price.",
          ...e.limitations,
        ]}
      />
    </SectionShell>
  );
}

export function ExitIntelligenceSection({
  analysis,
  onOpenTrades,
  onEnrich,
  enriching,
}: {
  analysis: RealAnalysisSummary;
  onOpenTrades?: () => void;
  onEnrich?: () => void;
  enriching?: boolean;
}) {
  const x: RealExitQualitySummary | null | undefined = analysis.exitQuality;
  if (!x) return null;
  const ready = x.analyzedExits > 0;

  return (
    <SectionShell
      icon={<LogOut className="h-4 w-4" />}
      title="Exit Intelligence"
      description="Price action after your exits, shown as historical hindsight rather than prediction."
      coverage={x.coveragePercent}
      confidence={x.confidence}
    >
      {!ready ? (
        <ProcessingNote status={analysis.enrichmentStatus} onEnrich={onEnrich} enriching={enriching} kind="exits" />
      ) : (
        <>
          <div className="rounded-xl bg-surface-2 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Average exit score</div>
              <div className="text-2xl font-bold tabular-nums">{scoreText(x.avgExitScore)}<span className="text-sm text-muted-foreground">/100</span></div>
            </div>
            <div className="text-right min-w-0">
              <div className="text-[11px] text-muted-foreground">Captured favorable move</div>
              <div className="text-sm font-medium tabular-nums">
                {x.avgCapturedFavorableExcursion == null ? "—" : `${x.avgCapturedFavorableExcursion}%`}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatRow label="Median score" value={scoreText(x.medianExitScore)} />
            <StatRow label="Strong profit capture" value={pct(x.strongProfitCaptureRate)} />
            <StatRow label="Exited before more upside" value={pct(x.earlyExitRate)} />
            <StatRow label="Avoided further downside" value={pct(x.downsideAvoidanceRate)} />
            <StatRow label="Panic-style exits" value={pct(x.panicExitRate)} />
            <StatRow label="Exits analyzed" value={`${x.analyzedExits}/${x.eligibleExits}`} />
          </div>
          {onOpenTrades && (
            <button
              type="button"
              onClick={onOpenTrades}
              className="text-xs font-medium text-accent hover:underline"
            >
              Inspect supporting trades →
            </button>
          )}
        </>
      )}
      <Methodology
        items={[
          "Exit score (0-100): base 50, adjusted by how much of the in-trade high was captured, downside avoided after exit, and upside left after exit.",
          "Post-exit figures are historical hindsight; they do not imply the move was predictable.",
          ...x.limitations,
        ]}
      />
    </SectionShell>
  );
}

const BAND_LABEL: Record<RealLiquidityBand, string> = {
  deep: "Deep",
  adequate: "Adequate",
  thin: "Thin",
  fragile: "Fragile",
  unavailable: "Unavailable",
};

const BAND_TONE: Record<RealLiquidityBand, "good" | "warn" | "bad" | "muted"> = {
  deep: "good",
  adequate: "good",
  thin: "warn",
  fragile: "bad",
  unavailable: "muted",
};

export function CurrentLiquiditySection({
  analysis,
}: {
  analysis: RealAnalysisSummary;
}) {
  const l: RealLiquidityRiskSummary | null | undefined = analysis.liquidityRisk;
  if (!l || l.positions.length === 0) return null;

  return (
    <SectionShell
      icon={<Droplets className="h-4 w-4" />}
      title="Current Holdings Liquidity"
      description="How easily your current holdings could be exited, by live pool depth."
      coverage={Math.round(l.liquidityCoverage * 100)}
      confidence={l.confidence}
    >
      <div className="grid grid-cols-2 gap-2">
        <StatRow
          label="Weighted liquidity quality"
          value={l.weightedLiquidityQuality == null ? "—" : `${l.weightedLiquidityQuality}/100`}
        />
        <StatRow label="Fragile positions" value={String(l.fragilePositionsCount)} />
        <StatRow
          label="Largest holding vs pool"
          value={l.largestHoldingToLiquidityPct == null ? "—" : `${l.largestHoldingToLiquidityPct.toFixed(1)}%`}
        />
        <StatRow label="Unavailable liquidity" value={String(l.unavailablePositionsCount)} />
      </div>
      <div className="space-y-1.5">
        {l.positions.slice(0, 8).map((p) => (
          <div
            key={p.mint}
            className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2"
          >
            <span className="text-sm font-medium truncate min-w-0">
              {p.symbol ?? `${p.mint.slice(0, 4)}…${p.mint.slice(-4)}`}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {p.holdingToLiquidityPct != null && (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {p.holdingToLiquidityPct.toFixed(1)}% of pool
                </span>
              )}
              <Badge tone={BAND_TONE[p.band]}>{BAND_LABEL[p.band]}</Badge>
            </div>
          </div>
        ))}
      </div>
      <Methodology
        items={[
          "Liquidity bands: Deep ≥ $250k, Adequate ≥ $50k, Thin ≥ $10k, Fragile below that. Exitability compares holding value to pool liquidity.",
          "These are calm classifications, not exact slippage estimates.",
          "Current holdings only, never mixed with historical trade liquidity.",
          ...l.limitations,
        ]}
      />
    </SectionShell>
  );
}

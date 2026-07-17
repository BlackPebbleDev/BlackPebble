/**
 * Trade Replay (Phase 2C, Part 11 + 19).
 *
 * An evidence drill-down for completed historical round trips. Not video
 * playback: it tells the lifecycle story (what was bought, how the position was
 * built, price action before/during/after, how it was exited, what the data
 * could and could not support).
 *
 * Owner/admin gated on the backend; on a 401/403 this surface hides silently so
 * the public analysis page is unaffected. Current-holdings protections are
 * untouched - Trade Replay only ever shows COMPLETED historical trades.
 *
 * Mobile: full-screen sheet with an accessible close control and no horizontal
 * overflow. Desktop: right side panel. The price-path chart uses a lightweight
 * SVG renderer behind a stable boundary so a richer renderer can be swapped in
 * later without a product rewrite.
 */

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type {
  RealTradeSummary,
  RealTradeReplay,
  RealHistoricalCandle,
} from "@/lib/api";
import { api } from "@/lib/api";
import { fmtSignedSolMag } from "@/lib/format";
import { cn } from "@/lib/utils";

function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const d = Math.floor(sec / 86400);
  if (d >= 1) return `${d}d`;
  const h = Math.floor(sec / 3600);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(sec / 60);
  return m >= 1 ? `${m}m` : `${Math.round(sec)}s`;
}

function fmtDate(sec: number | null): string {
  if (sec == null) return "—";
  return new Date(sec * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function tokenLabel(t: { symbol: string | null; mint: string }): string {
  return t.symbol ?? `${t.mint.slice(0, 4)}…${t.mint.slice(-4)}`;
}

// ── Lightweight price-path chart (renderer behind a stable boundary) ─────────

function PricePathChart({ replay }: { replay: RealTradeReplay }) {
  const paths = replay.pricePaths;
  if (!paths) {
    return (
      <div className="rounded-lg bg-surface-2 px-3 py-6 text-center text-xs text-muted-foreground">
        Historical price path is not available for this trade yet.
      </div>
    );
  }
  const all: RealHistoricalCandle[] = [
    ...paths.beforeEntry,
    ...paths.duringTrade,
    ...paths.afterExit,
  ].sort((a, b) => a.timestamp - b.timestamp);
  if (all.length < 2) {
    return (
      <div className="rounded-lg bg-surface-2 px-3 py-6 text-center text-xs text-muted-foreground">
        Not enough candles to draw the price path.
      </div>
    );
  }
  const W = 320;
  const H = 96;
  const pad = 4;
  const times = all.map((c) => c.timestamp);
  const prices = all.map((c) => c.close);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);
  const x = (t: number) => pad + ((t - tMin) / Math.max(1, tMax - tMin)) * (W - 2 * pad);
  const y = (p: number) => pad + (1 - (p - pMin) / Math.max(1e-12, pMax - pMin)) * (H - 2 * pad);
  const line = all.map((c, i) => `${i === 0 ? "M" : "L"}${x(c.timestamp).toFixed(1)},${y(c.close).toFixed(1)}`).join(" ");

  const entryTs = replay.buyTime;
  const exitTs = replay.sellTime ?? replay.buyTime;
  const entryPrice = all.reduce((best, c) => (Math.abs(c.timestamp - entryTs) < Math.abs(best.timestamp - entryTs) ? c : best), all[0]).close;
  const exitPrice = all.reduce((best, c) => (Math.abs(c.timestamp - exitTs) < Math.abs(best.timestamp - exitTs) ? c : best), all[0]).close;

  return (
    <div className="space-y-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none" role="img" aria-label="Trade price path">
        <path d={line} fill="none" stroke="currentColor" className="text-accent" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <circle cx={x(entryTs)} cy={y(entryPrice)} r={4} className="fill-success" />
        <circle cx={x(exitTs)} cy={y(exitPrice)} r={4} className="fill-danger" />
      </svg>
      <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" /> Entry</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-danger" /> Exit</span>
        <span>{paths.interval ?? ""} · {paths.source ?? "cache"}</span>
      </div>
    </div>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground min-w-0 break-words">{label}</span>
      <span className="text-sm font-medium tabular-nums shrink-0">{value}</span>
    </div>
  );
}

function pctText(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function TradeReplayBody({ replay }: { replay: RealTradeReplay }) {
  const win = (replay.realizedPnlSol ?? 0) > 0;
  return (
    <div className="space-y-5">
      {/* Sticky compact summary */}
      <div className="rounded-xl bg-surface-2 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{tokenLabel(replay.token)}</div>
            <div className="text-[11px] text-muted-foreground">
              {fmtDate(replay.buyTime)} → {fmtDate(replay.sellTime)} · held {fmtDuration(replay.holdDurationSec)}
            </div>
          </div>
          <div className={cn("text-right shrink-0", win ? "text-success" : "text-danger")}>
            <div className="text-lg font-bold tabular-nums flex items-center gap-1 justify-end">
              {win ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {fmtSignedSolMag(replay.realizedPnlSol)}
            </div>
            <div className="text-[11px] tabular-nums">{pctText(replay.roiPercent)}</div>
          </div>
        </div>
      </div>

      <PricePathChart replay={replay} />

      {/* How the position was built */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
          Position lifecycle
        </h3>
        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <EvidenceRow label="Entry executions" value={String(replay.entryExecutions.length)} />
          <EvidenceRow label="Exit executions" value={String(replay.exitExecutions.length)} />
          <EvidenceRow label="Cost basis" value={fmtSignedSolMag(replay.costBasisSol)} />
          <EvidenceRow label="Proceeds" value={fmtSignedSolMag(replay.proceedsSol)} />
        </div>
      </div>

      {/* Entry evidence */}
      {replay.entryQuality && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            What went into the entry
          </h3>
          <div className="rounded-lg bg-surface-2 px-3 py-2">
            <EvidenceRow label="Entry score" value={replay.entryQuality.score == null ? "—" : `${replay.entryQuality.score}/100`} />
            <EvidenceRow label="Price into entry (1h)" value={pctText(replay.entryQuality.preEntryReturn1h)} />
            <EvidenceRow label="Follow-through (1h)" value={pctText(replay.entryQuality.postEntryReturn1h)} />
            <EvidenceRow label="Max favorable after entry" value={pctText(replay.entryQuality.mfePercent)} />
            <EvidenceRow label="Max adverse after entry" value={pctText(replay.entryQuality.maePercent)} />
          </div>
        </div>
      )}

      {/* Exit evidence (hindsight) */}
      {replay.exitQuality && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Price action after exit (hindsight)
          </h3>
          <div className="rounded-lg bg-surface-2 px-3 py-2">
            <EvidenceRow label="Exit score" value={replay.exitQuality.score == null ? "—" : `${replay.exitQuality.score}/100`} />
            <EvidenceRow label="Captured favorable move" value={replay.exitQuality.capturedMfePercent == null ? "—" : `${replay.exitQuality.capturedMfePercent.toFixed(0)}%`} />
            <EvidenceRow label="Upside after exit" value={pctText(replay.exitQuality.missedUpsidePercent)} />
            <EvidenceRow label="Downside avoided after exit" value={pctText(replay.exitQuality.avoidedDownsidePercent)} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
            Post-exit figures are historical hindsight and do not imply the move was predictable.
          </p>
        </div>
      )}

      {/* Current liquidity */}
      {replay.currentLiquidity && !replay.currentLiquidity.missingLiquidity && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Current pool liquidity
          </h3>
          <div className="rounded-lg bg-surface-2 px-3 py-2">
            <EvidenceRow label="Liquidity band" value={replay.currentLiquidity.band} />
            {replay.currentLiquidity.liquidityUsd != null && (
              <EvidenceRow label="Pool liquidity" value={`$${Math.round(replay.currentLiquidity.liquidityUsd).toLocaleString()}`} />
            )}
          </div>
        </div>
      )}

      {replay.limitations.length > 0 && (
        <div className="rounded-lg border border-border/60 px-3 py-2">
          <div className="text-[11px] font-medium text-muted-foreground mb-1">What data was unavailable</div>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {replay.limitations.map((l, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                <span className="break-words">{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function TradeReplaySheet({
  wallet,
  tradeId,
  open,
  onOpenChange,
}: {
  wallet: string;
  tradeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [replay, setReplay] = useState<RealTradeReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !tradeId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReplay(null);
    api.realAnalysis
      .tradeReplay(wallet, tradeId)
      .then((r) => {
        if (!cancelled) setReplay(r.replay);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load this trade replay.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tradeId, wallet]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto"
      >
        <SheetHeader className="text-left">
          <SheetTitle>Trade Replay</SheetTitle>
          <SheetDescription>
            A lifecycle drill-down for one completed historical trade.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          {loading && (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading trade…</div>
          )}
          {error && (
            <div className="py-12 text-center text-sm text-muted-foreground">{error}</div>
          )}
          {replay && <TradeReplayBody replay={replay} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TradeRow({
  trade,
  onOpen,
}: {
  trade: RealTradeSummary;
  onOpen: () => void;
}) {
  const win = trade.realizedPnlSol > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5 text-left transition hover:bg-surface-3"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{tokenLabel(trade.token)}</div>
        <div className="text-[11px] text-muted-foreground">
          {fmtDate(trade.buyTime)} · held {fmtDuration(trade.holdDurationSec)}
          {trade.isComplex ? " · multi-leg" : ""}
        </div>
      </div>
      <div className={cn("text-right shrink-0", win ? "text-success" : "text-danger")}>
        <div className="text-sm font-semibold tabular-nums">{fmtSignedSolMag(trade.realizedPnlSol)}</div>
        <div className="text-[11px] tabular-nums">{pctText(trade.roiPercent)}</div>
      </div>
    </button>
  );
}

/**
 * A tappable evidence surface: top winners and losers as trade rows that open
 * the replay drawer. Hides silently when the viewer is not the wallet owner
 * (backend returns 401/403).
 */
export function TradeReplaySection({ wallet }: { wallet: string }) {
  const [winners, setWinners] = useState<RealTradeSummary[]>([]);
  const [losers, setLosers] = useState<RealTradeSummary[]>([]);
  const [available, setAvailable] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.realAnalysis.trades(wallet, { sort: "pnl", limit: 5 }),
      api.realAnalysis.trades(wallet, { sort: "loss", limit: 5 }),
    ])
      .then(([w, l]) => {
        if (cancelled) return;
        setWinners(w.trades.filter((t) => t.realizedPnlSol > 0));
        setLosers(l.trades.filter((t) => t.realizedPnlSol < 0));
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  if (!available) return null;
  if (winners.length === 0 && losers.length === 0) return null;

  const openTrade = (id: string) => {
    setSelected(id);
    setSheetOpen(true);
  };

  return (
    <section className="rounded-2xl bg-card shadow-card p-5 sm:p-6 space-y-4">
      <div className="space-y-0.5">
        <h2 className="text-base font-semibold tracking-tight">Trade Replay</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Tap a completed trade to inspect its full lifecycle and supporting evidence.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {winners.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Top winners</div>
            {winners.map((t) => (
              <TradeRow key={t.roundTripId} trade={t} onOpen={() => openTrade(t.roundTripId)} />
            ))}
          </div>
        )}
        {losers.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Top losers</div>
            {losers.map((t) => (
              <TradeRow key={t.roundTripId} trade={t} onOpen={() => openTrade(t.roundTripId)} />
            ))}
          </div>
        )}
      </div>
      <TradeReplaySheet
        wallet={wallet}
        tradeId={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </section>
  );
}

import React from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Copy,
  ChevronUp,
  Layers,
  ArrowRight,
} from 'lucide-react';
import './_group.css';

/*
 * BlackPebble — Full Position Detail (mobile) mockup, Level 3 of the hierarchy.
 *
 * Premium visual polish with NO loss of information density. Every field the
 * live app already tracks is present, organised into four labelled sections:
 *   1. Market-Cap Analytics  (BlackPebble's core differentiator)
 *   2. Position Analytics
 *   3. Trade History (per-execution audit trail)
 *   4. Actions
 *
 * MARKET-CAP-FIRST LANGUAGE: the headline metric is "Avg Entry MC" (the
 * cost-weighted blended market cap across every buy) vs "Current MC". Price is
 * preserved everywhere as a secondary detail, never removed.
 *
 * Built to instantly answer: avg entry MC, current MC, ROI, average entry,
 * slippage taken, and how many executions built the position.
 */

const POS = {
  symbol: 'WIF',
  name: 'dogwifhat',
  mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  // Cost-weighted blend across the 4 executions below.
  avgEntryMcUsd: 460_000_000,
  currentMcUsd: 1_480_000_000,
  mcChangePct: 221.7,
  peakMcUsd: 1_620_000_000,
  avgEntryUsd: 0.46,
  currentUsd: 1.48,
  quantity: '11,472',
  costBasisSol: '36.24',
  valueSol: '116.58',
  unrealizedPnlSol: '+80.34',
  roiPct: '+221.70',
  executions: 4,
  avgSlippagePct: '1.18',
  opened: '3d ago',
  held: '3d 4h',
};

type Exec = {
  side: 'buy' | 'sell';
  sol: string;
  tokens: string;
  priceUsd: string;
  mcUsd: string;
  slippage: string;
  impact: string;
  pnl: string | null;
  time: string;
};

const EXECS: Exec[] = [
  { side: 'buy', sol: '10.00', tokens: '3,452', priceUsd: '$0.42', mcUsd: '$420M', slippage: '0.90', impact: '0.42', pnl: null, time: '3d ago' },
  { side: 'buy', sol: '8.00', tokens: '2,578', priceUsd: '$0.45', mcUsd: '$450M', slippage: '1.10', impact: '0.55', pnl: null, time: '2d ago' },
  { side: 'buy', sol: '12.00', tokens: '3,702', priceUsd: '$0.47', mcUsd: '$470M', slippage: '1.40', impact: '0.71', pnl: null, time: '1d ago' },
  { side: 'buy', sol: '6.24', tokens: '1,740', priceUsd: '$0.52', mcUsd: '$520M', slippage: '1.30', impact: '0.48', pnl: null, time: '14h ago' },
];

function fmtMc(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v}`;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">{children}</h2>
      {hint && <span className="text-[10px] text-muted-foreground/70 font-['JetBrains_Mono']">{hint}</span>}
    </div>
  );
}

/** A label + mono value stat cell used across the analytics grids. */
function Stat({ label, value, valueClass = '', sub }: { label: string; value: string; valueClass?: string; sub?: string }) {
  return (
    <div className="border border-border bg-card rounded-[2px] px-3 py-2.5">
      <Label>{label}</Label>
      <div className={`mt-1 font-['JetBrains_Mono'] tabular-nums text-[15px] ${valueClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground font-['JetBrains_Mono'] tabular-nums">{sub}</div>}
    </div>
  );
}

export function PositionDetail() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground font-['Inter'] flex justify-center">
      <div className="w-full max-w-[390px] min-h-screen border-x border-border/30 overflow-y-auto pb-20">

        {/* Top bar */}
        <header className="px-3 py-3 flex items-center gap-2 border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
          <button className="p-1.5 -ml-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium tracking-wide">Position</span>
          <button className="ml-auto p-1.5 text-muted-foreground hover:text-foreground">
            <ChevronUp className="w-4 h-4" />
          </button>
        </header>

        {/* Identity + hero P&L */}
        <div className="px-4 pt-4 pb-3 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary border border-border/60 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold">{POS.symbol[0]}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold leading-none">{POS.symbol}</span>
                <span className="text-xs text-muted-foreground truncate">{POS.name}</span>
              </div>
              <button className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent font-['JetBrains_Mono']">
                {POS.mint.slice(0, 4)}…{POS.mint.slice(-4)}
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Hero: unrealized P&L + ROI — the headline answer */}
          <div className="mt-4 flex items-end justify-between">
            <div>
              <Label>Unrealized P&amp;L</Label>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold font-['JetBrains_Mono'] tabular-nums text-emerald-400 tracking-tight">
                  {POS.unrealizedPnlSol}
                </span>
                <span className="text-sm text-muted-foreground font-['JetBrains_Mono']">SOL</span>
              </div>
            </div>
            <div className="text-right">
              <Label>ROI</Label>
              <div className="mt-1 inline-flex items-center gap-1 font-['JetBrains_Mono'] tabular-nums text-emerald-400 text-lg font-semibold">
                <ArrowUpRight className="w-4 h-4" />
                {POS.roiPct}%
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-5">

          {/* ── Market-Cap Analytics (core differentiator) ─────────── */}
          <section>
            <SectionTitle hint="market-cap basis">Market-Cap Analytics</SectionTitle>

            {/* Avg Entry MC → Current MC, the signature BlackPebble view */}
            <div className="border border-accent/30 bg-card rounded-[2px] p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Avg Entry MC</Label>
                  <div className="mt-1 font-['JetBrains_Mono'] tabular-nums text-base text-muted-foreground">
                    {fmtMc(POS.avgEntryMcUsd)}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 font-['JetBrains_Mono']">@ ${POS.avgEntryUsd.toFixed(2)}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                <div className="text-right">
                  <Label>Current MC</Label>
                  <div className="mt-1 font-['JetBrains_Mono'] tabular-nums text-base text-foreground">
                    {fmtMc(POS.currentMcUsd)}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 font-['JetBrains_Mono']">@ ${POS.currentUsd.toFixed(2)}</div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] font-['JetBrains_Mono'] tabular-nums">
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <ArrowUpRight className="w-3 h-3" /> +{POS.mcChangePct}% since entry
                </span>
                <span className="text-emerald-400">3.22×</span>
              </div>
            </div>

            {/* MC-derived metrics. Peak MC / From Peak have NO backing data
                (no continuous market-cap history is stored) so they are shown
                honestly as "—", never fabricated. */}
            <div className="grid grid-cols-3 gap-2 mt-2">
              <Stat label="MC Multiple" value="3.22×" valueClass="text-emerald-400" />
              <Stat label="MC Gain" value={`+${POS.mcChangePct}%`} valueClass="text-emerald-400" />
              <Stat label="Hold Time" value={POS.held} />
              <Stat label="Peak MC" value="—" sub="Not tracked yet" />
              <Stat label="From Peak" value="—" sub="Not tracked yet" />
              <Stat label="Executions" value={String(POS.executions)} sub="buys" />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground/80 leading-relaxed">
              Peak MC and drawdown-from-peak require continuous market-cap history
              per holding, which isn't tracked yet. Every other metric is live.
            </p>
          </section>

          {/* ── Position Analytics ─────────────────────────────────── */}
          <section>
            <SectionTitle>Position Analytics</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Avg Entry Price" value={`$${POS.avgEntryUsd.toFixed(2)}`} sub={`${fmtMc(POS.avgEntryMcUsd)} avg entry MC`} />
              <Stat label="Current Price" value={`$${POS.currentUsd.toFixed(2)}`} sub={`${fmtMc(POS.currentMcUsd)} current MC`} />
              <Stat label="Quantity" value={POS.quantity} sub={`${POS.symbol}`} />
              <Stat label="Position Value" value={`${POS.valueSol} SOL`} />
              <Stat label="Cost Basis" value={`${POS.costBasisSol} SOL`} />
              <Stat label="Unrealized P&L" value={`${POS.unrealizedPnlSol} SOL`} valueClass="text-emerald-400" />
              <Stat label="Executions" value={String(POS.executions)} sub="buys" />
              <Stat label="Avg Slippage" value={`${POS.avgSlippagePct}%`} />
            </div>
            <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground font-['JetBrains_Mono']">
              <span>Opened {POS.opened}</span>
              <span>Held {POS.held}</span>
            </div>
          </section>

          {/* ── Trade History ──────────────────────────────────────── */}
          <section>
            <SectionTitle hint={`${EXECS.length} executions`}>Trade History</SectionTitle>
            <div className="border border-border bg-card rounded-[2px] divide-y divide-border/60">
              {EXECS.map((t, i) => {
                const isBuy = t.side === 'buy';
                return (
                  <div key={i} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`flex items-center gap-1.5 text-sm font-medium ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isBuy ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        {isBuy ? 'Bought' : 'Sold'}
                        <span className="text-foreground">{POS.symbol}</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground font-['JetBrains_Mono'] whitespace-nowrap">{t.time}</span>
                    </div>

                    <div className="mt-1 font-['JetBrains_Mono'] tabular-nums text-xs text-foreground/90">
                      {isBuy
                        ? `${t.sol} SOL → ${t.tokens} ${POS.symbol}`
                        : `${t.tokens} ${POS.symbol} → ${t.sol} SOL`}
                    </div>

                    <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-['JetBrains_Mono'] tabular-nums text-muted-foreground">
                      <span>Entry MC {t.mcUsd}</span>
                      <span className="text-right">Price {t.priceUsd}</span>
                      <span>Slippage {t.slippage}%</span>
                      <span className="text-right">Impact {t.impact}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Actions ────────────────────────────────────────────── */}
          <section>
            <SectionTitle>Actions</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <button className="h-11 rounded-[2px] bg-accent text-accent-foreground font-medium text-sm inline-flex items-center justify-center gap-1.5">
                Continue Trading <ArrowRight className="w-4 h-4" />
              </button>
              <button className="h-11 rounded-[2px] border border-border text-foreground font-medium text-sm inline-flex items-center justify-center gap-1.5 hover:bg-white/[0.02]">
                <ExternalLink className="w-4 h-4 text-muted-foreground" /> View Chart
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Layers className="w-3.5 h-3.5" />
              Built from {POS.executions} executions · avg slippage {POS.avgSlippagePct}%
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

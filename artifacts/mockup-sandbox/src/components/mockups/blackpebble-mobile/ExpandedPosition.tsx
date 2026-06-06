import { ChevronDown, ChevronUp, ArrowRight, BarChart3, Wallet } from 'lucide-react';
import './_group.css';

/*
 * BlackPebble — Expanded Position (mobile) mockup, Level 2 of the hierarchy.
 *
 * A Level-1 card opened in place: the trader-focused analytics grid (Entry MC,
 * Current MC, MC Multiple, Position Value, Cost Basis, ROI, Unrealized P&L,
 * Hold Time, Quantity) plus the price line and two actions — "View Full Detail"
 * (Level 3) and "Continue Trading". The full per-execution trade history lives
 * one level deeper on the detail page, so nothing is removed by this collapse.
 */

function cn(...c: (string | boolean | undefined | null)[]) {
  return c.filter(Boolean).join(' ');
}

function McCell({ label, value, extra, valueClass = '' }: { label: string; value: string; extra?: string; valueClass?: string }) {
  return (
    <div className="px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-['JetBrains_Mono'] tabular-nums text-sm font-semibold ${valueClass || 'text-foreground'}`}>{value}</div>
      {extra && <div className="text-[10px] font-['JetBrains_Mono'] text-emerald-400">{extra}</div>}
    </div>
  );
}

function Field({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-['JetBrains_Mono'] tabular-nums text-foreground ${valueClass}`}>{value}</span>
    </div>
  );
}

function CollapsedCard({ symbol, name, pnl, roi, entryMc, currentMc, mult }: { symbol: string; name: string; pnl: string; roi: string; entryMc: string; currentMc: string; mult: string }) {
  return (
    <div className="border border-border bg-card rounded-[2px]">
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1 px-4 py-2.5">
          <div className="font-medium truncate">{symbol}</div>
          <div className="text-xs text-muted-foreground truncate">{name}</div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5">
          <div className="text-right">
            <div className="font-['JetBrains_Mono'] tabular-nums text-sm text-emerald-400">{pnl} SOL</div>
            <div className="font-['JetBrains_Mono'] tabular-nums text-xs text-emerald-400">{roi}%</div>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      </div>
      <div className="px-4 pb-3">
        <div className="grid grid-cols-3 border border-border/60 bg-background/40 divide-x divide-border/60 rounded-[2px]">
          <McCell label="Entry MC" value={entryMc} />
          <McCell label="Current MC" value={currentMc} />
          <McCell label="MC ×" value={mult} valueClass="text-emerald-400" />
        </div>
      </div>
    </div>
  );
}

export function ExpandedPosition() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground font-['Inter'] flex justify-center">
      <div className="w-full max-w-[390px] min-h-screen border-x border-border/30 overflow-y-auto pb-20">

        <header className="px-4 py-5 flex items-center gap-3 border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
          <Wallet className="w-5 h-5 text-accent" />
          <h1 className="text-xl font-semibold tracking-[0.02em]">Open Positions</h1>
        </header>

        <div className="p-4 space-y-2">

          <CollapsedCard symbol="POPCAT" name="Popcat" pnl="+12.40" roi="+18.20" entryMc="$890M" currentMc="$1.10B" mult="1.24×" />

          {/* The expanded card — Level 2 */}
          <div className="border border-accent/40 bg-card rounded-[2px]">
            <div className="flex items-stretch">
              <div className="min-w-0 flex-1 px-4 py-2.5">
                <div className="font-medium truncate">WIF</div>
                <div className="text-xs text-muted-foreground truncate">dogwifhat</div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2.5">
                <div className="text-right">
                  <div className="font-['JetBrains_Mono'] tabular-nums text-sm text-emerald-400">+80.34 SOL</div>
                  <div className="font-['JetBrains_Mono'] tabular-nums text-xs text-emerald-400">+221.70%</div>
                </div>
                <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </div>

            <div className="px-4 pb-3">
              <div className="grid grid-cols-3 border border-border/60 bg-background/40 divide-x divide-border/60 rounded-[2px]">
                <McCell label="Entry MC" value="$460M" />
                <McCell label="Current MC" value="$1.48B" extra="+221.7%" />
                <McCell label="MC ×" value="3.22×" valueClass="text-emerald-400" />
              </div>
            </div>

            {/* L2 analytics grid */}
            <div className="px-4 pb-4 border-t border-border/60 pt-3 space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <Field label="Entry MC" value="$460M" />
                <Field label="Current MC" value="$1.48B" />
                <Field label="MC Multiple" value="3.22×" valueClass="text-emerald-400" />
                <Field label="Position Value" value="116.58 SOL" />
                <Field label="Cost Basis" value="36.24 SOL" />
                <Field label="ROI" value="+221.70%" valueClass="text-emerald-400" />
                <Field label="Unrealized P&L" value="+80.34 SOL" valueClass="text-emerald-400" />
                <Field label="Hold Time" value="3d 4h" />
                <Field label="Quantity" value="11,472" />
              </div>

              <div className="text-[11px] font-['JetBrains_Mono'] tabular-nums text-muted-foreground">
                Avg entry $0.46 · Current $1.48
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium border border-accent/50 text-accent rounded-[2px]">
                  <BarChart3 className="w-3.5 h-3.5" />
                  View Full Detail
                </button>
                <button className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium border border-border text-foreground rounded-[2px]">
                  Continue Trading
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <CollapsedCard symbol="BONK" name="Bonk" pnl="-4.85" roi="-12.30" entryMc="$2.10B" currentMc="$1.74B" mult="0.83×" />

        </div>
      </div>
    </div>
  );
}

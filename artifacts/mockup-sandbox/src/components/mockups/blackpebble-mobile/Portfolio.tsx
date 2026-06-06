import { ChevronDown, ShieldCheck, Wallet } from 'lucide-react';
import './_group.css';

/*
 * BlackPebble — Portfolio (mobile) mockup, Level 1 of the position hierarchy.
 *
 * Market-cap-first: each open position shows Token, Unrealized P&L + ROI%, and
 * an Entry MC · Current MC · MC× strip. Tapping a card expands it (Level 2);
 * "View Full Detail" opens the dedicated analytics page (Level 3).
 *
 * Every portfolio summary block is preserved and Rank is added, derived from
 * the all-time leaderboard.
 */

function cn(...c: (string | boolean | undefined | null)[]) {
  return c.filter(Boolean).join(' ');
}

const STATS = {
  equity: '1,245.50',
  cash: '45.50',
  totalPnl: '+245.50',
  roi: '+24.55',
  executions: 142,
  closed: 45,
  winRate: '62.5',
  best: '+42.10',
  rank: 5,
  tier: 'Gold',
};

type Pos = {
  symbol: string;
  name: string;
  entryMc: string;
  currentMc: string;
  mcChange: string;
  mult: string;
  pnl: string;
  roi: string;
  positive: boolean;
};

const POSITIONS: Pos[] = [
  { symbol: 'WIF', name: 'dogwifhat', entryMc: '$460M', currentMc: '$1.48B', mcChange: '+221.7', mult: '3.22×', pnl: '+80.34', roi: '+221.70', positive: true },
  { symbol: 'POPCAT', name: 'Popcat', entryMc: '$890M', currentMc: '$1.10B', mcChange: '+23.6', mult: '1.24×', pnl: '+12.40', roi: '+18.20', positive: true },
  { symbol: 'BONK', name: 'Bonk', entryMc: '$2.10B', currentMc: '$1.74B', mcChange: '-17.1', mult: '0.83×', pnl: '-4.85', roi: '-12.30', positive: false },
];

function Stat({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="border border-border bg-card rounded-[2px] px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div>
      <div className={`text-base font-['JetBrains_Mono'] tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
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

export function Portfolio() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground font-['Inter'] flex justify-center">
      <div className="w-full max-w-[390px] min-h-screen border-x border-border/30 overflow-y-auto pb-20">

        <header className="px-4 py-5 flex items-center gap-3 border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
          <Wallet className="w-5 h-5 text-accent" />
          <h1 className="text-xl font-semibold tracking-[0.02em]">Portfolio</h1>
        </header>

        <div className="p-4 space-y-6">

          {/* Hero equity */}
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Equity</div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold font-['JetBrains_Mono'] tabular-nums tracking-tight">{STATS.equity}</span>
              <span className="text-muted-foreground font-['JetBrains_Mono']">SOL</span>
            </div>
            <div className="flex items-center gap-3 mt-2 font-['JetBrains_Mono'] tabular-nums text-sm text-emerald-400">
              <span>{STATS.totalPnl} SOL</span>
              <span>({STATS.roi}%)</span>
            </div>
          </div>

          {/* Summary grid — every block preserved + Rank added */}
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Cash Balance" value={`${STATS.cash} SOL`} />
            <Stat label="Total P&L" value={`${STATS.totalPnl} SOL`} valueClass="text-emerald-400" />
            <Stat label="ROI" value={`${STATS.roi}%`} valueClass="text-emerald-400" />
            <Stat label="Executions" value={String(STATS.executions)} />
            <Stat label="Closed Trades" value={String(STATS.closed)} />
            <Stat label="Win Rate" value={`${STATS.winRate}%`} />
            <Stat label="Best Trade" value={`${STATS.best} SOL`} valueClass="text-emerald-400" />
            <Stat label="Rank" value={`#${STATS.rank}`} valueClass="text-accent" />
            <div className="border border-border bg-card rounded-[2px] px-3 py-2.5 col-span-2 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Tier</div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-accent/10 border border-accent/20 text-accent font-medium text-xs uppercase tracking-wider">
                <ShieldCheck className="w-3 h-3" />
                {STATS.tier}
              </div>
            </div>
          </div>

          {/* Equity chart */}
          <div className="border border-border bg-card rounded-[2px] p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-4">Equity Performance</div>
            <div className="h-[120px] w-full relative">
              <svg viewBox="0 0 400 120" className="w-full h-full overflow-visible">
                <line x1="0" y1="30" x2="400" y2="30" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                <line x1="0" y1="60" x2="400" y2="60" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                <line x1="0" y1="90" x2="400" y2="90" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                <path d="M0,100 L40,92 L80,96 L120,72 L160,78 L200,50 L240,62 L280,32 L320,40 L360,16 L400,8 L400,120 L0,120 Z" fill="rgba(201,169,110,0.08)" />
                <path d="M0,100 L40,92 L80,96 L120,72 L160,78 L200,50 L240,62 L280,32 L320,40 L360,16 L400,8" fill="none" stroke="#c9a96e" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="mt-4 flex justify-between items-center text-[10px] text-muted-foreground font-['JetBrains_Mono'] border-t border-border/50 pt-2">
              <span>Low 980.00</span>
              <span>High 1,245.50</span>
            </div>
          </div>

          {/* Open Positions — Level 1 compact cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium tracking-wide">Open Positions</h2>
              <span className="text-xs text-muted-foreground font-['JetBrains_Mono']">{POSITIONS.length}</span>
            </div>
            <div className="space-y-2">
              {POSITIONS.map((p) => (
                <div key={p.symbol} className="border border-border bg-card rounded-[2px]">
                  <div className="flex items-stretch">
                    <div className="min-w-0 flex-1 px-4 py-2.5">
                      <div className="font-medium truncate">{p.symbol}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.name}</div>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <div className="text-right">
                        <div className={cn('font-["JetBrains_Mono"] tabular-nums text-sm', p.positive ? 'text-emerald-400' : 'text-red-400')}>
                          {p.pnl} SOL
                        </div>
                        <div className={cn('font-["JetBrains_Mono"] tabular-nums text-xs', p.positive ? 'text-emerald-400' : 'text-red-400')}>
                          {p.roi}%
                        </div>
                      </div>
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  </div>
                  <div className="px-4 pb-3">
                    <div className="grid grid-cols-3 border border-border/60 bg-background/40 divide-x divide-border/60 rounded-[2px]">
                      <McCell label="Entry MC" value={p.entryMc} />
                      <McCell label="Current MC" value={p.currentMc} extra={`${p.mcChange}%`} />
                      <McCell label="MC ×" value={p.mult} valueClass={p.positive ? 'text-emerald-400' : 'text-red-400'} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

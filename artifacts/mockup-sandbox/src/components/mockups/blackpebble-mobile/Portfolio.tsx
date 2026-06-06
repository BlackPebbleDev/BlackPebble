import React from 'react';
import { Wallet, TrendingUp, ArrowUpRight, ArrowDownRight, Activity, ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import './_group.css';

// Mock Data
const MOCK_STATS = {
  equitySol: "1,245.50",
  balanceSol: "45.50",
  totalPnlSol: "+245.50",
  roiPercent: "+24.55",
  executions: 142,
  closedTrades: 45,
  winRate: "62.5",
  bestTrade: "+42.10",
  tier: "Silver"
};

const MOCK_POSITIONS = [
  { symbol: "SOL", amount: "450.00", valueUsd: "64,350.00", pnl: "+1,240.00", pnlPct: "+1.96", isPositive: true },
  { symbol: "WIF", amount: "12,500", valueUsd: "34,250.00", pnl: "-450.00", pnlPct: "-1.30", isPositive: false },
  { symbol: "BONK", amount: "1M", valueUsd: "12,400.00", pnl: "+2,100.00", pnlPct: "+20.34", isPositive: true },
];

const MOCK_WATCHLIST = [
  { symbol: "JUP", price: "1.12", change: "+5.4", isPositive: true },
  { symbol: "POPCAT", price: "0.45", change: "-2.1", isPositive: false },
  { symbol: "PEPE", price: "0.000012", change: "+12.4", isPositive: true },
];

const MOCK_HISTORY = [
  { type: "BUY", symbol: "WIF", amount: "5,000", price: "2.74", time: "2h ago" },
  { type: "SELL", symbol: "SOL", amount: "50", price: "145.20", time: "5h ago" },
];

function StatCard({ label, value, valueClass = "" }: { label: string, value: string, valueClass?: string }) {
  return (
    <div className="border border-border bg-card rounded-[2px] p-3 flex flex-col justify-center">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div>
      <div className={`text-base font-['JetBrains_Mono'] ${valueClass}`}>{value}</div>
    </div>
  );
}

export function Portfolio() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground font-['Inter'] flex justify-center">
      <div className="w-full max-w-[390px] min-h-screen border-x border-border/30 overflow-y-auto pb-20">
        
        {/* Header */}
        <header className="px-4 py-5 flex items-center gap-3 border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
          <Wallet className="w-5 h-5 text-accent" />
          <h1 className="text-xl font-semibold tracking-[0.02em]">Portfolio</h1>
        </header>

        <div className="p-4 space-y-6">
          
          {/* Hero Summary */}
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Equity</div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold font-['JetBrains_Mono'] tracking-tight">{MOCK_STATS.equitySol}</span>
              <span className="text-muted-foreground font-['JetBrains_Mono']">SOL</span>
            </div>
            <div className="flex items-center gap-3 mt-2 font-['JetBrains_Mono'] text-sm">
              <span className="text-emerald-400 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" /> {MOCK_STATS.totalPnlSol} SOL
              </span>
              <span className="text-emerald-400">({MOCK_STATS.roiPercent}%)</span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Cash Balance" value={`${MOCK_STATS.balanceSol} SOL`} />
            <StatCard label="Best Trade" value={`${MOCK_STATS.bestTrade} SOL`} valueClass="text-emerald-400" />
            <StatCard label="Win Rate" value={`${MOCK_STATS.winRate}%`} />
            <StatCard label="Closed Trades" value={String(MOCK_STATS.closedTrades)} />
            <StatCard label="Executions" value={String(MOCK_STATS.executions)} />
            
            {/* Tier Card */}
            <div className="border border-border bg-card rounded-[2px] p-3 flex flex-col justify-center items-start">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Tier</div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-accent/10 border border-accent/20 text-accent font-medium text-xs uppercase tracking-wider">
                <ShieldCheck className="w-3 h-3" />
                {MOCK_STATS.tier}
              </div>
            </div>
          </div>

          {/* Equity Chart */}
          <div className="border border-border bg-card rounded-[2px] p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-4">Equity Performance</div>
            <div className="h-[140px] w-full relative">
              <svg viewBox="0 0 400 140" className="w-full h-full preserve-aspect-ratio-none overflow-visible">
                {/* Grid */}
                <line x1="0" y1="35" x2="400" y2="35" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                <line x1="0" y1="70" x2="400" y2="70" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                <line x1="0" y1="105" x2="400" y2="105" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                
                {/* Area Fill */}
                <path d="M0,120 L40,110 L80,115 L120,90 L160,95 L200,60 L240,75 L280,40 L320,50 L360,20 L400,10 L400,140 L0,140 Z" fill="rgba(201,169,110,0.08)" />
                {/* Line */}
                <path d="M0,120 L40,110 L80,115 L120,90 L160,95 L200,60 L240,75 L280,40 L320,50 L360,20 L400,10" fill="none" stroke="#c9a96e" strokeWidth="2" strokeLinejoin="round" />
              </svg>
              {/* Axis Labels */}
              <div className="absolute left-0 bottom-0 text-[10px] text-muted-foreground font-['JetBrains_Mono'] translate-y-5">1W</div>
              <div className="absolute right-0 bottom-0 text-[10px] text-muted-foreground font-['JetBrains_Mono'] translate-y-5">Now</div>
            </div>
            <div className="mt-6 flex justify-between items-center text-[10px] text-muted-foreground font-['JetBrains_Mono'] border-t border-border/50 pt-2">
              <span>Low: 980.00</span>
              <span>High: 1,245.50</span>
            </div>
          </div>

          {/* Open Positions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium tracking-wide">Open Positions</h2>
              <span className="text-xs text-muted-foreground font-['JetBrains_Mono']">{MOCK_POSITIONS.length}</span>
            </div>
            <div className="space-y-2">
              {MOCK_POSITIONS.map((pos) => (
                <div key={pos.symbol} className="border border-border bg-card rounded-[2px] p-3 flex items-center justify-between active:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center border border-border/50">
                      <span className="text-[10px] font-bold">{pos.symbol[0]}</span>
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{pos.symbol}</div>
                      <div className="text-xs text-muted-foreground font-['JetBrains_Mono']">{pos.amount}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-['JetBrains_Mono'] text-sm">${pos.valueUsd}</div>
                    <div className={`text-xs font-['JetBrains_Mono'] flex items-center justify-end gap-1 ${pos.isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                      {pos.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {pos.pnl} ({pos.pnlPct}%)
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Watchlist */}
          <div>
            <h2 className="text-sm font-medium tracking-wide mb-3">Watchlist</h2>
            <div className="border border-border bg-card rounded-[2px] divide-y divide-border">
              {MOCK_WATCHLIST.map((item) => (
                <div key={item.symbol} className="px-3 py-2.5 flex items-center justify-between">
                  <div className="font-medium text-sm">{item.symbol}</div>
                  <div className="text-right flex items-center gap-3">
                    <span className="font-['JetBrains_Mono'] text-sm">${item.price}</span>
                    <span className={`w-[52px] text-right font-['JetBrains_Mono'] text-xs ${item.isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                      {item.change}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Trade History */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium tracking-wide">Recent History</h2>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="border border-border bg-card rounded-[2px] divide-y divide-border">
              {MOCK_HISTORY.map((trade, i) => (
                <div key={i} className="px-3 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[2px] ${trade.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {trade.type}
                    </div>
                    <div>
                      <span className="font-medium text-sm">{trade.symbol}</span>
                      <span className="text-xs text-muted-foreground font-['JetBrains_Mono'] ml-2">{trade.amount}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-['JetBrains_Mono'] text-sm">${trade.price}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3" /> {trade.time}
                    </div>
                  </div>
                </div>
              ))}
              <div className="px-3 py-3 text-center text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center justify-center gap-1">
                View all history <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

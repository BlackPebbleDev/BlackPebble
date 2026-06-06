import { useState } from "react";
import { ArrowLeft, RefreshCw, AlertTriangle, ArrowRight, Settings2, Info } from "lucide-react";
import "./_group.css";

// Realistic mock data
const tokenInfo = {
  name: "dogwifhat",
  symbol: "WIF",
  mint: "EKpQGQJEYIdHVDmF3aUoH",
  logo: "https://arweave.net/75K2v35r1W85R0a6B28o4o9B2A8A1o3Y9D1H8",
  priceUsd: 1.48,
  priceChange24h: 12.45,
  marketCapUsd: 1480000000,
  volume24hUsd: 85400000,
  liquidityUsd: 12000000,
};

const position = {
  total_tokens: 4520.5,
  avg_entry_price: 1.15,
  currentValueSol: 45.2,
  unrealizedPnlSol: 10.4,
  unrealizedPnlPercent: 28.7,
};

const BUY_PRESETS = [0.5, 1, 5, 10];
const SELL_PRESETS = [25, 50, 75, 100];
const TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H"];

function fmtUsd(val: number) {
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

function fmtPrice(val: number) {
  if (val < 0.001) return `$${val.toFixed(6)}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(val);
}

function fmtPercent(val: number) {
  return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function Trading() {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [timeframe, setTimeframe] = useState("15m");

  return (
    <div className="min-h-screen w-full bg-background text-foreground font-['Inter'] flex flex-col mx-auto max-w-[390px] border-x border-border">
      {/* Top Nav */}
      <header className="flex items-center justify-between px-4 h-14 border-b border-border sticky top-0 bg-background z-10">
        <div className="flex items-center gap-3">
          <button className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-sm font-medium">Trade</div>
        </div>
        <div className="flex items-center gap-4">
          <button className="text-muted-foreground hover:text-foreground">
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <main className="flex-1 overflow-y-auto pb-8">
        {/* Token Identity Header */}
        <section className="p-4 border-b border-border bg-card">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary border border-border shrink-0">
                {/* Simulated image, fallback to solid color for mockup safety */}
                <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-xs">
                  WIF
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-semibold">{tokenInfo.symbol}</h1>
                  <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-[2px] font-['JetBrains_Mono'] uppercase">
                    {shortAddr(tokenInfo.mint)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">{tokenInfo.name}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Live Price</div>
              <div className="font-['JetBrains_Mono'] text-lg font-medium tracking-tight flex items-center gap-1.5">
                {fmtPrice(tokenInfo.priceUsd)}
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
                </span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">24h Change</div>
              <div className="font-['JetBrains_Mono'] text-sm text-emerald-400">
                {fmtPercent(tokenInfo.priceChange24h)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Market Cap</div>
              <div className="font-['JetBrains_Mono'] text-sm">
                {fmtUsd(tokenInfo.marketCapUsd)}
              </div>
            </div>
          </div>
        </section>

        {/* Chart Area */}
        <section className="bg-card border-b border-border py-2">
          <div className="px-4 mb-2 flex items-center justify-between">
            <div className="flex gap-1">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`text-xs px-2 py-1 rounded-[2px] font-medium transition-colors ${
                    timeframe === tf ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {tokenInfo.symbol}/USD
            </div>
          </div>
          
          <div className="relative h-[220px] w-full px-4 mt-4">
            {/* Background Grid */}
            <div className="absolute inset-0 mx-4 pointer-events-none flex flex-col justify-between py-2 border-y border-border/50">
              <div className="h-[1px] w-full bg-border/30"></div>
              <div className="h-[1px] w-full bg-border/30"></div>
              <div className="h-[1px] w-full bg-border/30"></div>
              <div className="h-[1px] w-full bg-border/30"></div>
            </div>
            
            {/* Minimal SVG Chart */}
            <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="none" className="overflow-visible">
              <defs>
                <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c9a96e" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#c9a96e" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d="M0,150 Q40,140 80,160 T160,120 T240,80 T320,100 T400,40 L400,200 L0,200 Z"
                fill="url(#chart-gradient)"
              />
              <path
                d="M0,150 Q40,140 80,160 T160,120 T240,80 T320,100 T400,40"
                fill="none"
                stroke="#c9a96e"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Last Price Dot */}
              <circle cx="400" cy="40" r="4" fill="#c9a96e" />
            </svg>
          </div>
        </section>

        {/* Order Panel */}
        <section className="p-4 bg-background">
          <div className="flex bg-secondary p-1 rounded-[2px] mb-6">
            <button
              onClick={() => setSide("buy")}
              className={`flex-1 py-2 text-sm font-medium rounded-[2px] transition-colors ${
                side === "buy" ? "bg-accent text-accent-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Buy WIF
            </button>
            <button
              onClick={() => setSide("sell")}
              className={`flex-1 py-2 text-sm font-medium rounded-[2px] transition-colors ${
                side === "sell" ? "bg-accent text-accent-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sell WIF
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-end mb-2">
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Amount (SOL)</label>
                <div className="text-[11px] text-muted-foreground">Bal: <span className="font-['JetBrains_Mono']">4.50</span></div>
              </div>
              <div className="relative">
                <input
                  type="number"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-background border border-border h-12 px-3 font-['JetBrains_Mono'] text-base rounded-[2px] focus:outline-none focus:border-accent transition-colors"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                  {(side === "buy" ? BUY_PRESETS : SELL_PRESETS).map(p => (
                    <button
                      key={p}
                      onClick={() => setAmount(String(p))}
                      className="text-[10px] font-['JetBrains_Mono'] border border-border px-2 py-1 rounded-[2px] text-muted-foreground hover:border-accent hover:text-accent transition-colors bg-card"
                    >
                      {side === "sell" ? `${p}%` : p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Low Data Warning */}
            <div className="border border-amber-500/20 bg-amber-500/5 p-3 rounded-[2px] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-500/90 leading-relaxed">
                Elevated risk — low liquidity, larger slippage applied. Maximum trade size limited to 10 SOL.
              </div>
            </div>

            {/* Trade Estimate */}
            <div className="border border-border bg-card p-3 rounded-[2px] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. Execution Price</span>
                <span className="font-['JetBrains_Mono'] text-foreground">$1.4920</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. Slippage</span>
                <span className="font-['JetBrains_Mono'] text-foreground">1.50%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1">Price Impact <Info className="w-3 h-3" /></span>
                <span className="font-['JetBrains_Mono'] text-amber-500">2.10%</span>
              </div>
              <div className="pt-2 mt-2 border-t border-border/50 flex justify-between font-medium">
                <span>You will receive</span>
                <span className="font-['JetBrains_Mono'] text-foreground">~45.2 WIF</span>
              </div>
            </div>

            <button className="w-full h-12 bg-accent text-accent-foreground font-semibold text-sm rounded-[2px] flex items-center justify-center gap-2 transition-transform active:scale-[0.98]">
              {side === "buy" ? "Buy WIF" : "Sell WIF"}
            </button>
          </div>
        </section>

        {/* Your Position */}
        <section className="p-4 pt-0">
          <div className="border border-border bg-card p-4 rounded-[2px]">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3 border-b border-border/50 pb-2">Your Position</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Quantity</div>
                <div className="font-['JetBrains_Mono'] text-sm">{position.total_tokens}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Value (SOL)</div>
                <div className="font-['JetBrains_Mono'] text-sm">{position.currentValueSol}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Avg Entry</div>
                <div className="font-['JetBrains_Mono'] text-sm">${position.avg_entry_price}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Unrealized P&L</div>
                <div className="font-['JetBrains_Mono'] text-sm text-emerald-400">
                  +{position.unrealizedPnlSol} SOL ({position.unrealizedPnlPercent}%)
                </div>
              </div>
            </div>
            <button className="mt-4 w-full h-9 border border-border hover:bg-secondary rounded-[2px] text-xs font-medium transition-colors flex items-center justify-center gap-2">
              View History <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

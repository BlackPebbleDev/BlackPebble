import { useState } from "react";
import { Trophy, ExternalLink, Activity } from "lucide-react";
import "./_group.css";

// --- Mock Data ---
type Tier = "Legend" | "Diamond" | "Gold" | "Silver" | "Bronze" | "Unranked";

interface TraderEntry {
  rank: number;
  wallet: string;
  isMe?: boolean;
  displayName: string | null;
  handle: string | null;
  avatarUrl: string | null;
  tier: Tier;
  pnl: number;
  roi: number;
  winRate: number;
  trades: number;
  bestTrade: number;
}

const MOCK_TRADERS: TraderEntry[] = [
  {
    rank: 1,
    wallet: "7xK9fA",
    displayName: "QuantFund",
    handle: "quantfund_sol",
    avatarUrl: null,
    tier: "Legend",
    pnl: 1452.45,
    roi: 452.1,
    winRate: 68.5,
    trades: 1204,
    bestTrade: 340.5,
  },
  {
    rank: 2,
    wallet: "9mA2qL",
    displayName: "Sniper Alpha",
    handle: "sniperalpha",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=sniper",
    tier: "Legend",
    pnl: 984.12,
    roi: 312.4,
    winRate: 62.1,
    trades: 854,
    bestTrade: 210.0,
  },
  {
    rank: 3,
    wallet: "3bJ8vR",
    displayName: null,
    handle: "sol_whale99",
    avatarUrl: null,
    tier: "Diamond",
    pnl: 856.9,
    roi: 285.6,
    winRate: 59.4,
    trades: 621,
    bestTrade: 185.2,
  },
  {
    rank: 4,
    wallet: "5kP4nT",
    displayName: "Risk Manager",
    handle: "risk_mgr",
    avatarUrl: null,
    tier: "Diamond",
    pnl: 654.2,
    roi: 195.2,
    winRate: 71.2,
    trades: 432,
    bestTrade: 95.4,
  },
  {
    rank: 5,
    wallet: "1zL7mW",
    isMe: true,
    displayName: "You",
    handle: "my_handle",
    avatarUrl: null,
    tier: "Gold",
    pnl: 432.15,
    roi: 145.8,
    winRate: 55.4,
    trades: 215,
    bestTrade: 85.0,
  },
  {
    rank: 6,
    wallet: "8qN2yX",
    displayName: "Trend Follower",
    handle: "trendf",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=trend",
    tier: "Gold",
    pnl: 345.8,
    roi: 112.5,
    winRate: 51.2,
    trades: 890,
    bestTrade: 145.2,
  },
  {
    rank: 7,
    wallet: "2vM9kP",
    displayName: null,
    handle: null,
    avatarUrl: null,
    tier: "Silver",
    pnl: 210.4,
    roi: 85.2,
    winRate: 48.5,
    trades: 156,
    bestTrade: 45.8,
  },
  {
    rank: 8,
    wallet: "6hT3rL",
    displayName: "Degen Trader",
    handle: "degen_xyz",
    avatarUrl: null,
    tier: "Silver",
    pnl: 185.2,
    roi: 65.4,
    winRate: 45.2,
    trades: 945,
    bestTrade: 450.0,
  },
];

// --- Helpers ---
function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

function fmtSol(val: number) {
  const sign = val > 0 ? "+" : val < 0 ? "-" : "";
  return `${sign}${Math.abs(val).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} SOL`;
}

function fmtPercent(val: number) {
  const sign = val > 0 ? "+" : val < 0 ? "-" : "";
  return `${sign}${Math.abs(val).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function pnlColor(val: number) {
  if (val > 0) return "text-emerald-400";
  if (val < 0) return "text-red-400";
  return "text-muted-foreground";
}

// --- Components ---

function TierBadge({ tier }: { tier: Tier }) {
  const meta: Record<Tier, { name: string; glyph: string; color: string }> = {
    Legend: { name: "Legend", glyph: "✦", color: "text-purple-400 border-purple-400/20 bg-purple-400/10" },
    Diamond: { name: "Diamond", glyph: "♦", color: "text-blue-400 border-blue-400/20 bg-blue-400/10" },
    Gold: { name: "Gold", glyph: "●", color: "text-amber-400 border-amber-400/20 bg-amber-400/10" },
    Silver: { name: "Silver", glyph: "▲", color: "text-zinc-300 border-zinc-400/20 bg-zinc-400/10" },
    Bronze: { name: "Bronze", glyph: "■", color: "text-orange-600 border-orange-600/20 bg-orange-600/10" },
    Unranked: { name: "Unranked", glyph: "○", color: "text-muted-foreground border-border bg-transparent" },
  };

  const t = meta[tier] || meta.Unranked;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-[2px]",
        t.color
      )}
    >
      <span aria-hidden className="leading-none">{t.glyph}</span>
      {t.name}
    </span>
  );
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="font-['JetBrains_Mono'] font-bold text-amber-300">#1</span>;
  if (rank === 2) return <span className="font-['JetBrains_Mono'] font-bold text-zinc-300">#2</span>;
  if (rank === 3) return <span className="font-['JetBrains_Mono'] font-bold text-orange-400">#3</span>;
  return <span className="font-['JetBrains_Mono'] font-medium text-muted-foreground">#{rank}</span>;
}

function TraderRow({ entry }: { entry: TraderEntry }) {
  const initial = (entry.displayName || entry.handle || entry.wallet).slice(0, 2).toUpperCase();
  const isTop3 = entry.rank <= 3;
  const isMe = entry.isMe;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-4 border-b border-border bg-card relative",
        isMe && "bg-accent/5",
      )}
    >
      {isTop3 && (
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-[2px]",
            entry.rank === 1 ? "bg-amber-300" : entry.rank === 2 ? "bg-zinc-300" : "bg-orange-400"
          )}
        />
      )}
      
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-8 text-center">
            <RankMedal rank={entry.rank} />
          </div>
          
          <div className="flex-shrink-0 relative">
            {entry.avatarUrl ? (
              <img src={entry.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover bg-secondary" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs text-muted-foreground font-['JetBrains_Mono']">
                {initial}
              </div>
            )}
            {isMe && (
              <div className="absolute -bottom-1 -right-1 bg-accent text-accent-foreground text-[8px] font-bold px-1 py-px rounded-[2px] uppercase tracking-wider">
                You
              </div>
            )}
          </div>
          
          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-foreground truncate">
                {entry.displayName || entry.wallet}
              </span>
              <TierBadge tier={entry.tier} />
            </div>
            {entry.handle && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent transition-colors mt-0.5">
                <span className="truncate">@{entry.handle}</span>
                <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
              </div>
            )}
            {!entry.handle && entry.displayName && (
              <div className="text-[11px] text-muted-foreground mt-0.5 font-['JetBrains_Mono']">
                {entry.wallet}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-y-3 gap-x-4 pl-11">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">P&amp;L</span>
          <span className={cn("text-sm font-['JetBrains_Mono'] font-medium", pnlColor(entry.pnl))}>
            {fmtSol(entry.pnl)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">ROI</span>
          <span className={cn("text-sm font-['JetBrains_Mono'] font-medium", pnlColor(entry.roi))}>
            {fmtPercent(entry.roi)}
          </span>
        </div>
        
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Win Rate</span>
          <span className="text-sm font-['JetBrains_Mono'] text-foreground">
            {entry.winRate.toFixed(1)}%
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Trades</span>
          <div className="flex items-center justify-between">
            <span className="text-sm font-['JetBrains_Mono'] text-foreground">
              {entry.trades}
            </span>
            <span className="text-[10px] text-muted-foreground">
              Best: <span className={cn("font-['JetBrains_Mono']", pnlColor(entry.bestTrade))}>{fmtSol(entry.bestTrade)}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Leaderboard() {
  const [activeTab, setActiveTab] = useState<"daily" | "weekly" | "all">("all");

  return (
    <div className="min-h-screen w-full bg-background text-foreground font-['Inter'] flex justify-center">
      <div className="w-full max-w-[390px] min-h-screen border-x border-border/50 flex flex-col relative overflow-hidden bg-background">
        
        {/* Header */}
        <div className="pt-6 px-4 pb-4 border-b border-border bg-background sticky top-0 z-10">
          <div className="flex items-center gap-2.5 mb-2">
            <Trophy className="w-5 h-5 text-accent" />
            <h1 className="text-xl font-semibold tracking-[0.02em]">Leaderboard</h1>
          </div>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Ranked by realized P&amp;L from closed trades only. Minimum 5 closed trades to appear.
          </p>
          
          {/* Tabs */}
          <div className="flex items-center gap-6 mt-6">
            {(["daily", "weekly", "all"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "pb-2 text-[13px] font-medium uppercase tracking-wider transition-colors relative",
                  activeTab === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "all" ? "All Time" : tab}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-8">
          <div className="flex flex-col">
            {MOCK_TRADERS.map((entry) => (
              <TraderRow key={entry.wallet} entry={entry} />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

import { Link } from "wouter";
import {
  TrendingUp,
  Target,
  Wallet,
  Trophy,
  Sparkles,
  LineChart,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: LineChart,
    title: "Live paper trading",
    desc: "Buy and sell real Solana tokens with virtual SOL at live on-chain prices. No real funds, no risk.",
  },
  {
    icon: TrendingUp,
    title: "Market discovery",
    desc: "Browse trending tokens with live price, market cap, liquidity, and volume so you always know where the action is.",
  },
  {
    icon: Wallet,
    title: "Portfolio tracking",
    desc: "Follow open positions, realized and unrealized P&L, ROI, and your full trade history in one place.",
  },
  {
    icon: Target,
    title: "Trade planning & smart exits",
    desc: "Plan entries, position size, and risk; set buy limit orders; and automate take-profit and stop-loss with multi-target exits that scale out of a position.",
  },
  {
    icon: Trophy,
    title: "Competitive leaderboard",
    desc: "Rank against other traders by realized P&L across daily, weekly, and all-time periods.",
  },
  {
    icon: Sparkles,
    title: "SOL Recovery",
    desc: "A real on-chain utility to reclaim trapped SOL rent from unused token accounts - separate from paper trading.",
  },
];

export default function Features() {
  return (
    <div className="flex flex-col gap-8 px-4 py-6 sm:py-10 max-w-4xl mx-auto">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-semibold">Features</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Everything you need to practice Solana trading and build a track
          record - without risking real money.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className="rounded-xl bg-card shadow-card p-5 flex items-start gap-4"
            >
              <div className="w-11 h-11 rounded-full bg-accent/12 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-accent" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold">{f.title}</div>
                <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          data-testid="link-features-start"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-accent text-accent bg-accent/10 hover:bg-accent/20 transition-colors"
        >
          Start trading <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/roadmap"
          data-testid="link-features-roadmap"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-border text-muted-foreground hover:border-accent hover:text-accent transition-colors"
        >
          See what's next
        </Link>
      </div>
    </div>
  );
}

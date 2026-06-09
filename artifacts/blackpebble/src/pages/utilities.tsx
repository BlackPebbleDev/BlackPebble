import { Sparkles, ChevronRight, Target } from "lucide-react";
import { Link } from "wouter";
import { useFeatureFlags } from "@/hooks/use-feature-flags";

const COMING_SOON = [
  "Copy Trading Simulation — Paper trade alongside top-performing users and leaderboard traders.",
  "Advanced Trading Analytics — Sharpe ratio, profit factor, expectancy, streak tracking, and detailed trade reviews.",
  "Smart Wallet Intelligence — Track successful wallets and study trading behavior.",
  "Community Challenges & Seasonal Competitions — Compete in structured paper trading tournaments.",
  "Community Growth Tools — DEX boost pools, marketing pools, community funding tools, and collaborative growth systems for projects.",
  "Telegram Trading & Research Tools — Market alerts, wallet tracking, scanners, and trading utilities.",
  "BlackPebble Token Ecosystem — Future rewards, incentives, platform perks, and community participation.",
  "BlackPebble Terminal — A more advanced trading workspace with professional-grade market intelligence.",
];

export default function Utilities() {
  const flags = useFeatureFlags();
  return (
    <div className="flex flex-col gap-8 px-4 py-6 sm:py-10 max-w-5xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Utilities</h1>
        <p className="text-sm text-muted-foreground">
          Standalone tools to help you manage your Solana wallet. These run
          directly on-chain and never touch your paper trading.
        </p>
      </div>

      <Link
        href="/utilities/sol-recovery"
        className="group border border-border bg-card hover:border-accent transition-colors p-5 flex items-center gap-4"
        data-testid="link-wallet-cleaner"
      >
        <div className="w-11 h-11 border border-accent/40 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">SOL Recovery</div>
          <p className="text-sm text-muted-foreground">
            Recover trapped SOL from unused token accounts and reclaim locked
            rent safely.
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors flex-shrink-0" />
      </Link>

      {flags.experimental_utilities && (
        <Link
          href="/utilities/trade-planner"
          className="group border border-border bg-card hover:border-accent transition-colors p-5 flex items-center gap-4"
          data-testid="link-trade-planner"
        >
          <div className="w-11 h-11 border border-accent/40 flex items-center justify-center flex-shrink-0">
            <Target className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Trade Planner</div>
            <p className="text-sm text-muted-foreground">
              Plan entries, targets, stops, position size, risk, and profit
              scenarios before taking a trade.
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors flex-shrink-0" />
        </Link>
      )}

      <div className="space-y-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Coming Soon
        </div>
        <div className="border border-border bg-card divide-y divide-border">
          {COMING_SOON.map((feature) => (
            <div
              key={feature}
              className="px-5 py-3.5 text-sm text-muted-foreground flex items-start gap-3"
            >
              <span className="w-1.5 h-1.5 bg-accent flex-shrink-0 mt-1.5" />
              {feature}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

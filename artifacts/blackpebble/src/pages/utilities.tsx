import { Sparkles, ChevronRight, Target } from "lucide-react";
import { Link } from "wouter";
import { useFeatureFlags } from "@/hooks/use-feature-flags";

export default function Utilities() {
  const flags = useFeatureFlags();
  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:py-10 max-w-5xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Utilities</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Standalone tools to help you manage your Solana wallet. These run
          directly on-chain and never touch your paper trading.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/utilities/sol-recovery"
          className="group card-interactive rounded-2xl bg-card shadow-card p-6 flex items-start gap-4"
          data-testid="link-wallet-cleaner"
        >
          <div className="w-12 h-12 rounded-full bg-accent/12 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-[22px] h-[22px] text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="text-lg font-bold">SOL Recovery</div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </div>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Recover trapped SOL from unused token accounts and reclaim locked
              rent safely.
            </p>
          </div>
        </Link>

        {flags.experimental_utilities && (
          <Link
            href="/utilities/trade-planner"
            className="group card-interactive rounded-2xl bg-card shadow-card p-6 flex items-start gap-4"
            data-testid="link-trade-planner"
          >
            <div className="w-12 h-12 rounded-full bg-accent/12 flex items-center justify-center flex-shrink-0">
              <Target className="w-[22px] h-[22px] text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-lg font-bold">Trade Planner</div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </div>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Plan entries, targets, stops, position size, risk, and profit
                scenarios before taking a trade.
              </p>
            </div>
          </Link>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        More BlackPebble tools are in the works — see the{" "}
        <Link
          href="/roadmap"
          data-testid="link-utilities-roadmap"
          className="text-accent hover:underline"
        >
          roadmap
        </Link>{" "}
        for what's next.
      </p>
    </div>
  );
}

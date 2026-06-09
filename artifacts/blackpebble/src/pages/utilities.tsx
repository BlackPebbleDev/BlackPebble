import { Sparkles, ChevronRight, Target } from "lucide-react";
import { Link } from "wouter";
import { useFeatureFlags } from "@/hooks/use-feature-flags";

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

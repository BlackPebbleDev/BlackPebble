import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { RealTradingAnalysisFull } from "@/components/real-trading-analysis";

/**
 * Trading Analysis utility - the full Real Trading Analysis experience.
 * Read-only on-chain intelligence: trader DNA, signals, insights, milestones.
 * Gated by the `real_trading_analysis` feature flag (mirrors other utilities).
 */
export default function TradingAnalysisPage() {
  const flags = useFeatureFlags();
  const [, navigate] = useLocation();

  // Flag ships dark - bounce to the utilities hub when disabled, but only
  // after the server has answered (never on the loading defaults).
  useEffect(() => {
    if (flags.ready && !flags.real_trading_analysis) navigate("/utilities");
  }, [flags.ready, flags.real_trading_analysis, navigate]);

  if (!flags.real_trading_analysis) return null;

  return (
    <div className="flex flex-col gap-6 px-4 md:px-6 py-6 sm:py-10 w-full max-w-6xl mx-auto">
      <div className="space-y-2">
        <Link
          href="/utilities"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent transition-colors"
          data-testid="link-back-utilities"
        >
          <ChevronLeft className="w-4 h-4" />
          Utilities
        </Link>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Trading Analysis
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          Your real trading home. Read-only intelligence built from your
          on-chain history - performance, trader DNA, behavior, risk, and how
          you're evolving. Never mixed with paper trading.
        </p>
      </div>

      <RealTradingAnalysisFull />
    </div>
  );
}

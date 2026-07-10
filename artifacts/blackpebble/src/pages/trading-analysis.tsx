import { useEffect } from "react";
import { useLocation } from "wouter";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { RealTradingAnalysisFull } from "@/components/real-trading-analysis";
import { UtilityPageHeader } from "@/components/utility-page-header";
import { getUtility } from "@/lib/utilities-meta";

const TRADING_ANALYSIS = getUtility("trading_analysis");
const TRADING_ANALYSIS_SUBTITLE =
  "Your real trading home. Read-only intelligence built from your on-chain history - performance, trader DNA, behavior, risk, and how you're evolving. Never mixed with paper trading.";

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
      <UtilityPageHeader
        utility={TRADING_ANALYSIS}
        subtitle={TRADING_ANALYSIS_SUBTITLE}
      />

      <RealTradingAnalysisFull />
    </div>
  );
}

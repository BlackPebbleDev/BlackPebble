import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Eye, ArrowRight } from "lucide-react";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { RealTradingAnalysisFull } from "@/components/real-trading-analysis";
import { UtilityPageHeader } from "@/components/utility-page-header";
import { LearnLink } from "@/components/education/learn-link";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { getUtility } from "@/lib/utilities-meta";

const TRADING_ANALYSIS = getUtility("trading_analysis");
const TRADING_ANALYSIS_SUBTITLE =
  "Read-only analysis of your on-chain history. Never mixed with paper trading.";

/**
 * Trading Analysis utility - the full Real Trading Analysis experience.
 * Read-only on-chain intelligence: trader DNA, signals, insights, milestones.
 * Gated by the `real_trading_analysis` feature flag (mirrors other utilities).
 */
const READ_ONLY_POINTS = [
  "BlackPebble reads public wallet history and balances.",
  "It cannot transfer tokens.",
  "It cannot approve token spending.",
  "It cannot sign transactions.",
  "It never needs your seed phrase or private key.",
];

function ReadOnlySafetyCard() {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem
        value="read-only-safety"
        className="rounded-xl border border-border/60 bg-card shadow-card overflow-hidden"
        data-testid="trading-analysis-safety"
      >
        <AccordionTrigger className="px-4 py-3.5 hover:no-underline">
          <div className="flex items-start gap-3 text-left">
            <Eye className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                Read-only wallet analysis
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                This tool cannot move funds.
              </div>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4">
          <ul className="space-y-2 pl-7">
            {READ_ONLY_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground"
              >
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 ml-7 text-xs leading-relaxed text-muted-foreground/80">
            Testing wallet intelligence for the first time? Use a burner wallet
            or low-value wallet, keep valuable assets separate, and review what
            data is being analyzed.
          </p>
          <Link
            href="/safety"
            data-testid="link-analysis-safety-guide"
            className="mt-3 ml-7 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            Read wallet safety guide
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

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
    <div className="flex flex-col gap-5 px-4 md:px-6 py-5 sm:py-6 w-full max-w-6xl mx-auto">
      <UtilityPageHeader
        utility={TRADING_ANALYSIS}
        subtitle={TRADING_ANALYSIS_SUBTITLE}
        actions={
          <LearnLink
            slug="trade-performance-metrics"
            sourceSurface="product-trader-intelligence"
            label="Learn: reading your metrics"
          />
        }
      />

      <ReadOnlySafetyCard />

      <RealTradingAnalysisFull />
    </div>
  );
}

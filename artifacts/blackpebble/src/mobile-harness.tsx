/**
 * Mobile QA harness (Phase 2, Part 9). Renders the REAL MetricTile component
 * with the actual longest labels and values from each Trader Intelligence
 * section so Playwright can screenshot them at 360/390/430px and prove nothing
 * clips or ellipsizes. Not shipped to production (excluded from prerender; only
 * reachable via the dev server at /mobile-harness.html).
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { Search, Bell, TrendingUp, Star, Megaphone, ScrollText, MoreHorizontal, Share2, Copy } from "lucide-react";
import "./index.css";
import { MetricTile } from "./components/metric-tile";
import { PageHeader } from "./components/page-header";
import { FilterPills } from "./components/filter-pills";
import {
  HistoricalRiskSection,
  CoverageBanner,
  HoldingsQualitySection,
} from "./components/real-trading-intelligence";
import {
  EntryIntelligenceSection,
  ExitIntelligenceSection,
  CurrentLiquiditySection,
} from "./components/trader-intelligence/entry-exit-intelligence";
import type { RealAnalysisSummary } from "./lib/api";
import { TooltipProvider } from "./components/ui/tooltip";
import { fmtSolMag, fmtSignedSolMag, fmtUsdSmart, pnlColor } from "./lib/format";
import { cn } from "./lib/utils";

// Extreme mock values (large/negative/decimal SOL) to prove nothing clips.
const MOCK_ANALYSIS = {
  historicalRisk: {
    sampleSize: 128,
    confidence: 1,
    confidenceTier: "high",
    maxDrawdownSol: 1284.5321,
    maxDrawdownPercent: 63.2,
    avgDrawdownSol: 42.19,
    currentDrawdownSol: 1200.2911,
    longestDrawdownSec: 5 * 86400 + 3600,
    medianRecoverySec: 2 * 86400,
    medianTradesToRecover: 6,
    drawdownCount: 9,
    maxConsecutiveLosses: 7,
    maxConsecutiveWins: 5,
    currentStreak: -3,
    profitFactor: 1.42,
    expectancySol: -12.3319,
    payoffRatio: 0.87,
    resultVolatilitySol: 214.7733,
    downsideVolatilitySol: 98.21,
    positionSizeVolatility: 1.34,
    tailLossConcentration: 0.82,
    tailGainConcentration: 0.71,
    profileTier: "highly_volatile",
    profileBreakdown: { resultDispersion: 2.1, drawdownSeverity: 6.2, tailLossConcentration: 0.82 },
    limitations: [
      "Reconstructed from on-chain swap history, not a brokerage account equity curve.",
      "Only completed round trips are included; open positions and transfers are excluded.",
    ],
  },
  coverage: {
    parsedSwaps: 1284,
    unsupportedSwaps: 42,
    completedTrades: 128,
    verifiedHoldings: 6,
    unpricedHoldings: 4,
    holdingsVerified: true,
    historyTruncated: true,
    droppedGhostMints: 3,
    firstTradeAt: 1_690_000_000,
    lastTradeAt: 1_705_000_000,
    parseCoverage: 0.968,
    pricingCoverage: 0.6,
    tier: "limited",
    summary: "Limited coverage — some data was unavailable; read the limitations below.",
    limitations: [
      "42 token-to-token swaps could not be reconstructed in SOL terms and are excluded.",
      "Swap history exceeded the per-sync limit, so the oldest trades are not yet included.",
      "4 current holdings could not be priced and are excluded from valuation (never counted as zero).",
    ],
  },
  holdingsQuality: {
    holdingsVerified: true,
    concentrationPercent: 71.4,
    positions: [
      { tokenMint: "BIGWHALEPOSITIONMINT1111111111", symbol: "WHALECOIN", logo: null, currentValueSol: 1284.5321, costBasisSol: 900.12, unrealizedPnlSol: 384.4121, sharePercent: 71.4, ageSec: 60 * 86400, sizeVsMedian: 6.2, classification: "oversized", tags: ["long_held"] },
      { tokenMint: "MID2222222222222222222222222222", symbol: "MID", logo: null, currentValueSol: 42.19, costBasisSol: 50.0, unrealizedPnlSol: -7.81, sharePercent: 18.0, ageSec: 2 * 86400, sizeVsMedian: 1.4, classification: "core", tags: ["recently_opened"] },
      { tokenMint: "NOPRICE333333333333333333333333", symbol: "GHOSTPRICE", logo: null, currentValueSol: null, costBasisSol: 3.2, unrealizedPnlSol: null, sharePercent: null, ageSec: 10 * 86400, sizeVsMedian: 0.4, classification: "unpriced", tags: [] },
    ],
    dimensions: [
      { key: "concentration", label: "Concentration", value: 29, available: true, note: "Higher is healthier." },
      { key: "pricing_coverage", label: "Pricing Coverage", value: 67, available: true, note: "Share priced." },
      { key: "position_sizing", label: "Position Sizing", value: 41, available: true, note: "Spread of value." },
      { key: "liquidity_coverage", label: "Liquidity Coverage", value: null, available: false, note: "Not available yet." },
    ],
    limitations: ["Reflects only live-verified, traced current holdings; untraced tokens are excluded."],
  },
  enrichmentStatus: "ready",
  entryQuality: {
    eligibleEntries: 128,
    analyzedEntries: 96,
    coveragePercent: 75,
    avgEntryScore: 58,
    medianEntryScore: 61,
    buyingAfterRunUpRate: 0.42,
    pullbackEntryRate: 0.31,
    immediateAdverseMoveRate: 0.28,
    positiveFollowThroughRate: 0.54,
    bestSupportedPattern: "pullback",
    weakestSupportedPattern: "rapid_rise",
    confidence: "medium",
    limitations: [
      "Historical candles were unavailable for 32 entries, which are excluded from scoring.",
      "Pre-entry windows use the most relevant pool near the trade time.",
    ],
  },
  exitQuality: {
    eligibleExits: 128,
    analyzedExits: 88,
    coveragePercent: 69,
    avgExitScore: 47,
    medianExitScore: 44,
    earlyExitRate: 0.38,
    panicExitRate: 0.12,
    strongProfitCaptureRate: 0.29,
    downsideAvoidanceRate: 0.41,
    avgCapturedFavorableExcursion: 52,
    confidence: "medium",
    limitations: [
      "Post-exit figures are historical hindsight and do not imply the move was predictable.",
      "4-hour post-exit windows were unavailable for some recent exits.",
    ],
  },
  liquidityRisk: {
    scope: "current",
    positions: [
      { mint: "BIGWHALEPOSITIONMINT1111111111", symbol: "WHALECOIN", liquidityUsd: 1_284_000, holdingValueUsd: 254_000, holdingToLiquidityPct: 19.8, band: "deep", exitability: "moderate", unpriced: false, missingLiquidity: false, limitations: [] },
      { mint: "MID2222222222222222222222222222", symbol: "MID", liquidityUsd: 42_000, holdingValueUsd: 8_400, holdingToLiquidityPct: 20.0, band: "thin", exitability: "difficult", unpriced: false, missingLiquidity: false, limitations: [] },
      { mint: "FRAGILE4444444444444444444444444", symbol: "FRAGILETOKENNAME", liquidityUsd: 6_200, holdingValueUsd: 5_900, holdingToLiquidityPct: 95.2, band: "fragile", exitability: "severe", unpriced: false, missingLiquidity: false, limitations: ["Trade size is a large share of pool liquidity."] },
      { mint: "NOPRICE333333333333333333333333", symbol: "GHOSTPRICE", liquidityUsd: null, holdingValueUsd: null, holdingToLiquidityPct: null, band: "unavailable", exitability: "unknown", unpriced: true, missingLiquidity: true, limitations: ["No live pool liquidity available."] },
    ],
    pricedHoldingsCoverage: 0.75,
    liquidityCoverage: 0.75,
    weightedLiquidityQuality: 62,
    largestHoldingToLiquidityPct: 95.2,
    fragilePositionsCount: 1,
    unavailablePositionsCount: 1,
    confidence: "medium",
    limitations: ["Current holdings only; never mixed with historical trade liquidity."],
  },
} as unknown as RealAnalysisSummary;

const MOCK_UNAVAILABLE = {
  ...MOCK_ANALYSIS,
  enrichmentStatus: "processing",
  entryQuality: {
    ...(MOCK_ANALYSIS as unknown as { entryQuality: unknown }).entryQuality as Record<string, unknown>,
    analyzedEntries: 0,
    coveragePercent: 0,
    avgEntryScore: null,
    medianEntryScore: null,
    confidence: "insufficient",
  },
  exitQuality: {
    ...(MOCK_ANALYSIS as unknown as { exitQuality: unknown }).exitQuality as Record<string, unknown>,
    analyzedExits: 0,
    coveragePercent: 0,
    avgExitScore: null,
    medianExitScore: null,
    confidence: "insufficient",
  },
} as unknown as RealAnalysisSummary;

/** Mirror of the hero Realized / Unrealized stacked value node (overflow-proof). */
function RealizedUnrealizedValue({
  realized,
  unrealized,
}: {
  realized: number;
  unrealized: number | null;
}) {
  return (
    <span className="flex w-full flex-col gap-2 text-lg sm:text-xl">
      <span className="flex min-w-0 flex-col">
        <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-muted-foreground">
          Realized
        </span>
        <span className={cn("tabular-nums break-words leading-tight", pnlColor(realized))}>
          {fmtSignedSolMag(realized)} SOL
        </span>
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-muted-foreground">
          Unrealized
        </span>
        {unrealized != null ? (
          <span className={cn("tabular-nums break-words leading-tight", pnlColor(unrealized))}>
            {fmtSignedSolMag(unrealized)} SOL
          </span>
        ) : (
          <span className="text-warning text-sm">Unverified</span>
        )}
      </span>
    </span>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section data-section={id} style={{ padding: 12 }}>
      <div className="stat-label" style={{ marginBottom: 8 }}>{title}</div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">{children}</div>;
}

/** Mirror of the compacted AppShell chrome (Design System v2) for visual QA. */
function ChromeMock() {
  return (
    <div>
      {/* Compact header: h-16 mobile / h-20 desktop */}
      <div className="h-16 sm:h-20 flex items-center gap-3 sm:gap-4 px-4 border-b border-border bg-background/95">
        <div className="w-[132px] sm:w-[184px] h-7 rounded bg-accent/20 flex-shrink-0" />
        <div className="flex-1 max-w-xl mx-auto hidden sm:block">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
            <div className="w-full h-11 rounded-xl bg-surface-2 border border-border pl-10 flex items-center text-sm text-muted-foreground">
              Search tokens, wallets, pages…
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <div className="h-9 w-9 rounded-full bg-surface-2 border border-border flex items-center justify-center">
            <Bell className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="h-9 px-3 rounded-full bg-surface-2 border border-border flex items-center gap-2 text-sm">
            <span className="w-5 h-5 rounded-full bg-accent/30" />
            <span className="truncate max-w-[90px]">@blackpebble</span>
          </div>
        </div>
      </div>
      {/* Mobile search row */}
      <div className="sm:hidden px-4 py-1.5 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
          <div className="w-full h-11 rounded-xl bg-surface-2 border border-border pl-10 flex items-center text-sm text-muted-foreground">
            Search…
          </div>
        </div>
      </div>
    </div>
  );
}

const WRAP_TABS = [
  { id: "all", label: "All" },
  { id: "calls", label: "Calls" },
  { id: "thesis", label: "Thesis" },
] as const;

const SCROLL_TABS = [
  { id: "trending", label: "Trending" },
  { id: "gainers", label: "Top Gainers" },
  { id: "losers", label: "Top Losers" },
  { id: "new", label: "New Pairs" },
  { id: "volume", label: "Volume" },
  { id: "marketcap", label: "Market Cap" },
  { id: "watchlist", label: "Watchlist" },
] as const;

function App() {
  const [wrap, setWrap] = React.useState<(typeof WRAP_TABS)[number]["id"]>("all");
  const [scroll, setScroll] = React.useState<(typeof SCROLL_TABS)[number]["id"]>("trending");
  return (
    <TooltipProvider delayDuration={0}>
    <div style={{ maxWidth: "100%", overflowX: "hidden", color: "white" }}>
      <ChromeMock />

      <Section id="pageheader" title="Shared PageHeader">
        <PageHeader
          icon={TrendingUp}
          title="Markets"
          actions={
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono font-semibold tracking-widest uppercase text-[10px] text-emerald-400">
                Live
              </span>
            </span>
          }
        />
        <PageHeader
          icon={TrendingUp}
          title="Community Campaigns"
          subtitle="Escrow-backed community funding with a fully public money trail."
        />
      </Section>

      <Section id="tokenactions" title="Token page action buttons (pill-sized)">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { icon: Star, label: "Watch" },
            { icon: Megaphone, label: "Call" },
            { icon: ScrollText, label: "Thesis" },
            { icon: MoreHorizontal, label: "More" },
            { icon: Share2, label: "Share" },
            { icon: Copy, label: "7Yg…k3pN" },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              className="flex items-center gap-2 px-3 h-8 rounded-full text-xs font-medium bg-secondary/60 text-muted-foreground transition-all"
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section id="filters" title="Shared FilterPills (scroll + wrap)">
        <div className="mb-3">
          <FilterPills
            options={SCROLL_TABS}
            value={scroll}
            onChange={(id) => setScroll(id as typeof scroll)}
            scroll
            ariaLabel="Scroll filter"
          />
        </div>
        <FilterPills
          options={WRAP_TABS}
          value={wrap}
          onChange={(id) => setWrap(id as typeof wrap)}
          ariaLabel="Wrap filter"
        />
      </Section>

      <Section id="summary" title="Trading Analysis summary">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <MetricTile label="On-Chain Portfolio" size="lg" value={`${fmtSolMag(39.7312)} SOL`} sub={fmtUsdSmart(7731.4)} tone="default" />
          <MetricTile label="Historical Trading P&L" size="lg" value={`${fmtSignedSolMag(-1243.51)} SOL`} tone="negative" />
          <MetricTile
            label="Realized / Unrealized"
            size="lg"
            value={<RealizedUnrealizedValue realized={-1200.29} unrealized={-43.31} />}
            sub="Closed trades vs open positions"
          />
          <MetricTile label="Portfolio Quality" size="lg" value={72} tone="positive" sub="Structure, concentration & asset quality" />
        </div>
      </Section>

      <Section id="profile" title="Trader Profile (style + strengths/weaknesses)">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
          <MetricTile label="Risk Style" value={<span className="text-base sm:text-lg">Aggressive</span>} tone="muted" />
          <MetricTile label="Decision Style" value={<span className="text-base sm:text-lg">Rule-based</span>} tone="muted" />
          <MetricTile label="Exit Style" value={<span className="text-base sm:text-lg">Fast exits</span>} tone="muted" />
          <MetricTile label="Trading Pace" value={<span className="text-base sm:text-lg">Rotational</span>} tone="muted" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/5 px-2.5 py-1 text-xs"><span className="font-medium">Conviction</span><span className="tabular-nums text-success">77</span></span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-amber-500/5 px-2.5 py-1 text-xs"><span className="font-medium">Profitability</span><span className="tabular-nums text-warning">41</span></span>
        </div>
      </Section>

      <Section id="signals" title="Trader Intelligence signals">
        <Grid>
          <MetricTile label="Consistency" value="63" delta={{ value: 8, direction: "up-good" }} onClick={() => {}} />
          <MetricTile label="Risk Appetite" value="88" delta={{ value: 12, direction: "neutral", label: "changed" }} onClick={() => {}} />
          <MetricTile label="Profitability" value="41" delta={{ value: -6, direction: "up-good" }} onClick={() => {}} />
          <MetricTile label="Conviction" value="77" onClick={() => {}} />
          <MetricTile label="Trading Breadth" value="100" delta={{ value: 0, direction: "neutral", label: "new" }} onClick={() => {}} />
          <MetricTile label="Drawdowns" value="Insufficient data" tone="warning" onClick={() => {}} />
        </Grid>
      </Section>

      <Section id="risk" title="Risk & Exposure (current only)">
        <Grid>
          <MetricTile label="Current Exposure" value={`${fmtSolMag(0.0249)} SOL`} />
          <MetricTile label="Concentration" value="100%" tone="negative" />
          <MetricTile label="Open Positions" value={1} />
          <MetricTile label="Unrealized P&L" value="Unverified" tone="warning" />
          <MetricTile label="Unpriced Holdings" value={2} tone="warning" />
          <MetricTile label="Dead / Dust" value="3 / 5" tone="warning" />
        </Grid>
      </Section>

      <Section id="coverage" title="Report Coverage banner (Phase 2B)">
        <CoverageBanner analysis={MOCK_ANALYSIS} />
      </Section>

      <Section id="historicalrisk" title="Historical Risk Intelligence (Phase 2B)">
        <HistoricalRiskSection analysis={MOCK_ANALYSIS} />
      </Section>

      <Section id="holdingsquality" title="Current Holdings Quality (Phase 2B)">
        <HoldingsQualitySection analysis={MOCK_ANALYSIS} />
      </Section>

      <Section id="entryintelligence" title="Entry Intelligence (Phase 2C)">
        <EntryIntelligenceSection analysis={MOCK_ANALYSIS} onOpenTrades={() => {}} />
      </Section>

      <Section id="exitintelligence" title="Exit Intelligence (Phase 2C)">
        <ExitIntelligenceSection analysis={MOCK_ANALYSIS} onOpenTrades={() => {}} />
      </Section>

      <Section id="currentliquidity" title="Current Holdings Liquidity (Phase 2C)">
        <CurrentLiquiditySection analysis={MOCK_ANALYSIS} />
      </Section>

      <Section id="entryintelligence-processing" title="Entry Intelligence — processing state (Phase 2C)">
        <EntryIntelligenceSection analysis={MOCK_UNAVAILABLE} onEnrich={() => {}} />
      </Section>

      <Section id="exitintelligence-processing" title="Exit Intelligence — processing state (Phase 2C)">
        <ExitIntelligenceSection analysis={MOCK_UNAVAILABLE} onEnrich={() => {}} />
      </Section>

      <Section id="detailed" title="Detailed Metrics (single reference)">
        <Grid>
          <MetricTile label="Win Rate" value="52.4%" tone="positive" />
          <MetricTile label="Completed Round Trips" value={128} />
          <MetricTile label="Avg Gain" value={`${fmtSignedSolMag(4.2)} SOL`} tone="positive" />
          <MetricTile label="Avg Loss" value={`${fmtSolMag(2.1)} SOL`} tone="negative" />
          <MetricTile label="Largest Gain" value={`${fmtSolMag(842.5)} SOL`} tone="positive" />
          <MetricTile label="Largest Loss" value={`${fmtSolMag(1250.9)} SOL`} tone="negative" />
          <MetricTile label="Avg Entry Size" value={`${fmtSolMag(12.4)} SOL`} />
          <MetricTile label="Breakeven Trades" value={4} />
          <MetricTile label="Avg FDV Bought" value={fmtUsdSmart(19_800_000)} />
          <MetricTile label="Median Hold" value="7.6h" />
          <MetricTile label="Swaps / Week" value="16.0" />
          <MetricTile label="Unique Tokens" value={137} />
          <MetricTile label="Wallet Age" value="212d" />
        </Grid>
      </Section>
    </div>
    </TooltipProvider>
  );
}

createRoot(document.getElementById("harness-root")!).render(<App />);

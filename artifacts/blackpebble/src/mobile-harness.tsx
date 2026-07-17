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
import { fmtSolMag, fmtSignedSolMag, fmtUsdSmart } from "./lib/format";

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
        <Grid>
          <MetricTile label="On-Chain Portfolio" value={`${fmtSolMag(39.7312)} SOL`} sub={fmtUsdSmart(7731.4)} tone="default" />
          <MetricTile label="Historical Trading P&L" value={`${fmtSignedSolMag(-1243.51)} SOL`} tone="negative" />
          <MetricTile label="Portfolio Quality" value="72 / 100" tone="positive" />
          <MetricTile label="Realized / Unrealized" value={`${fmtSignedSolMag(-1200.2)} SOL`} sub={`${fmtSignedSolMag(-43.3)} SOL unrealized`} />
        </Grid>
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

      <Section id="risk" title="Risk & Exposure">
        <Grid>
          <MetricTile label="Current Exposure" value={`${fmtSolMag(0.0249)} SOL`} />
          <MetricTile label="Concentration" value="100%" tone="negative" />
          <MetricTile label="Open Positions" value={1} />
          <MetricTile label="Unrealized P&L" value="Unverified" tone="warning" />
          <MetricTile label="Avg Historical Entry" value={`${fmtSolMag(12.4)} SOL`} />
          <MetricTile label="Historical Breadth" value={137} />
        </Grid>
      </Section>

      <Section id="detailed" title="Detailed Metrics">
        <Grid>
          <MetricTile label="Win Rate" value="52.4%" tone="positive" />
          <MetricTile label="Completed Round Trips" value={128} />
          <MetricTile label="Breakeven Trades" value={4} />
          <MetricTile label="Avg FDV Bought" value={fmtUsdSmart(19_800_000)} />
          <MetricTile label="Avg Mkt Cap Bought" value={fmtUsdSmart(3_000)} />
          <MetricTile label="Median Hold" value="7.6h" />
          <MetricTile label="Swaps / Week" value="16.0" />
          <MetricTile label="Wallet Age" value="212d" />
        </Grid>
      </Section>
    </div>
  );
}

createRoot(document.getElementById("harness-root")!).render(<App />);

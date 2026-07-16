/**
 * Mobile QA harness (Phase 2, Part 9). Renders the REAL MetricTile component
 * with the actual longest labels and values from each Trader Intelligence
 * section so Playwright can screenshot them at 360/390/430px and prove nothing
 * clips or ellipsizes. Not shipped to production (excluded from prerender; only
 * reachable via the dev server at /mobile-harness.html).
 */
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { MetricTile } from "./components/metric-tile";
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

function App() {
  return (
    <div style={{ maxWidth: "100%", overflowX: "hidden", color: "white" }}>
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

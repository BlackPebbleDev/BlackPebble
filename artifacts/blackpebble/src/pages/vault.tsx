import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartOptions
} from "chart.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

ChartJS.register(ArcElement, Tooltip, Legend);

const fadeIn = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } }
};

// Base URL for API calls — api-server sits at /api
const API_BASE = "/api";

interface Stats {
  fundWalletBalance: number;
  nextDistributionPool: string;
  totalDistributed: number;
  totalDistributedUSD: string;
  eligibleHolders: number;
  totalHolders: number;
  operationsCompleted: number;
  lastUpdated: string;
  status: string;
  dataFresh: boolean;
}

interface TierData {
  name: string;
  holders: number;
  percentage: number;
  color: string;
}

interface TiersResponse {
  tiers: TierData[];
  totalEligible: number;
  lastUpdated: string;
  isPreLaunch: boolean;
}

interface Distribution {
  operationId: string;
  tokenName: string;
  totalDistributed: number;
  recipients: number;
  timestamp: string;
  txSignatures: string[];
  status: string;
}

interface HolderInfo {
  wallet: string;
  balance?: number;
  tier?: number;
  tierName?: string;
  loyaltyWeeks?: number;
  loyaltyMultiplier?: number;
  isDiamondHands?: boolean;
  estimatedAllocation?: number;
  rank?: number;
  eligible: boolean;
  reason?: string;
  message?: string;
  minimumBalance?: number;
}

function formatBalance(n: number) {
  return `${n.toFixed(2)} SOL`;
}
function formatHolders(n: number) {
  return n.toLocaleString();
}
function timeSince(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}
function truncateWallet(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-card ${className}`}
      style={{ backgroundColor: "#1a1a1a" }}
    />
  );
}

export default function Vault() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tiers, setTiers] = useState<TiersResponse | null>(null);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [holderInfo, setHolderInfo] = useState<HolderInfo | null>(null);
  const [holderLoading, setHolderLoading] = useState(false);
  const [lastUpdatedDisplay, setLastUpdatedDisplay] = useState("—");

  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, tiersRes, distRes] = await Promise.all([
        fetch(`${API_BASE}/stats`),
        fetch(`${API_BASE}/tiers`),
        fetch(`${API_BASE}/distributions`)
      ]);
      const statsData = await statsRes.json();
      const tiersData = await tiersRes.json();
      const distData = await distRes.json();
      setStats(statsData);
      setTiers(tiersData);
      setDistributions(distData.distributions || []);
      if (statsData.lastUpdated) setLastUpdatedDisplay(timeSince(statsData.lastUpdated));
    } catch {
      // keep last known state
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  useEffect(() => {
    if (!connected || !publicKey) {
      setHolderInfo(null);
      return;
    }
    setHolderLoading(true);
    fetch(`${API_BASE}/holder/${publicKey.toBase58()}`)
      .then((r) => r.json())
      .then((data) => setHolderInfo(data))
      .catch(() => setHolderInfo(null))
      .finally(() => setHolderLoading(false));
  }, [connected, publicKey]);

  const isPreLaunch = stats?.status === "pre-launch" || !stats;

  // Chart data
  const chartData = {
    labels: tiers?.tiers.map((t) => t.name) ?? ["Tier 1", "Tier 2", "Tier 3", "Tier 4"],
    datasets: [
      {
        data: tiers?.tiers.map((t) => t.percentage) ?? [25, 25, 25, 25],
        backgroundColor: tiers?.tiers.map((t) => t.color) ?? [
          "#c9a96e", "#a08540", "#6b5a2e", "#3d3420"
        ],
        borderColor: "#0a0a0a",
        borderWidth: 3,
        hoverBorderColor: "#c9a96e",
        hoverBorderWidth: 2
      }
    ]
  };

  const chartOptions: ChartOptions<"doughnut"> = {
    cutout: "68%",
    responsive: true,
    maintainAspectRatio: true,
    animation: { duration: 1200, easing: "easeInOutQuart" },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#141414",
        borderColor: "#1f1f1f",
        borderWidth: 1,
        titleColor: "#c9a96e",
        bodyColor: "#a0a0a0",
        callbacks: {
          label: (ctx) => {
            const tier = tiers?.tiers[ctx.dataIndex];
            return tier
              ? ` ${tier.percentage}% — ${tier.holders} holders`
              : ` ${ctx.parsed}%`;
          }
        }
      }
    }
  };

  const totalEligible = tiers?.totalEligible ?? 0;

  return (
    <div className="flex flex-col w-full">
      {/* Hero */}
      <section className="min-h-[40vh] flex flex-col items-center justify-center py-28 px-6 border-b border-border">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="max-w-[1200px] w-full mx-auto"
        >
          <p className="text-xs uppercase tracking-widest text-accent mb-6">Fund Transparency</p>
          <h1 className="text-4xl md:text-6xl lg:text-[68px] font-serif leading-tight max-w-2xl mb-8">
            The Vault
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            Real-time transparency into fund operations and holdings.
          </p>
        </motion.div>
      </section>

      {/* Live Stats */}
      <section className="bg-card border-b border-border">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border"
        >
          {statsLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="py-14 px-8 flex flex-col items-center text-center gap-3">
                  <SkeletonBlock className="h-8 w-24" />
                  <SkeletonBlock className="h-3 w-32" />
                </div>
              ))
            : [
                {
                  label: "Fund Balance",
                  value: isPreLaunch ? "—" : formatBalance(stats!.fundWalletBalance),
                  sub: null
                },
                {
                  label: "Distribution Pool",
                  value: isPreLaunch ? "—" : stats!.nextDistributionPool,
                  sub: null
                },
                {
                  label: "Total Distributed",
                  value: isPreLaunch ? "—" : stats!.totalDistributedUSD,
                  sub: null
                },
                {
                  label: "Eligible Holders",
                  value: isPreLaunch ? "—" : formatHolders(stats!.eligibleHolders),
                  sub: null
                }
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  variants={fadeIn}
                  className="py-14 px-8 flex flex-col items-center text-center"
                  data-testid={`stat-vault-${i}`}
                >
                  <span className="text-accent text-3xl md:text-4xl font-serif mb-3">
                    {stat.value}
                  </span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider leading-snug">
                    {stat.label}
                  </span>
                </motion.div>
              ))}
        </motion.div>
        <div className="max-w-[1200px] mx-auto px-6 pb-4 text-center">
          <p className="text-xs" style={{ color: "#666" }}>
            {isPreLaunch
              ? "Live data available post-launch"
              : `Last updated: ${lastUpdatedDisplay}`}
          </p>
        </div>
      </section>

      {/* Donut Chart — Allocation Breakdown */}
      <section className="py-[100px] px-6 bg-background border-b border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="mb-12"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Allocations</p>
            <h2 className="text-3xl md:text-4xl font-serif mb-2">Shareholder Allocation Breakdown</h2>
            <p className="text-muted-foreground">Distribution weight by holder tier</p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="flex flex-col md:flex-row gap-12 items-center"
          >
            {/* Chart */}
            <div className="relative w-full md:w-[40%] max-w-[320px] mx-auto md:mx-0 flex-shrink-0">
              <Doughnut data={chartData} options={chartOptions} />
              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-serif text-accent">{formatHolders(totalEligible)}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Eligible</span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-5 w-full">
              {tiers?.isPreLaunch && (
                <p className="text-xs text-muted-foreground border border-border px-4 py-3 mb-6">
                  Allocation data will populate once $BLK is live and holder snapshots begin.
                </p>
              )}
              {(tiers?.tiers ?? [
                { name: "Tier 1 (Top 10)", percentage: 25, holders: 0, color: "#c9a96e" },
                { name: "Tier 2 (Top 11-50)", percentage: 25, holders: 0, color: "#a08540" },
                { name: "Tier 3 (Top 51-200)", percentage: 25, holders: 0, color: "#6b5a2e" },
                { name: "Tier 4 (Remaining)", percentage: 25, holders: 0, color: "#3d3420" }
              ]).map((tier, i) => (
                <div key={i} className="flex items-center justify-between gap-4" data-testid={`legend-tier-${i}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tier.color }} />
                    <span className="text-sm text-muted-foreground truncate">{tier.name}</span>
                  </div>
                  <span className="text-sm font-mono text-accent flex-shrink-0">{tier.percentage}%</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Wallet Connect — Check Your Allocation */}
      <section className="py-[100px] px-6 bg-card border-b border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="mb-10"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Shareholder Lookup</p>
            <h2 className="text-3xl md:text-4xl font-serif mb-3">Check Your Allocation</h2>
            <p className="text-muted-foreground">
              Connect your wallet to view your shareholder status and estimated distribution weight.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
          >
            {!connected ? (
              <button
                onClick={() => setVisible(true)}
                data-testid="button-connect-wallet"
                className="px-8 py-4 text-xs uppercase tracking-widest transition-all duration-300"
                style={{
                  border: "1px solid #c9a96e",
                  color: "#c9a96e",
                  background: "transparent"
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#c9a96e";
                  (e.currentTarget as HTMLButtonElement).style.color = "#0a0a0a";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  (e.currentTarget as HTMLButtonElement).style.color = "#c9a96e";
                }}
              >
                Connect Wallet
              </button>
            ) : holderLoading ? (
              <div className="border border-border p-10 max-w-[560px] space-y-4" style={{ background: "#141414" }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonBlock key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : holderInfo ? (
              <div className="border border-border p-10 max-w-[560px]" style={{ background: "#141414" }} data-testid="card-holder-status">
                {holderInfo.eligible ? (
                  <>
                    <p className="text-xs uppercase tracking-widest text-accent mb-8">Your Shareholder Status</p>
                    <div className="space-y-4 mb-8">
                      <Row label="Wallet" value={truncateWallet(holderInfo.wallet)} />
                      <Row label="$BLK Balance" value={holderInfo.balance?.toLocaleString() ?? "—"} />
                      <Row label="Tier" value={`${holderInfo.tier} — ${holderInfo.tierName}`} gold />
                      <Row
                        label="Loyalty"
                        value={`${holderInfo.loyaltyWeeks} week${holderInfo.loyaltyWeeks !== 1 ? "s" : ""} (${holderInfo.loyaltyMultiplier}x multiplier)`}
                        gold
                      />
                      <Row
                        label="Diamond Hands"
                        value={holderInfo.isDiamondHands ? "Yes (1.5x bonus)" : "No"}
                        gold={holderInfo.isDiamondHands}
                      />
                      <Row label="Estimated Allocation" value={`${holderInfo.estimatedAllocation?.toFixed(2)}%`} gold />
                      <Row
                        label="Rank"
                        value={`#${holderInfo.rank} of ${formatHolders(tiers?.totalEligible ?? 0)} eligible`}
                      />
                    </div>
                    <button
                      onClick={() => disconnect()}
                      data-testid="button-disconnect-wallet"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wider uppercase"
                    >
                      Disconnect
                    </button>
                  </>
                ) : holderInfo.reason === "pre-launch" ? (
                  <>
                    <p className="text-xs uppercase tracking-widest text-accent mb-6">Connected</p>
                    <p className="text-sm text-muted-foreground mb-2">
                      Wallet: <span className="text-foreground">{truncateWallet(holderInfo.wallet)}</span>
                    </p>
                    <p className="text-muted-foreground text-sm leading-relaxed mt-4 mb-6">
                      {holderInfo.message ?? "Shareholder data will be available once $BLK launches."}
                    </p>
                    <button
                      onClick={() => disconnect()}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wider uppercase"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
                      Wallet: {truncateWallet(holderInfo.wallet)}
                    </p>
                    <p className="text-sm text-muted-foreground my-4">
                      You are not currently a qualifying shareholder.
                    </p>
                    <p className="text-xs text-muted-foreground mb-6">
                      Minimum holding: {(holderInfo.minimumBalance ?? 100000).toLocaleString()} $BLK
                    </p>
                    <div className="flex gap-4 flex-wrap">
                      <a
                        href="#"
                        className="text-xs uppercase tracking-widest px-5 py-3 transition-colors"
                        style={{ border: "1px solid #c9a96e", color: "#c9a96e" }}
                      >
                        Acquire $BLK
                      </a>
                      <button
                        onClick={() => disconnect()}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wider uppercase"
                      >
                        Disconnect
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </motion.div>
        </div>
      </section>

      {/* Portfolio Holdings */}
      <section className="py-[100px] px-6 bg-background border-b border-border">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="mb-12"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Current Positions</p>
            <h2 className="text-3xl md:text-4xl font-serif">Portfolio Holdings</h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
          >
            <div className="border border-border overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-holdings">
                <thead>
                  <tr className="border-b border-border bg-card">
                    {["Asset", "Entry Market Cap", "Current Market Cap", "Status", "Date Acquired"].map((col) => (
                      <th key={col} className="px-6 py-4 text-left text-xs uppercase tracking-widest text-muted-foreground font-normal whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border hover:bg-card transition-colors">
                    <td className="px-6 py-5 text-muted-foreground font-mono text-xs">[REDACTED]</td>
                    <td className="px-6 py-5 text-muted-foreground">—</td>
                    <td className="px-6 py-5 text-muted-foreground">—</td>
                    <td className="px-6 py-5">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        <span className="text-accent text-xs tracking-widest uppercase">Accumulating</span>
                      </span>
                    </td>
                    <td className="px-6 py-5 text-muted-foreground">—</td>
                  </tr>
                </tbody>
              </table>
              <div className="px-6 py-4 border-t border-border bg-card">
                <p className="text-xs text-muted-foreground">
                  More positions will be disclosed as operations complete.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Distribution History */}
      <section className="py-[100px] px-6 bg-card">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
            className="mb-12"
          >
            <p className="text-xs uppercase tracking-widest text-accent mb-4">Distributions</p>
            <h2 className="text-3xl md:text-4xl font-serif">Distribution History</h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeIn}
          >
            <div className="border border-border overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-distributions">
                <thead>
                  <tr className="border-b border-border bg-background">
                    {["Operation", "Asset", "Distributed", "Recipients", "Date", "Verify"].map((col) => (
                      <th key={col} className="px-6 py-4 text-left text-xs uppercase tracking-widest text-muted-foreground font-normal whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {distributions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground text-sm">
                        No distributions yet. The first operation is pending. All future distributions will be verifiable on-chain with direct Solscan links.
                      </td>
                    </tr>
                  ) : (
                    distributions.map((d, i) => (
                      <tr key={i} className="border-b border-border hover:bg-background transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-accent">{d.operationId}</td>
                        <td className="px-6 py-4 text-foreground">{d.tokenName || "—"}</td>
                        <td className="px-6 py-4 text-muted-foreground">{d.totalDistributed?.toLocaleString() || "—"}</td>
                        <td className="px-6 py-4 text-muted-foreground">{d.recipients?.toLocaleString() || "—"}</td>
                        <td className="px-6 py-4 text-muted-foreground text-xs whitespace-nowrap">
                          {d.timestamp ? new Date(d.timestamp).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-6 py-4">
                          {d.txSignatures?.length === 1 ? (
                            <a
                              href={`https://solscan.io/tx/${d.txSignatures[0]}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-accent hover:text-foreground transition-colors tracking-wider"
                            >
                              View on Solscan
                            </a>
                          ) : d.txSignatures?.length > 1 ? (
                            <ExpandableTxLinks sigs={d.txSignatures} />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {distributions.length > 0 && (
              <p className="text-xs text-muted-foreground mt-4">
                All distributions are verifiable on-chain via Solana Explorer.
              </p>
            )}
          </motion.div>
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  gold = false
}: {
  label: string;
  value: string;
  gold?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-muted-foreground uppercase tracking-wider flex-shrink-0">{label}</span>
      <span className={`text-sm text-right ${gold ? "text-accent" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function ExpandableTxLinks({ sigs }: { sigs: string[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-accent hover:text-foreground transition-colors tracking-wider"
      >
        View {sigs.length} transactions
      </button>
      {expanded && (
        <div className="mt-2 space-y-1">
          {sigs.map((sig) => (
            <a
              key={sig}
              href={`https://solscan.io/tx/${sig}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-muted-foreground hover:text-accent transition-colors font-mono"
            >
              {sig.slice(0, 16)}...
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

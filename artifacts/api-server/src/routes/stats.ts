import { Router } from "express";
import db, { getCacheValue, isCacheFresh } from "../lib/database.js";
import { isPreLaunch, getTokenHolders } from "../lib/helius.js";
import { logger } from "../lib/logger.js";

const router = Router();

const PRE_LAUNCH_STATS = {
  fundWalletBalance: 0,
  nextDistributionPool: "Accumulating",
  totalDistributed: 0,
  totalDistributedUSD: "$0",
  eligibleHolders: 0,
  totalHolders: 0,
  operationsCompleted: 0,
  lastUpdated: new Date().toISOString(),
  status: "pre-launch",
  dataFresh: false
};

const PRE_LAUNCH_TIERS = {
  tiers: [
    { name: "Tier 1 (Top 10)", holders: 0, percentage: 25, color: "#c9a96e" },
    { name: "Tier 2 (Top 11-50)", holders: 0, percentage: 25, color: "#a08540" },
    { name: "Tier 3 (Top 51-200)", holders: 0, percentage: 25, color: "#6b5a2e" },
    { name: "Tier 4 (Remaining)", holders: 0, percentage: 25, color: "#3d3420" }
  ],
  totalEligible: 0,
  lastUpdated: new Date().toISOString(),
  isPreLaunch: true
};

// GET /api/stats
router.get("/stats", async (_req, res) => {
  try {
    if (isPreLaunch()) {
      return res.json(PRE_LAUNCH_STATS);
    }

    const cached = getCacheValue("stats");
    if (cached) {
      const data = JSON.parse(cached);
      data.dataFresh = isCacheFresh("stats", 5 * 60 * 60 * 1000);
      return res.json(data);
    }

    return res.json({ ...PRE_LAUNCH_STATS, status: "pre-launch" });
  } catch (err) {
    logger.error({ err }, "GET /api/stats error");
    return res.json(PRE_LAUNCH_STATS);
  }
});

// GET /api/tiers
router.get("/tiers", async (_req, res) => {
  try {
    if (isPreLaunch()) {
      return res.json(PRE_LAUNCH_TIERS);
    }

    const cached = getCacheValue("token_holders");
    if (!cached) {
      return res.json(PRE_LAUNCH_TIERS);
    }

    const holders: { wallet: string; balance: number }[] = JSON.parse(cached);
    const eligible = holders.length;

    const tier1 = Math.min(10, eligible);
    const tier2 = Math.min(40, Math.max(0, eligible - 10));
    const tier3 = Math.min(150, Math.max(0, eligible - 50));
    const tier4 = Math.max(0, eligible - 200);

    const totalWeight = tier1 * 4 + tier2 * 3 + tier3 * 2 + tier4 * 1;

    const tiers = [
      {
        name: "Tier 1 (Top 10)",
        holders: tier1,
        percentage: totalWeight > 0 ? Math.round((tier1 * 4 / totalWeight) * 1000) / 10 : 25,
        color: "#c9a96e"
      },
      {
        name: "Tier 2 (Top 11-50)",
        holders: tier2,
        percentage: totalWeight > 0 ? Math.round((tier2 * 3 / totalWeight) * 1000) / 10 : 25,
        color: "#a08540"
      },
      {
        name: "Tier 3 (Top 51-200)",
        holders: tier3,
        percentage: totalWeight > 0 ? Math.round((tier3 * 2 / totalWeight) * 1000) / 10 : 25,
        color: "#6b5a2e"
      },
      {
        name: "Tier 4 (Remaining)",
        holders: tier4,
        percentage: totalWeight > 0 ? Math.round((tier4 * 1 / totalWeight) * 1000) / 10 : 25,
        color: "#3d3420"
      }
    ];

    return res.json({
      tiers,
      totalEligible: eligible,
      lastUpdated: new Date().toISOString(),
      isPreLaunch: false
    });
  } catch (err) {
    logger.error({ err }, "GET /api/tiers error");
    return res.json(PRE_LAUNCH_TIERS);
  }
});

// GET /api/holder/:address
router.get("/holder/:address", async (req, res) => {
  try {
    const { address } = req.params;

    if (isPreLaunch()) {
      return res.json({
        wallet: address,
        eligible: false,
        reason: "pre-launch",
        message: "Shareholder data will be available once $BLK launches and snapshots begin. Your wallet is connected and ready."
      });
    }

    const cached = getCacheValue("token_holders");
    if (!cached) {
      return res.json({
        wallet: address,
        eligible: false,
        reason: "pre-launch",
        message: "Snapshot data not yet available."
      });
    }

    const holders: { wallet: string; balance: number }[] = JSON.parse(cached);
    const MIN_BALANCE = Number(process.env["MINIMUM_BLK_BALANCE"] || "100000");
    const rank = holders.findIndex((h) => h.wallet === address);

    if (rank === -1) {
      return res.json({
        wallet: address,
        eligible: false,
        reason: "Wallet not found in snapshot or below minimum threshold",
        minimumBalance: MIN_BALANCE
      });
    }

    const holder = holders[rank];
    if (holder.balance < MIN_BALANCE) {
      return res.json({
        wallet: address,
        balance: holder.balance,
        eligible: false,
        reason: "Below minimum threshold",
        minimumBalance: MIN_BALANCE
      });
    }

    const actualRank = rank + 1;
    let tier = 4;
    let tierName = "Tier 4 (Remaining)";
    if (actualRank <= 10) { tier = 1; tierName = "Tier 1 (Top 10)"; }
    else if (actualRank <= 50) { tier = 2; tierName = "Tier 2 (Top 11-50)"; }
    else if (actualRank <= 200) { tier = 3; tierName = "Tier 3 (Top 51-200)"; }

    // Check loyalty from holder_records history
    const loyaltyRows = db.prepare(
      "SELECT COUNT(DISTINCT snapshot_id) as weeks FROM holder_records WHERE wallet = ?"
    ).get(address) as { weeks: number } | undefined;
    const loyaltyWeeks = loyaltyRows?.weeks || 1;
    const loyaltyMultiplier = loyaltyWeeks >= 12 ? 2.0 : loyaltyWeeks >= 8 ? 1.75 : loyaltyWeeks >= 4 ? 1.5 : 1.0;

    // Diamond hands: always held (never had a gap)
    const isDiamondHands = loyaltyWeeks > 0;

    const totalHolders = holders.length;
    const tierWeight = tier === 1 ? 4 : tier === 2 ? 3 : tier === 3 ? 2 : 1;
    const estimatedAllocation = totalHolders > 0
      ? Math.round((tierWeight / (totalHolders * 2.5)) * 10000) / 100
      : 0;

    return res.json({
      wallet: address,
      balance: holder.balance,
      tier,
      tierName,
      loyaltyWeeks,
      loyaltyMultiplier,
      isDiamondHands,
      estimatedAllocation,
      rank: actualRank,
      eligible: true
    });
  } catch (err) {
    logger.error({ err }, "GET /api/holder/:address error");
    return res.json({ eligible: false, reason: "Server error" });
  }
});

// GET /api/distributions
router.get("/distributions", async (_req, res) => {
  try {
    const rows = db.prepare(
      "SELECT operation_id, token_name, token_mint, total_distributed, total_recipients, timestamp, tx_signatures, status FROM distributions ORDER BY timestamp DESC"
    ).all() as Array<{
      operation_id: string;
      token_name: string;
      token_mint: string;
      total_distributed: number;
      total_recipients: number;
      timestamp: string;
      tx_signatures: string;
      status: string;
    }>;

    const distributions = rows.map((r) => ({
      operationId: r.operation_id,
      tokenName: r.token_name,
      tokenMint: r.token_mint,
      totalDistributed: r.total_distributed,
      recipients: r.total_recipients,
      timestamp: r.timestamp,
      txSignatures: r.tx_signatures ? JSON.parse(r.tx_signatures) : [],
      status: r.status
    }));

    return res.json({ distributions });
  } catch (err) {
    logger.error({ err }, "GET /api/distributions error");
    return res.json({ distributions: [] });
  }
});

export default router;

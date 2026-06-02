import axios from "axios";
import db, { getCacheValue, setCacheValue, isCacheFresh } from "./database.js";
import { logger } from "./logger.js";

const HELIUS_API_KEY = process.env["HELIUS_API_KEY"] || "";
const BLK_MINT = process.env["BLK_MINT_ADDRESS"] || "TBA";
const FUND_WALLET = process.env["FUND_WALLET_ADDRESS"] || "";
const MIN_BALANCE = Number(process.env["MINIMUM_BLK_BALANCE"] || "100000");

export function isPreLaunch(): boolean {
  return !BLK_MINT || BLK_MINT === "TBA" || !HELIUS_API_KEY;
}

export async function getFundWalletBalance(): Promise<number> {
  if (isPreLaunch() || !FUND_WALLET) return 0;
  try {
    const res = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [FUND_WALLET]
      },
      { timeout: 10000 }
    );
    const lamports = res.data?.result?.value || 0;
    return lamports / 1e9;
  } catch (e) {
    logger.error({ err: e }, "Failed to get fund wallet balance");
    return 0;
  }
}

export async function getTokenHolders(): Promise<
  { wallet: string; balance: number }[]
> {
  if (isPreLaunch()) return [];
  const cacheKey = "token_holders";
  if (isCacheFresh(cacheKey, 4 * 60 * 60 * 1000)) {
    try {
      const cached = getCacheValue(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      // fall through
    }
  }

  try {
    const holders: { wallet: string; balance: number }[] = [];
    let cursor: string | null = null;

    while (true) {
      const body: Record<string, unknown> = {
        jsonrpc: "2.0",
        id: "helius",
        method: "getTokenAccounts",
        params: {
          mint: BLK_MINT,
          limit: 1000,
          ...(cursor ? { cursor } : {})
        }
      };
      const res = await axios.post(
        `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
        body,
        { timeout: 15000 }
      );
      const result = res.data?.result;
      if (!result || !result.token_accounts) break;
      for (const acct of result.token_accounts) {
        const balance = Number(acct.amount || 0) / 1e9;
        if (balance >= MIN_BALANCE) {
          holders.push({ wallet: acct.owner, balance });
        }
      }
      if (!result.cursor || result.token_accounts.length < 1000) break;
      cursor = result.cursor;
    }

    holders.sort((a, b) => b.balance - a.balance);
    setCacheValue(cacheKey, JSON.stringify(holders));
    return holders;
  } catch (e) {
    logger.error({ err: e }, "Failed to fetch token holders");
    try {
      const cached = getCacheValue(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return [];
  }
}

export async function takeSnapshot(): Promise<void> {
  if (isPreLaunch()) {
    logger.info("Pre-launch mode — skipping snapshot");
    return;
  }
  const holders = await getTokenHolders();
  const snapshotId = `snap_${Date.now()}`;
  const now = new Date().toISOString();

  const insertSnap = db.prepare(
    "INSERT OR IGNORE INTO snapshots (snapshot_id, timestamp, total_holders, eligible_holders, total_supply) VALUES (?, ?, ?, ?, ?)"
  );
  const insertHolder = db.prepare(
    "INSERT INTO holder_records (snapshot_id, wallet, balance) VALUES (?, ?, ?)"
  );

  const tx = db.transaction(() => {
    insertSnap.run(snapshotId, now, holders.length, holders.length, 0);
    for (const h of holders) {
      insertHolder.run(snapshotId, h.wallet, h.balance);
    }
  });
  tx();

  await updateStatsCache(holders);
  logger.info({ snapshotId, holderCount: holders.length }, "Snapshot completed");
}

export async function updateStatsCache(
  holders?: { wallet: string; balance: number }[]
): Promise<void> {
  if (!holders) holders = await getTokenHolders();
  const balance = await getFundWalletBalance();

  const stats = {
    fundWalletBalance: balance,
    nextDistributionPool: "Accumulating",
    totalDistributed: 0,
    totalDistributedUSD: "$0",
    eligibleHolders: holders.length,
    totalHolders: holders.length,
    operationsCompleted: 0,
    lastUpdated: new Date().toISOString(),
    status: holders.length > 0 ? "live" : "pre-launch",
    dataFresh: true
  };

  setCacheValue("stats", JSON.stringify(stats));
}

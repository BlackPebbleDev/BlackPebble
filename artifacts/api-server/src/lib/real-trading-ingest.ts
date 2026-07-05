/**
 * Helius-based on-chain swap ingestion for Real Trading Analysis.
 * Read-only: fetches publicly available transaction history.
 */

import axios from "axios";
import { dbAll, dbGet, dbRun, withTx } from "./database.js";
import { hasHelius } from "./helius.js";
import { logger } from "./logger.js";
import {
  type ParsedSwapEvent,
  parseSwapDeltas,
} from "./real-trading-math.js";
import { ensureRealTradingSchema } from "./real-trading-schema.js";

const HELIUS_API_KEY = process.env["HELIUS_API_KEY"] || "";
const LAMPORTS_PER_SOL = 1_000_000_000;
const PAGE_LIMIT = 100;
// Deep-history cap per sync run. Incremental syncs stop early at already-seen
// signatures, so this bound only applies to a wallet's first full backfill.
const MAX_PAGES_PER_SYNC = 20;

interface HeliusParsedTx {
  signature?: string;
  timestamp?: number;
  type?: string;
  source?: string;
  tokenTransfers?: Array<{
    mint?: string;
    fromUserAccount?: string;
    toUserAccount?: string;
    tokenAmount?: number | { uiAmount?: number };
  }>;
  nativeTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    amount?: number;
  }>;
}

export interface SyncResult {
  ok: boolean;
  wallet: string;
  newTrades: number;
  totalTrades: number;
  error?: string;
}

async function fetchSwapPage(
  wallet: string,
  before?: string,
): Promise<HeliusParsedTx[]> {
  if (!HELIUS_API_KEY) return [];

  const params = new URLSearchParams({
    "api-key": HELIUS_API_KEY,
    type: "SWAP",
    limit: String(PAGE_LIMIT),
  });
  if (before) params.set("before", before);

  const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?${params}`;
  const res = await axios.get<HeliusParsedTx[]>(url, { timeout: 15000 });
  return Array.isArray(res.data) ? res.data : [];
}

/** Resolve linked user_id for a wallet address. */
async function resolveUserId(wallet: string): Promise<number | null> {
  const row = await dbGet<{ user_id: number }>(
    `SELECT user_id FROM user_identities
     WHERE wallet_address = $1
     LIMIT 1`,
    [wallet],
  );
  return row?.user_id ?? null;
}

async function isSignatureCredited(signature: string): Promise<boolean> {
  const row = await dbGet<{ signature: string }>(
    `SELECT signature FROM real_credited_signatures WHERE signature = $1`,
    [signature],
  );
  return !!row;
}

async function insertTrade(
  wallet: string,
  userId: number | null,
  ev: ParsedSwapEvent,
): Promise<number | null> {
  const priceSol = ev.solAmount / ev.tokenAmount;
  const existing = await dbGet<{ id: number }>(
    `SELECT id FROM real_token_trades
     WHERE tx_signature = $1 AND token_mint = $2 AND side = $3`,
    [ev.signature, ev.tokenMint, ev.side],
  );
  if (existing) return null;

  const row = await dbGet<{ id: number }>(
    `INSERT INTO real_token_trades
       (wallet, user_id, tx_signature, token_mint, side, token_amount, sol_amount,
        price_sol, dex_source, block_time)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      wallet,
      userId,
      ev.signature,
      ev.tokenMint,
      ev.side,
      ev.tokenAmount,
      ev.solAmount,
      priceSol,
      ev.dexSource,
      ev.blockTime,
    ],
  );
  return row?.id ?? null;
}

export async function syncWalletTrades(
  wallet: string,
  options?: { force?: boolean },
): Promise<SyncResult> {
  await ensureRealTradingSchema();

  if (!hasHelius()) {
    return {
      ok: false,
      wallet,
      newTrades: 0,
      totalTrades: 0,
      error: "Helius API not configured - real analysis requires HELIUS_API_KEY",
    };
  }

  const userId = await resolveUserId(wallet);
  let newTrades = 0;
  let before: string | undefined;
  let lastSignature: string | null = null;
  let lastBlockTime: number | null = null;

  await dbRun(
    `INSERT INTO real_wallet_sync_jobs (wallet, user_id, status, updated_at)
     VALUES ($1, $2, 'syncing', EXTRACT(EPOCH FROM NOW())::bigint)
     ON CONFLICT (wallet) DO UPDATE
       SET status = 'syncing', updated_at = EXTRACT(EPOCH FROM NOW())::bigint`,
    [wallet, userId],
  );

  try {
    for (let page = 0; page < MAX_PAGES_PER_SYNC; page++) {
      const txs = await fetchSwapPage(wallet, before);
      if (txs.length === 0) break;

      let alreadySeenOnPage = 0;
      for (const tx of txs) {
        const sig = tx.signature;
        if (!sig) continue;
        lastSignature = sig;
        if (tx.timestamp) lastBlockTime = tx.timestamp;

        if (!options?.force && (await isSignatureCredited(sig))) {
          alreadySeenOnPage++;
          continue;
        }

        const ev = parseSwapDeltas(
          wallet,
          sig,
          tx.timestamp ?? Math.floor(Date.now() / 1000),
          tx.tokenTransfers ?? [],
          tx.nativeTransfers ?? [],
          tx.source ?? null,
        );
        if (!ev) continue;

        await withTx(async () => {
          const tradeId = await insertTrade(wallet, userId, ev);
          if (tradeId != null) {
            await dbRun(
              `INSERT INTO real_credited_signatures (signature, wallet, trade_id)
               VALUES ($1, $2, $3)
               ON CONFLICT (signature) DO NOTHING`,
              [sig, wallet, tradeId],
            );
            newTrades++;
          }
        });
      }

      if (txs.length < PAGE_LIMIT) break;
      // Incremental sync: a fully-seen page means we've caught up to history
      // that was already ingested - no need to page deeper.
      if (!options?.force && alreadySeenOnPage === txs.length) break;
      before = txs[txs.length - 1]?.signature;
      if (!before) break;
    }

    const countRow = await dbGet<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM real_token_trades WHERE wallet = $1`,
      [wallet],
    );
    const totalTrades = countRow?.cnt ?? 0;

    await dbRun(
      `UPDATE real_wallet_sync_jobs
       SET status = 'idle',
           last_signature = $2,
           last_synced_at = EXTRACT(EPOCH FROM NOW())::bigint,
           last_block_time = $3,
           trade_count = $4,
           error_message = NULL,
           updated_at = EXTRACT(EPOCH FROM NOW())::bigint
       WHERE wallet = $1`,
      [wallet, lastSignature, lastBlockTime, totalTrades],
    );

    return { ok: true, wallet, newTrades, totalTrades };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn({ err: e, wallet }, "Real trading sync failed");
    await dbRun(
      `UPDATE real_wallet_sync_jobs
       SET status = 'error', error_message = $2,
           updated_at = EXTRACT(EPOCH FROM NOW())::bigint
       WHERE wallet = $1`,
      [wallet, msg.slice(0, 500)],
    );
    return { ok: false, wallet, newTrades, totalTrades: 0, error: msg };
  }
}

export async function loadWalletEvents(
  wallet: string,
): Promise<ParsedSwapEvent[]> {
  const rows = await dbAll<{
    tx_signature: string;
    token_mint: string;
    side: string;
    token_amount: number;
    sol_amount: number;
    block_time: number;
    dex_source: string | null;
  }>(
    `SELECT tx_signature, token_mint, side, token_amount, sol_amount, block_time, dex_source
     FROM real_token_trades
     WHERE wallet = $1
     ORDER BY block_time ASC`,
    [wallet],
  );

  return rows.map((r) => ({
    signature: r.tx_signature,
    blockTime: r.block_time,
    tokenMint: r.token_mint,
    side: r.side as "buy" | "sell",
    tokenAmount: r.token_amount,
    solAmount: r.sol_amount,
    dexSource: r.dex_source,
  }));
}

export async function getLinkedWallets(): Promise<string[]> {
  const rows = await dbAll<{ wallet_address: string }>(
    `SELECT DISTINCT wallet_address FROM user_identities
     WHERE wallet_address IS NOT NULL
       AND wallet_address NOT LIKE 'x:%'`,
  );
  return rows.map((r) => r.wallet_address).filter(Boolean);
}

export async function estimateWalletAgeDays(
  wallet: string,
  firstTradeAt: number | null,
): Promise<number> {
  if (firstTradeAt) {
    return Math.max(
      1,
      Math.floor((Date.now() / 1000 - firstTradeAt) / 86400),
    );
  }
  return 0;
}

export { LAMPORTS_PER_SOL };

/**
 * Real Trading Analysis - schema bootstrap.
 *
 * Read-only on-chain trade ingestion and computed analysis snapshots.
 * Completely separate from paper trading tables (accounts, trades, etc.).
 */

import { dbRun } from "./database.js";
import { logger } from "./logger.js";

let schemaReady: Promise<void> | null = null;

export function ensureRealTradingSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await dbRun(`
        CREATE TABLE IF NOT EXISTS real_wallet_sync_jobs (
          wallet TEXT PRIMARY KEY,
          user_id INTEGER,
          last_signature TEXT,
          last_synced_at BIGINT,
          last_block_time BIGINT,
          status TEXT NOT NULL DEFAULT 'idle',
          error_message TEXT,
          trade_count INTEGER NOT NULL DEFAULT 0,
          created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint,
          updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
        )
      `);

      await dbRun(`
        CREATE TABLE IF NOT EXISTS real_token_trades (
          id SERIAL PRIMARY KEY,
          wallet TEXT NOT NULL,
          user_id INTEGER,
          tx_signature TEXT NOT NULL,
          token_mint TEXT NOT NULL,
          side TEXT NOT NULL,
          token_amount DOUBLE PRECISION NOT NULL,
          sol_amount DOUBLE PRECISION NOT NULL,
          price_sol DOUBLE PRECISION,
          price_usd DOUBLE PRECISION,
          market_cap_usd DOUBLE PRECISION,
          dex_source TEXT,
          block_time BIGINT NOT NULL,
          realized_pnl_sol DOUBLE PRECISION,
          hold_duration_sec BIGINT,
          ingested_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
        )
      `);

      await dbRun(`
        CREATE UNIQUE INDEX IF NOT EXISTS real_token_trades_sig_mint_side
          ON real_token_trades (tx_signature, token_mint, side)
      `);
      await dbRun(`
        CREATE INDEX IF NOT EXISTS idx_real_token_trades_wallet
          ON real_token_trades (wallet, block_time DESC)
      `);
      await dbRun(`
        CREATE INDEX IF NOT EXISTS idx_real_token_trades_mint
          ON real_token_trades (token_mint)
      `);

      await dbRun(`
        CREATE TABLE IF NOT EXISTS real_credited_signatures (
          signature TEXT PRIMARY KEY,
          wallet TEXT NOT NULL,
          trade_id INTEGER,
          credited_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
        )
      `);

      await dbRun(`
        CREATE TABLE IF NOT EXISTS real_analysis_snapshots (
          wallet TEXT PRIMARY KEY,
          user_id INTEGER,
          computed_at BIGINT NOT NULL,
          metrics_json TEXT NOT NULL,
          scores_json TEXT NOT NULL,
          personality TEXT,
          wallet_health_score INTEGER,
          open_positions_json TEXT,
          insights_json TEXT,
          sync_trade_count INTEGER NOT NULL DEFAULT 0,
          wallet_age_days INTEGER,
          data_sources TEXT NOT NULL DEFAULT 'helius_swap_history'
        )
      `);
      // Full-fidelity snapshot columns so cached reads never lose data
      // (personality description/traits, wallet health breakdown, signals, DNA).
      await dbRun(
        `ALTER TABLE real_analysis_snapshots
           ADD COLUMN IF NOT EXISTS personality_json TEXT`,
      );
      await dbRun(
        `ALTER TABLE real_analysis_snapshots
           ADD COLUMN IF NOT EXISTS wallet_health_json TEXT`,
      );
      await dbRun(
        `ALTER TABLE real_analysis_snapshots
           ADD COLUMN IF NOT EXISTS signals_json TEXT`,
      );
      await dbRun(
        `ALTER TABLE real_analysis_snapshots
           ADD COLUMN IF NOT EXISTS dna_json TEXT`,
      );
      // Holdings are reconciled against LIVE on-chain balances; these track
      // whether that verification succeeded and how many ghost positions
      // (traded but no longer held) were dropped.
      await dbRun(
        `ALTER TABLE real_analysis_snapshots
           ADD COLUMN IF NOT EXISTS holdings_verified BOOLEAN NOT NULL DEFAULT FALSE`,
      );
      await dbRun(
        `ALTER TABLE real_analysis_snapshots
           ADD COLUMN IF NOT EXISTS dropped_ghost_mints INTEGER NOT NULL DEFAULT 0`,
      );

      // ── Signal registry time series (reputation engine foundation) ────────
      // One row per (wallet, signal, computation). History powers profile
      // deltas ("Consistency 61 → 69") and future reputation consumers.
      await dbRun(`
        CREATE TABLE IF NOT EXISTS real_signal_values (
          id SERIAL PRIMARY KEY,
          wallet TEXT NOT NULL,
          user_id INTEGER,
          signal_key TEXT NOT NULL,
          value DOUBLE PRECISION NOT NULL,
          confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
          computed_at BIGINT NOT NULL
        )
      `);
      await dbRun(`
        CREATE INDEX IF NOT EXISTS idx_real_signal_values_lookup
          ON real_signal_values (wallet, signal_key, computed_at DESC)
      `);

      // ── Trader DNA (evolving trait vector, not static labels) ─────────────
      await dbRun(`
        CREATE TABLE IF NOT EXISTS real_trader_dna (
          wallet TEXT PRIMARY KEY,
          user_id INTEGER,
          dna_vector_json TEXT NOT NULL,
          primary_archetype TEXT NOT NULL,
          secondary_archetype TEXT,
          confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
          version INTEGER NOT NULL DEFAULT 1,
          computed_at BIGINT NOT NULL
        )
      `);

      // ── Timeline events (intelligence milestones - feed/profile source) ───
      // Milestones only, never raw trades. No wallet amounts/mints in payloads
      // beyond what the event type requires.
      await dbRun(`
        CREATE TABLE IF NOT EXISTS real_timeline_events (
          id SERIAL PRIMARY KEY,
          wallet TEXT NOT NULL,
          user_id INTEGER,
          event_type TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT,
          meta_json TEXT,
          visibility TEXT NOT NULL DEFAULT 'public',
          created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
        )
      `);
      await dbRun(`
        CREATE INDEX IF NOT EXISTS idx_real_timeline_wallet
          ON real_timeline_events (wallet, created_at DESC)
      `);
      await dbRun(`
        CREATE INDEX IF NOT EXISTS idx_real_timeline_public
          ON real_timeline_events (created_at DESC)
          WHERE visibility = 'public'
      `);

      await dbRun(`
        CREATE TABLE IF NOT EXISTS real_insights (
          id SERIAL PRIMARY KEY,
          wallet TEXT NOT NULL,
          insight_key TEXT NOT NULL,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          severity TEXT NOT NULL DEFAULT 'info',
          confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
          computed_at BIGINT NOT NULL,
          dismissed_at BIGINT
        )
      `);
      await dbRun(`
        CREATE UNIQUE INDEX IF NOT EXISTS real_insights_wallet_key
          ON real_insights (wallet, insight_key)
      `);

      logger.info("Real trading analysis schema ready");
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

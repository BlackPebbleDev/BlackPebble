import { dbRun } from "./database.js";
import { logger } from "./logger.js";

/**
 * Community Campaign Platform - schema (Phase 1: goal campaigns).
 *
 * Additive, isolated `campaign_*` tables following the real-trading precedent:
 * runtime idempotent DDL, no coupling to paper-trading accounting.
 *
 * Money model: every lamport that enters or leaves a campaign escrow is a row
 * in `campaign_ledger` (append-only). All UI numbers derive from that ledger;
 * every row that moved funds on-chain carries a tx signature. The escrow
 * service (campaign-escrow.ts) is the only writer of money rows.
 */

let ensured = false;

export async function ensureCampaignSchema(): Promise<void> {
  if (ensured) return;

  await dbRun(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id               BIGSERIAL PRIMARY KEY,
      public_id        TEXT NOT NULL UNIQUE,
      kind             TEXT NOT NULL DEFAULT 'goal',
      type_key         TEXT NOT NULL,
      creator_user_id  BIGINT NOT NULL,
      title            TEXT NOT NULL,
      brief            TEXT NOT NULL,
      token_mint       TEXT,
      image_url        TEXT,
      link_url         TEXT,
      goal_lamports    BIGINT NOT NULL,
      -- Fixed USD goal + tier label for preset campaigns ("30× Boost", $275).
      goal_usd         DOUBLE PRECISION,
      goal_label       TEXT,
      deadline_at      BIGINT NOT NULL,
      state            TEXT NOT NULL DEFAULT 'pending_funding',
      trust_score      INTEGER NOT NULL DEFAULT 0,
      escrow_address   TEXT NOT NULL UNIQUE,
      -- Fulfillment proof attached by an admin when the funded outcome is
      -- delivered (link / receipt / note). Required before 'settled'.
      fulfillment_note TEXT,
      fulfillment_url  TEXT,
      frozen_reason    TEXT,
      created_at       BIGINT NOT NULL,
      funded_at        BIGINT,
      settled_at       BIGINT
    )
  `);

  // Additive upgrades for databases created before these columns existed.
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS goal_usd DOUBLE PRECISION`,
  );
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS goal_label TEXT`,
  );
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS banner_url TEXT`,
  );

  await dbRun(`
    CREATE TABLE IF NOT EXISTS campaign_ledger (
      id            BIGSERIAL PRIMARY KEY,
      campaign_id   BIGINT NOT NULL REFERENCES campaigns(id),
      kind          TEXT NOT NULL, -- deposit | payout | refund | fee
      lamports      BIGINT NOT NULL,
      tx_signature  TEXT,
      counterparty  TEXT,
      note          TEXT,
      created_at    BIGINT NOT NULL
    )
  `);
  // A given on-chain transfer may only ever be credited once per campaign.
  await dbRun(`
    CREATE UNIQUE INDEX IF NOT EXISTS campaign_ledger_sig_uniq
      ON campaign_ledger (campaign_id, kind, tx_signature)
      WHERE tx_signature IS NOT NULL
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS campaign_ledger_campaign_idx
      ON campaign_ledger (campaign_id, created_at)
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS campaign_contributions (
      id            BIGSERIAL PRIMARY KEY,
      campaign_id   BIGINT NOT NULL REFERENCES campaigns(id),
      contributor   TEXT NOT NULL,       -- sender wallet address
      lamports      BIGINT NOT NULL,
      tx_signature  TEXT NOT NULL,
      refunded      BOOLEAN NOT NULL DEFAULT FALSE,
      refund_sig    TEXT,
      created_at    BIGINT NOT NULL,
      UNIQUE (campaign_id, tx_signature)
    )
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS campaign_contrib_campaign_idx
      ON campaign_contributions (campaign_id)
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS campaign_events (
      id           BIGSERIAL PRIMARY KEY,
      campaign_id  BIGINT NOT NULL REFERENCES campaigns(id),
      event_key    TEXT NOT NULL, -- launched | funded | completed | failed | frozen
      created_at   BIGINT NOT NULL,
      UNIQUE (campaign_id, event_key)
    )
  `);

  // Tracks the last processed deposit signature per campaign so the deposit
  // sweep is incremental instead of rescanning full history.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS campaign_sync_cursors (
      campaign_id  BIGINT PRIMARY KEY REFERENCES campaigns(id),
      last_sig     TEXT,
      updated_at   BIGINT NOT NULL
    )
  `);

  ensured = true;
  logger.info("Campaign schema ensured");
}

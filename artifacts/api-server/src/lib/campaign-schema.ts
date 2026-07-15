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

  // ── Phase 2: publication, opening contribution, activation quote ──
  // A campaign is only publicly discoverable once its opening contribution
  // confirms. Existing (pre-Phase-2) campaigns are backfilled to published.
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await dbRun(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS creator_wallet TEXT`);
  await dbRun(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS activated_at BIGINT`);
  await dbRun(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS expired_at BIGINT`);
  await dbRun(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS refunding_at BIGINT`);
  // SOL/USD quote locked when the opening contribution confirms.
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS activation_price_usd DOUBLE PRECISION`,
  );
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS activation_quote_provider TEXT`,
  );
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS activation_quote_at BIGINT`,
  );
  // The deadline window (seconds) chosen at creation; applied at activation.
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS duration_sec BIGINT NOT NULL DEFAULT 86400`,
  );

  // ── Phase 2: execution / fulfillment disclosure + tracking ──
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'operator_fulfilled'`,
  );
  await dbRun(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS provider_key TEXT`);
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS fulfillment_sla_seconds BIGINT NOT NULL DEFAULT 86400`,
  );
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS execution_status TEXT NOT NULL DEFAULT 'none'`,
  );
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS execution_attempt_count INTEGER NOT NULL DEFAULT 0`,
  );
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS execution_started_at BIGINT`,
  );
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS execution_deadline_at BIGINT`,
  );
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS execution_completed_at BIGINT`,
  );
  await dbRun(
    `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS execution_failure_reason TEXT`,
  );
  await dbRun(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS proof_type TEXT`);
  await dbRun(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS proof_value TEXT`);

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
      -- Contributor-safety classification of the sending wallet, set once at
      -- credit time: 'ok' | 'exchange' | 'program' | 'unknown'. A non-'ok'
      -- value means an automatic refund to this wallet may not reach the
      -- human contributor, so it is surfaced for admin review.
      refund_risk   TEXT NOT NULL DEFAULT 'ok',
      created_at    BIGINT NOT NULL,
      UNIQUE (campaign_id, tx_signature)
    )
  `);
  await dbRun(
    `ALTER TABLE campaign_contributions ADD COLUMN IF NOT EXISTS refund_risk TEXT NOT NULL DEFAULT 'ok'`,
  );
  await dbRun(`
    CREATE INDEX IF NOT EXISTS campaign_contrib_campaign_idx
      ON campaign_contributions (campaign_id)
  `);
  // Fast lookup of outstanding refunds when a failed campaign is processed.
  await dbRun(`
    CREATE INDEX IF NOT EXISTS campaign_contrib_refund_idx
      ON campaign_contributions (campaign_id, refunded)
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

  // A signature that touched the escrow but could not be parsed/credited. It is
  // retried on subsequent sweeps; once it exceeds the retry ceiling it is left
  // flagged (resolved = FALSE) so the cursor can advance past it without losing
  // visibility. Reconciliation surfaces any lingering unresolved failure.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS campaign_deposit_failures (
      id            BIGSERIAL PRIMARY KEY,
      campaign_id   BIGINT NOT NULL REFERENCES campaigns(id),
      tx_signature  TEXT NOT NULL,
      attempts      INTEGER NOT NULL DEFAULT 1,
      last_error    TEXT,
      resolved      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    BIGINT NOT NULL,
      updated_at    BIGINT NOT NULL,
      UNIQUE (campaign_id, tx_signature)
    )
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS campaign_deposit_failures_open_idx
      ON campaign_deposit_failures (campaign_id, resolved)
  `);

  // Append-only money-event audit trail. Distinct from admin_audit_log: this
  // records EVERY consequential money event (system + admin) for a campaign so
  // "where did my SOL go?" is always answerable from one place.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS campaign_audit_log (
      id             BIGSERIAL PRIMARY KEY,
      campaign_id    BIGINT REFERENCES campaigns(id),
      public_id      TEXT,
      event          TEXT NOT NULL,
      actor          TEXT NOT NULL DEFAULT 'system',
      wallet         TEXT,
      tx_signature   TEXT,
      lamports       BIGINT,
      result         TEXT NOT NULL DEFAULT 'ok', -- ok | error | warning | skipped
      detail         TEXT,
      correlation_id TEXT,
      created_at     BIGINT NOT NULL
    )
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS campaign_audit_campaign_idx
      ON campaign_audit_log (campaign_id, created_at)
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS campaign_audit_event_idx
      ON campaign_audit_log (event)
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS campaign_audit_result_idx
      ON campaign_audit_log (result)
  `);

  // Durable outbound transfer intents: one row per logical outbound transfer,
  // keyed by a deterministic operation_key so retries/restarts reuse it and we
  // check on-chain state before ever re-signing. Closes the crash-after-send gap.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS campaign_transfer_intents (
      id                      BIGSERIAL PRIMARY KEY,
      operation_key           TEXT NOT NULL UNIQUE,
      campaign_id             BIGINT NOT NULL REFERENCES campaigns(id),
      contribution_id         BIGINT,
      kind                    TEXT NOT NULL, -- payout | fee | refund
      destination             TEXT NOT NULL,
      lamports                BIGINT NOT NULL,
      state                   TEXT NOT NULL DEFAULT 'planned',
      tx_signature            TEXT,
      recent_blockhash        TEXT,
      last_valid_block_height BIGINT,
      attempt_count           INTEGER NOT NULL DEFAULT 0,
      error_code              TEXT,
      error_message           TEXT,
      correlation_id          TEXT,
      created_at              BIGINT NOT NULL,
      submitted_at            BIGINT,
      confirmed_at            BIGINT,
      recorded_at             BIGINT,
      updated_at              BIGINT NOT NULL
    )
  `);
  await dbRun(
    `CREATE INDEX IF NOT EXISTS campaign_intents_state_idx ON campaign_transfer_intents (state, updated_at)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS campaign_intents_campaign_idx ON campaign_transfer_intents (campaign_id)`,
  );

  // Indexes for the hot read paths (browse-by-state, per-creator spam check).
  await dbRun(
    `CREATE INDEX IF NOT EXISTS campaigns_state_idx ON campaigns (state, created_at DESC)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS campaigns_creator_idx ON campaigns (creator_user_id, state)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS campaigns_published_idx ON campaigns (published, state)`,
  );

  // ── One-time forward migration of legacy Phase 1 states (idempotent) ──
  // Terminal legacy states are renamed to canonical Phase 2 names. Ledger and
  // event history are never touched. Any campaign past activation is marked
  // published so existing campaigns stay visible.
  await dbRun(`UPDATE campaigns SET state = 'completed' WHERE state = 'settled'`);
  await dbRun(`UPDATE campaigns SET state = 'expired' WHERE state = 'failed'`);
  await dbRun(
    `UPDATE campaigns SET published = TRUE
      WHERE published = FALSE
        AND state NOT IN ('draft','awaiting_initial_contribution','cancelled')`,
  );

  ensured = true;
  logger.info("Campaign schema ensured");
}

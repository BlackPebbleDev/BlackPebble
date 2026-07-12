import type { Request } from "express";
import { dbAll, dbRun } from "./database.js";
import type { XSessionPayload } from "./auth.js";
import { logger } from "./logger.js";

/**
 * Persistent admin audit log. Every consequential admin action (resets, flag
 * changes, badge grants, moderation, cache clears, order interventions,
 * campaign actions) is recorded here so operator activity is traceable.
 *
 * The canonical definition lives in the committed Drizzle schema
 * (`@workspace/db` -> `adminAuditLog`) and is applied by `drizzle-kit push`.
 * This runtime bootstrap mirrors that schema exactly and is kept as the belt-
 * and-suspenders idempotent creation used by every other appended table
 * (analytics_events, user_follows, ...), so the table exists even if push has
 * not run yet in a given environment.
 *
 * Recording is best-effort and NEVER throws: an audit write failure must not
 * break the action it describes. Payload summaries are small JSON blobs; we do
 * not store secrets or full sensitive request bodies.
 */

let schemaReady: Promise<void> | null = null;

export function ensureAdminAuditSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await dbRun(`
        CREATE TABLE IF NOT EXISTS admin_audit_log (
          id serial PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          admin_user_id text,
          admin_x_id text,
          admin_handle text,
          action text NOT NULL,
          target_type text,
          target_id text,
          target_label text,
          success boolean NOT NULL DEFAULT true,
          error text,
          before_state jsonb,
          after_state jsonb,
          reason text,
          correlation_id text
        )
      `);
      // Backfill the column on pre-existing installs (idempotent).
      await dbRun(
        `ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS correlation_id text`,
      );
      await dbRun(
        `CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log (created_at)`,
      );
      await dbRun(
        `CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_log (admin_x_id)`,
      );
      await dbRun(
        `CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_log (action)`,
      );
      await dbRun(
        `CREATE INDEX IF NOT EXISTS idx_admin_audit_target_type ON admin_audit_log (target_type)`,
      );
      await dbRun(
        `CREATE INDEX IF NOT EXISTS idx_admin_audit_success ON admin_audit_log (success)`,
      );
    })().catch((err) => {
      // Reset so a later call can retry after a transient DB failure.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

export interface AdminAuditInput {
  admin: Pick<XSessionPayload, "sub" | "x_id" | "x_username"> | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  success?: boolean;
  error?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  /** Ties this row to its API response and server logs. */
  correlationId?: string | null;
}

/**
 * Record an admin action. Best-effort: NEVER throws (a failed audit write must
 * not corrupt the primary admin action). Failures are logged server-side with
 * the action + correlation id so they are never silently swallowed.
 */
export async function recordAdminAction(input: AdminAuditInput): Promise<void> {
  try {
    await ensureAdminAuditSchema();
    await dbRun(
      `INSERT INTO admin_audit_log
        (admin_user_id, admin_x_id, admin_handle, action, target_type,
         target_id, target_label, success, error, before_state, after_state,
         reason, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        input.admin?.sub ?? null,
        input.admin?.x_id ?? null,
        input.admin?.x_username ?? null,
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        input.targetLabel ?? null,
        input.success ?? true,
        input.error ?? null,
        input.before != null ? JSON.stringify(input.before) : null,
        input.after != null ? JSON.stringify(input.after) : null,
        input.reason ?? null,
        input.correlationId ?? null,
      ],
    );
  } catch (err) {
    logger.error(
      { err, action: input.action, correlationId: input.correlationId ?? null },
      "admin audit write failed",
    );
  }
}

/** Convenience: pull the admin session that `requireAdmin` attached. */
export function adminFromReq(
  req: Request,
): Pick<XSessionPayload, "sub" | "x_id" | "x_username"> | null {
  const s = (req as Request & { adminSession?: XSessionPayload }).adminSession;
  if (!s) return null;
  return { sub: s.sub, x_id: s.x_id, x_username: s.x_username };
}

export interface AdminAuditEntry {
  id: number;
  created_at: string;
  admin_user_id: string | null;
  admin_x_id: string | null;
  admin_handle: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  success: boolean;
  error: string | null;
  before_state: unknown;
  after_state: unknown;
  reason: string | null;
  correlation_id: string | null;
}

export interface AdminAuditFilters {
  admin?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  /** Free-text search across target label, error, correlation id and action. */
  q?: string;
  success?: boolean;
  /** Inclusive unix-second range on created_at. */
  from?: number;
  to?: number;
  /** Keyset pagination: only rows with id < cursor. */
  cursor?: number;
  limit?: number;
}

const MAX_LIMIT = 100;

/**
 * List audit entries newest-first with keyset (cursor) pagination so the log
 * scales past small datasets. Returns a `nextCursor` when more rows remain.
 */
export async function listAdminAudit(
  filters: AdminAuditFilters,
): Promise<{ entries: AdminAuditEntry[]; nextCursor: number | null }> {
  await ensureAdminAuditSchema();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, filters.limit ?? 50),
  );
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replace("?", `$${params.length}`));
  };
  if (filters.admin) add("admin_x_id = ?", filters.admin);
  if (filters.action) add("action = ?", filters.action);
  if (filters.targetType) add("target_type = ?", filters.targetType);
  if (filters.targetId) add("target_id = ?", filters.targetId);
  if (typeof filters.success === "boolean") add("success = ?", filters.success);
  if (filters.from && Number.isFinite(filters.from))
    add("created_at >= to_timestamp(?)", filters.from);
  if (filters.to && Number.isFinite(filters.to))
    add("created_at <= to_timestamp(?)", filters.to);
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const p = `$${params.length}`;
    where.push(
      `(target_label ILIKE ${p} OR error ILIKE ${p} OR correlation_id ILIKE ${p} OR action ILIKE ${p} OR target_id ILIKE ${p})`,
    );
  }
  if (filters.cursor && Number.isFinite(filters.cursor))
    add("id < ?", filters.cursor);

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(limit + 1);
  const rows = await dbAll<AdminAuditEntry>(
    `SELECT id, created_at, admin_user_id, admin_x_id, admin_handle, action,
            target_type, target_id, target_label, success, error,
            before_state, after_state, reason, correlation_id
       FROM admin_audit_log
       ${whereSql}
       ORDER BY id DESC
       LIMIT $${params.length}`,
    params,
  );

  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? entries[entries.length - 1]!.id : null;
  return { entries, nextCursor };
}

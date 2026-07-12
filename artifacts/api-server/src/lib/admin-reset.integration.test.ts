import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * DB-backed integration coverage for the admin user resolver + single-user
 * reset. This exercises the real Postgres path against a DEDICATED, seeded test
 * account created and torn down by this suite - it never touches arbitrary
 * production users.
 *
 * It runs automatically when a test DATABASE_URL is present and SKIPS with an
 * explicit reason when absent (the sandbox has no DB). See the PR "staging
 * verification checklist" for how to run it against staging.
 */

const HAS_DB = !!process.env.DATABASE_URL;
const SKIP_REASON =
  "DATABASE_URL not set - admin reset integration requires a test database.";

if (!HAS_DB) {
  // Surface the skip reason explicitly in test output.
  // eslint-disable-next-line no-console
  console.warn(`[admin-reset.integration] SKIPPED: ${SKIP_REASON}`);
}

type DB = typeof import("./database.js");
type Resolver = typeof import("./adminUsers.js");
type Actions = typeof import("./adminActions.js");
type Audit = typeof import("./adminAudit.js");
type Trading = typeof import("./trading.js");

describe.skipIf(!HAS_DB)("admin reset integration (DB-backed)", () => {
  let db: DB;
  let resolver: Resolver;
  let actions: Actions;
  let audit: Audit;
  let trading: Trading;

  const rand = Math.random().toString(36).slice(2, 8);
  const xId = `99${String(Date.now()).slice(-9)}`;
  const handle = `bp_it_${rand}`;
  const xKey = `x:${xId}`;
  const b58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijk";
  const linkedWallet = `L${rand}${b58}`.slice(0, 44).padEnd(44, "Z");
  const guestWallet = `G${rand}${b58}`.slice(0, 44).padEnd(44, "Y");
  const mint = `Mint${rand}TokenAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
  let userId = 0;

  const countIn = async (table: string, wallet: string): Promise<number> => {
    const r = await db.dbGet<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${table} WHERE wallet = $1`,
      [wallet],
    );
    return r?.n ?? 0;
  };

  async function seedXAccount() {
    await db.dbRun(
      `INSERT INTO accounts (wallet, paper_balance, season)
       VALUES ($1, 42, 3)
       ON CONFLICT (wallet) DO UPDATE SET paper_balance = 42, season = 3`,
      [xKey],
    );
    await db.dbRun(
      `INSERT INTO trades (wallet, token_mint, side, sol_amount, token_amount, price, pnl)
       VALUES ($1,$2,'buy',1,100,0.01,NULL), ($1,$2,'sell',2,100,0.02,1)`,
      [xKey, mint],
    );
    await db.dbRun(
      `INSERT INTO positions (wallet, token_mint, total_tokens, total_sol_spent, avg_entry_price)
       VALUES ($1,$2,50,1,0.01)
       ON CONFLICT (wallet, token_mint) DO NOTHING`,
      [xKey, mint],
    );
    await db.dbRun(
      `INSERT INTO paper_orders (wallet, token_mint, order_type, trigger_type, trigger_value, trigger_direction, amount_value, status)
       VALUES ($1,$2,'take_profit','price',1,'gte',100,'pending')`,
      [xKey, mint],
    );
    await db.dbRun(
      `INSERT INTO watchlist (wallet, token_mint) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [xKey, mint],
    );
  }

  beforeAll(async () => {
    db = await import("./database.js");
    resolver = await import("./adminUsers.js");
    actions = await import("./adminActions.js");
    audit = await import("./adminAudit.js");
    trading = await import("./trading.js");

    const u = await db.dbGet<{ id: number }>(
      `INSERT INTO users (display_name) VALUES ($1) RETURNING id`,
      [`IT ${rand}`],
    );
    userId = u!.id;
    await db.dbRun(
      `INSERT INTO user_identities (user_id, provider, provider_user_id, x_username)
       VALUES ($1,'x',$2,$3)`,
      [userId, xId, handle],
    );
    await db.dbRun(
      `INSERT INTO user_identities (user_id, provider, provider_user_id, wallet_address)
       VALUES ($1,'wallet',$2,$2)`,
      [userId, linkedWallet],
    );
    await seedXAccount();

    // Independent guest (unlinked) wallet account.
    await db.dbRun(
      `INSERT INTO accounts (wallet, paper_balance, season) VALUES ($1, 10, 1)
       ON CONFLICT (wallet) DO UPDATE SET paper_balance = 10`,
      [guestWallet],
    );
    await db.dbRun(
      `INSERT INTO trades (wallet, token_mint, side, sol_amount, token_amount, price, pnl)
       VALUES ($1,$2,'buy',1,100,0.01,NULL)`,
      [guestWallet, mint],
    );

    await audit.ensureAdminAuditSchema();
  });

  afterAll(async () => {
    if (!db) return;
    for (const w of [xKey, guestWallet]) {
      for (const t of [
        "trades",
        "positions",
        "paper_orders",
        "watchlist",
        "portfolio_snapshots",
        "accounts",
      ]) {
        await db.dbRun(`DELETE FROM ${t} WHERE wallet = $1`, [w]).catch(() => {});
      }
    }
    await db.dbRun(`DELETE FROM user_identities WHERE user_id = $1`, [userId]).catch(() => {});
    await db.dbRun(`DELETE FROM users WHERE id = $1`, [userId]).catch(() => {});
    await db.dbRun(
      `DELETE FROM admin_audit_log WHERE target_id = ANY($1::text[])`,
      [[xKey, guestWallet, "int-test"]],
    ).catch(() => {});
    // Drop backup tables created for these test tags.
    for (const w of [xKey, guestWallet]) {
      const tag = w.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
      const rows = await db
        .dbAll<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'reset_backups' AND table_name LIKE $1`,
          [`%${tag}%`],
        )
        .catch(() => [] as { table_name: string }[]);
      for (const r of rows) {
        await db
          .dbRun(`DROP TABLE IF EXISTS "reset_backups"."${r.table_name}"`)
          .catch(() => {});
      }
    }
  });

  // ── Resolver: every supported identifier shape ──────────────────────────────
  it("resolves by @handle", async () => {
    const r = await resolver.resolveAdminAccount(`@${handle}`);
    expect(r.found).toBe(true);
    expect(r.accountKey).toBe(xKey);
    expect(r.matchedBy).toBe("handle");
  });

  it("resolves by bare handle (case-insensitive)", async () => {
    const r = await resolver.resolveAdminAccount(handle.toUpperCase());
    expect(r.accountKey).toBe(xKey);
  });

  it("resolves by numeric X id", async () => {
    const r = await resolver.resolveAdminAccount(xId);
    expect(r.accountKey).toBe(xKey);
    expect(r.matchedBy).toBe("x-id");
  });

  it("resolves by x:<id> key", async () => {
    const r = await resolver.resolveAdminAccount(xKey);
    expect(r.accountKey).toBe(xKey);
    expect(r.matchedBy).toBe("x-key");
  });

  it("resolves by internal user id", async () => {
    const r = await resolver.resolveAdminAccount(String(userId));
    expect(r.accountKey).toBe(xKey);
    expect(r.matchedBy).toBe("internal-id");
  });

  it("resolves a guest paper wallet to itself", async () => {
    const r = await resolver.resolveAdminAccount(guestWallet);
    expect(r.found).toBe(true);
    expect(r.accountKey).toBe(guestWallet);
    expect(r.isGuest).toBe(true);
  });

  it("resolves a wallet linked to an X account to its x: key", async () => {
    const r = await resolver.resolveAdminAccount(linkedWallet);
    expect(r.accountKey).toBe(xKey);
    expect(r.matchedBy).toBe("wallet-linked");
  });

  it("returns not-found for an unknown identifier", async () => {
    const r = await resolver.resolveAdminAccount("no_such_handle_zzz");
    expect(r.found).toBe(false);
    expect(r.accountKey).toBeNull();
  });

  it("numeric X id takes precedence over internal id (deterministic)", async () => {
    // xId is numeric; it must resolve as the X id, never as an internal users.id.
    const r = await resolver.resolveAdminAccount(xId);
    expect(r.matchedBy).toBe("x-id");
  });

  // ── Reset: options isolation + preservation + fail-loud ─────────────────────
  it("selected option affects only its table; unselected data preserved", async () => {
    await seedXAccount();
    const ordersBefore = await countIn("paper_orders", xKey);
    const tradesBefore = await countIn("trades", xKey);
    expect(ordersBefore).toBeGreaterThan(0);

    const res = await actions.adminReset("user", xKey, {
      clearOrders: true,
      resetBalance: false,
    });

    expect(await countIn("paper_orders", xKey)).toBe(0); // cleared
    expect(await countIn("trades", xKey)).toBe(tradesBefore); // preserved
    expect(res.deleted["paper_orders"]).toBe(ordersBefore);
    expect(res.backups["paper_orders"]?.rows).toBe(ordersBefore); // backup first
  });

  it("preserves identity, X link, and wallet link across a reset", async () => {
    await actions.adminReset("user", xKey, {
      clearTrades: true,
      clearPositions: true,
      clearOrders: true,
      resetBalance: true,
    });
    const idn = await db.dbGet<{ n: number }>(
      `SELECT count(*)::int AS n FROM user_identities WHERE user_id = $1`,
      [userId],
    );
    expect(idn?.n).toBe(2); // x + wallet identity both intact
    const usr = await db.dbGet<{ n: number }>(
      `SELECT count(*)::int AS n FROM users WHERE id = $1`,
      [userId],
    );
    expect(usr?.n).toBe(1);
  });

  it("resetBalance resets balance to STARTING_BALANCE and bumps season", async () => {
    await db.dbRun(
      `INSERT INTO accounts (wallet, paper_balance, season) VALUES ($1, 5, 7)
       ON CONFLICT (wallet) DO UPDATE SET paper_balance = 5, season = 7`,
      [xKey],
    );
    const res = await actions.adminReset("user", xKey, { resetBalance: true });
    expect(res.accountsReset).toBe(1);
    const acct = await db.dbGet<{ paper_balance: number; season: number }>(
      `SELECT paper_balance, season FROM accounts WHERE wallet = $1`,
      [xKey],
    );
    expect(acct?.paper_balance).toBe(trading.STARTING_BALANCE);
    expect(acct?.season).toBe(8);
  });

  it("never reports a false success when zero rows match", async () => {
    const res = await actions.adminReset("user", "x:definitely_missing_000", {
      clearOrders: true,
      clearTrades: true,
      resetBalance: false,
    });
    const totalDeleted = Object.values(res.deleted).reduce((a, b) => a + b, 0);
    // This is exactly the signal the route uses to set nothingChanged.
    expect(res.accountsReset === 0 && totalDeleted === 0).toBe(true);
  });

  // ── Audit log: success + failure rows ───────────────────────────────────────
  it("writes an audit entry for success and for failure", async () => {
    await audit.recordAdminAction({
      admin: { sub: "1", x_id: "1", x_username: "it_admin" },
      action: "reset-user",
      targetType: "user",
      targetId: "int-test",
      targetLabel: handle,
      success: true,
      correlationId: `it-${rand}-ok`,
    });
    await audit.recordAdminAction({
      admin: { sub: "1", x_id: "1", x_username: "it_admin" },
      action: "reset-user",
      targetType: "user",
      targetId: "int-test",
      targetLabel: handle,
      success: false,
      error: "user not found",
      correlationId: `it-${rand}-fail`,
    });
    const rows = await db.dbAll<{ success: boolean }>(
      `SELECT success FROM admin_audit_log WHERE target_id = 'int-test'`,
    );
    expect(rows.some((r) => r.success === true)).toBe(true);
    expect(rows.some((r) => r.success === false)).toBe(true);
  });
});

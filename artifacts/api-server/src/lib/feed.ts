import { dbAll } from "./database.js";

/**
 * Read-only activity feed (Phase 1).
 *
 * Surfaces recent public trading activity from X-authenticated users only,
 * unioning spot trades and leverage trade events. It re-uses the same
 * wallet → X identity resolution as the leaderboard (a wallet is either a linked
 * `wallet` identity or the synthetic `x:<id>` account key). This is purely a
 * read of existing tables — it does not change any trading accounting.
 *
 * - Global feed: all X users' recent activity.
 * - Following feed: activity filtered to the user ids the viewer follows.
 */

export interface FeedActivityItem {
  id: string;
  kind: "spot" | "leverage" | "callout";
  /** spot: 'buy'|'sell'; leverage: 'open'|'close'|'liquidated'; callout: 'call'. */
  action: string;
  token: {
    mint: string;
    symbol: string | null;
    name: string | null;
    logo: string | null;
  };
  /** Leverage multiplier, null for spot. */
  leverage: number | null;
  /** Leverage direction ('long' | 'short'), null for spot. */
  direction: string | null;
  /** Realized P&L in SOL when applicable (spot sells, leverage closes). */
  pnlSol: number | null;
  /** Callout thesis, null for trades. */
  thesis: string | null;
  /** Callout conviction tier, null for trades. */
  conviction: string | null;
  /** Snapshotted market cap (USD) at the moment of the call, null for trades. */
  callMarketCapUsd: number | null;
  timestamp: number;
  user: {
    user_id: number;
    x_username: string;
    x_display_name: string | null;
    x_avatar_url: string | null;
  };
}

interface ActivityRow {
  id: string;
  kind: "spot" | "leverage" | "callout";
  action: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  token_logo: string | null;
  leverage: number | null;
  direction: string | null;
  pnl_sol: number | null;
  thesis: string | null;
  conviction: string | null;
  call_market_cap: number | null;
  ts: number;
  user_id: number;
  x_username: string;
  x_display_name: string | null;
  x_avatar_url: string | null;
}

export async function getActivity(opts: {
  /** When provided, restrict to these internal user ids (the followed set). */
  followingUserIds?: number[] | null;
  limit?: number;
}): Promise<FeedActivityItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
  const follow = opts.followingUserIds;
  // An explicit empty follow set means "following nobody" → no activity.
  if (follow && follow.length === 0) return [];

  const params: unknown[] = [];
  let followClause = "";
  let followClauseCallout = "";
  if (follow && follow.length > 0) {
    params.push(follow);
    followClause = `AND i.user_id = ANY($${params.length}::int[])`;
    followClauseCallout = `AND c.user_id = ANY($${params.length}::int[])`;
  }
  params.push(limit);
  const limitIdx = params.length;

  const rows = await dbAll<ActivityRow>(
    `WITH ident AS (
       SELECT wi.wallet_address AS wallet,
              u.id AS user_id,
              MAX(xi.x_username) AS x_username,
              MAX(u.display_name) AS x_display_name,
              MAX(u.avatar_url) AS x_avatar_url
         FROM user_identities wi
         JOIN users u ON u.id = wi.user_id
         LEFT JOIN user_identities xi
           ON xi.user_id = wi.user_id AND xi.provider = 'x'
        WHERE wi.provider = 'wallet'
        GROUP BY wi.wallet_address, u.id
       UNION ALL
       SELECT ('x:' || xi.provider_user_id) AS wallet,
              u.id AS user_id,
              xi.x_username AS x_username,
              u.display_name AS x_display_name,
              u.avatar_url AS x_avatar_url
         FROM user_identities xi
         JOIN users u ON u.id = xi.user_id
        WHERE xi.provider = 'x'
     ),
     activity AS (
       SELECT ('spot-' || t.id) AS id,
              'spot' AS kind,
              t.side AS action,
              t.token_mint, t.token_symbol, t.token_name, t.token_logo,
              NULL::int AS leverage,
              NULL::text AS direction,
              t.pnl AS pnl_sol,
              NULL::text AS thesis,
              NULL::text AS conviction,
              NULL::double precision AS call_market_cap,
              t.executed_at AS ts,
              i.user_id, i.x_username, i.x_display_name, i.x_avatar_url
         FROM trades t
         JOIN ident i ON i.wallet = t.wallet
        WHERE i.x_username IS NOT NULL ${followClause}
       UNION ALL
       SELECT ('lev-' || lt.id) AS id,
              'leverage' AS kind,
              lt.action AS action,
              lt.token_mint, lt.token_symbol, lt.token_name, lt.token_logo,
              lt.leverage AS leverage,
              lt.direction AS direction,
              lt.pnl_sol AS pnl_sol,
              NULL::text AS thesis,
              NULL::text AS conviction,
              NULL::double precision AS call_market_cap,
              lt.executed_at AS ts,
              i.user_id, i.x_username, i.x_display_name, i.x_avatar_url
         FROM paper_leverage_trades lt
         JOIN ident i ON i.wallet = lt.wallet
        WHERE i.x_username IS NOT NULL ${followClause}
       UNION ALL
       SELECT ('call-' || c.id) AS id,
              'callout' AS kind,
              'call' AS action,
              c.token_mint, c.token_symbol, c.token_name, c.token_logo,
              NULL::int AS leverage,
              NULL::text AS direction,
              NULL::double precision AS pnl_sol,
              c.thesis AS thesis,
              c.conviction AS conviction,
              c.call_market_cap AS call_market_cap,
              c.created_at AS ts,
              c.user_id AS user_id,
              xi.x_username AS x_username,
              u.display_name AS x_display_name,
              u.avatar_url AS x_avatar_url
         FROM callouts c
         JOIN user_identities xi
           ON xi.user_id = c.user_id AND xi.provider = 'x'
         JOIN users u ON u.id = c.user_id
        WHERE 1 = 1 ${followClauseCallout}
     )
     SELECT * FROM activity
      ORDER BY ts DESC
      LIMIT $${limitIdx}`,
    params,
  );

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    action: r.action,
    token: {
      mint: r.token_mint,
      symbol: r.token_symbol,
      name: r.token_name,
      logo: r.token_logo,
    },
    leverage: r.leverage,
    direction: r.direction,
    pnlSol: r.pnl_sol,
    thesis: r.thesis,
    conviction: r.conviction,
    callMarketCapUsd: r.call_market_cap,
    timestamp: r.ts,
    user: {
      user_id: r.user_id,
      x_username: r.x_username,
      x_display_name: r.x_display_name,
      x_avatar_url: r.x_avatar_url,
    },
  }));
}

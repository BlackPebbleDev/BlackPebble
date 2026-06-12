import { dbAll } from "./database.js";
import { ensureProfileSchema } from "./profiles.js";
import { ensureThesesSchema } from "./theses.js";
import { getTokenStatsBatch } from "./prices.js";
import { getTokenPeaks, recordTokenPeaks, athMultipleFrom } from "./peaks.js";

/**
 * Read-only activity feed (Phase 1).
 *
 * Surfaces recent public activity from X-authenticated users only, unioning spot
 * trades, leverage trade events, callouts (on-the-record calls) and standalone
 * theses (token research). It re-uses the same wallet → X identity resolution as
 * the leaderboard (a wallet is either a linked `wallet` identity or the synthetic
 * `x:<id>` account key). This is purely a read of existing tables — it does not
 * change any trading accounting.
 *
 * Admin-hidden and test-tagged callouts/theses are excluded from the feed.
 *
 * - Global feed: all X users' recent activity.
 * - Following feed: activity filtered to the user ids the viewer follows.
 */

export interface FeedActivityItem {
  id: string;
  kind: "spot" | "leverage" | "callout" | "thesis";
  /**
   * spot: 'buy'|'sell'; leverage: 'open'|'close'|'liquidated'; callout: 'call';
   * thesis: 'thesis'.
   */
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
  /** Callout thesis text / thesis body, null for trades. */
  thesis: string | null;
  /** Callout/thesis conviction tier, null for trades. */
  conviction: string | null;
  /** Snapshotted market cap (USD) at the moment of the call, null otherwise. */
  callMarketCapUsd: number | null;
  /**
   * Live callout performance (callouts only; null for trades/theses). Computed
   * dynamically from the call's snapshotted price — the call row is never
   * mutated. currentMultiple = livePrice / callPrice; athMultiple uses the
   * peak-since-tracking high-water mark (always >= currentMultiple).
   */
  currentMarketCapUsd: number | null;
  currentMultiple: number | null;
  athMultiple: number | null;
  /** Standalone thesis title, null for everything else. */
  thesisTitle: string | null;
  /** Standalone thesis sentiment ('bullish'|'bearish'|'neutral'), else null. */
  sentiment: string | null;
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
  kind: "spot" | "leverage" | "callout" | "thesis";
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
  call_price_usd: number | null;
  thesis_title: string | null;
  sentiment: string | null;
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

  // Ensure the callout/thesis admin columns exist before the feed reads them,
  // so a fresh database doesn't 500 on the very first feed request.
  await Promise.all([ensureProfileSchema(), ensureThesesSchema()]);

  const params: unknown[] = [];
  let followClause = "";
  let followClauseUser = "";
  if (follow && follow.length > 0) {
    params.push(follow);
    followClause = `AND i.user_id = ANY($${params.length}::int[])`;
    followClauseUser = `AND user_id = ANY($${params.length}::int[])`;
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
              NULL::double precision AS call_price_usd,
              NULL::text AS thesis_title,
              NULL::text AS sentiment,
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
              NULL::double precision AS call_price_usd,
              NULL::text AS thesis_title,
              NULL::text AS sentiment,
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
              c.call_price_usd AS call_price_usd,
              NULL::text AS thesis_title,
              NULL::text AS sentiment,
              c.created_at AS ts,
              c.user_id AS user_id,
              xi.x_username AS x_username,
              u.display_name AS x_display_name,
              u.avatar_url AS x_avatar_url
         FROM callouts c
         JOIN user_identities xi
           ON xi.user_id = c.user_id AND xi.provider = 'x'
         JOIN users u ON u.id = c.user_id
        WHERE c.is_hidden_by_admin = FALSE AND c.is_test = FALSE
              ${followClauseUser.replace(/user_id/g, "c.user_id")}
       UNION ALL
       SELECT ('thesis-' || th.id) AS id,
              'thesis' AS kind,
              'thesis' AS action,
              th.token_mint, th.token_symbol, th.token_name, th.token_logo,
              NULL::int AS leverage,
              NULL::text AS direction,
              NULL::double precision AS pnl_sol,
              th.content AS thesis,
              th.conviction AS conviction,
              NULL::double precision AS call_market_cap,
              NULL::double precision AS call_price_usd,
              th.title AS thesis_title,
              th.sentiment AS sentiment,
              th.created_at AS ts,
              th.user_id AS user_id,
              xi.x_username AS x_username,
              u.display_name AS x_display_name,
              u.avatar_url AS x_avatar_url
         FROM token_theses th
         JOIN user_identities xi
           ON xi.user_id = th.user_id AND xi.provider = 'x'
         JOIN users u ON u.id = th.user_id
        WHERE th.is_hidden_by_admin = FALSE AND th.is_test = FALSE
              ${followClauseUser.replace(/user_id/g, "th.user_id")}
     )
     SELECT * FROM activity
      ORDER BY ts DESC
      LIMIT $${limitIdx}`,
    params,
  );

  const items: FeedActivityItem[] = rows.map((r) => ({
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
    currentMarketCapUsd: null,
    currentMultiple: null,
    athMultiple: null,
    thesisTitle: r.thesis_title,
    sentiment: r.sentiment,
    timestamp: r.ts,
    user: {
      user_id: r.user_id,
      x_username: r.x_username,
      x_display_name: r.x_display_name,
      x_avatar_url: r.x_avatar_url,
    },
  }));

  await enrichCalloutPerformance(items, rows);
  return items;
}

/**
 * Enrich callout feed items with live performance (Current MC, Current X, ATH X).
 * Computed dynamically and batched: one DexScreener stats batch + one peaks read
 * for all unique callout mints in the page, so a 40-item feed costs ~1–2 upstream
 * calls regardless of how many calls it contains. Best-effort — any failure
 * leaves the call showing its preserved Called MC with no live numbers, never an
 * error. Trades and theses are intentionally left untouched (theses are never
 * graded as calls).
 */
async function enrichCalloutPerformance(
  items: FeedActivityItem[],
  rows: ActivityRow[],
): Promise<void> {
  const callPriceById = new Map<string, number | null>();
  for (const r of rows) {
    if (r.kind === "callout") callPriceById.set(r.id, r.call_price_usd);
  }
  const callouts = items.filter((i) => i.kind === "callout");
  if (callouts.length === 0) return;

  const mints = [...new Set(callouts.map((c) => c.token.mint).filter(Boolean))];
  if (mints.length === 0) return;

  try {
    const [stats, peaks] = await Promise.all([
      getTokenStatsBatch(mints),
      getTokenPeaks(mints),
    ]);

    // Fold the just-observed live values into the high-water mark so ATH never
    // lags behind a price we are showing right now.
    await recordTokenPeaks(
      [...stats.entries()].map(([mint, s]) => ({
        mint,
        priceUsd: s.priceUsd,
        marketCapUsd: s.marketCapUsd,
      })),
    );

    for (const item of callouts) {
      const s = stats.get(item.token.mint);
      const callPrice = callPriceById.get(item.id) ?? null;
      const currentPrice = s?.priceUsd ?? null;
      item.currentMarketCapUsd = s?.marketCapUsd ?? null;
      const currentMultiple =
        callPrice != null &&
        callPrice > 0 &&
        currentPrice != null &&
        currentPrice > 0
          ? currentPrice / callPrice
          : null;
      item.currentMultiple = currentMultiple;
      item.athMultiple = athMultipleFrom(
        peaks.get(item.token.mint),
        callPrice,
        currentMultiple,
      );
    }
  } catch {
    // Graceful degradation: keep Called MC, drop live numbers.
  }
}

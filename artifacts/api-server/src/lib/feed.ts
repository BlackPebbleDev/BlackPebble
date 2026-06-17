import { dbAll } from "./database.js";
import { ensureProfileSchema } from "./profiles.js";
import { ensureThesesSchema } from "./theses.js";
import { getTokenStatsBatch } from "./prices.js";
import { getTokenPeaks, recordTokenPeaks, athMultipleFrom } from "./peaks.js";
import { BADGE_DEFINITIONS, ensureBadgesSchema, getOfficialBadgesForUsers } from "./badges.js";
import { getUserTiers } from "./trading.js";

/**
 * Read-only activity feed (Phase 1).
 *
 * Surfaces recent public activity from X-authenticated users only, unioning spot
 * trades, leverage trade events, callouts (on-the-record calls), standalone
 * theses (token research) and achievement unlocks. It re-uses the same wallet →
 * X identity resolution as the leaderboard. This is purely a read of existing
 * tables — it does not change any trading accounting.
 *
 * Admin-hidden and test-tagged callouts/theses are excluded from the feed.
 * Achievement rows are sourced from user_achievements (upserted by getUserBadges).
 *
 * - Global feed: all X users' recent activity.
 * - Following feed: activity filtered to the user ids the viewer follows.
 */

export interface FeedActivityItem {
  id: string;
  kind: "spot" | "leverage" | "callout" | "thesis" | "achievement" | "recovery";
  /**
   * spot: 'buy'|'sell'; leverage: 'open'|'close'|'liquidated'; callout: 'call';
   * thesis: 'thesis'; achievement: 'earned'; recovery: 'cleanup'.
   */
  action: string;
  token: {
    mint: string;
    symbol: string | null;
    name: string | null;
    logo: string | null;
  };
  /** Leverage multiplier, null for spot/callout/thesis/achievement. */
  leverage: number | null;
  /** Leverage direction ('long' | 'short'), null for others. */
  direction: string | null;
  /** Realized P&L in SOL when applicable (spot sells, leverage closes). */
  pnlSol: number | null;
  /** Callout thesis text / thesis body / badge description for achievements. */
  thesis: string | null;
  /** Callout/thesis conviction tier, null for trades/achievements. */
  conviction: string | null;
  /** Snapshotted market cap (USD) at the moment of the call, null otherwise. */
  callMarketCapUsd: number | null;
  /**
   * Live callout performance (callouts only; null for trades/theses/achievements).
   */
  currentMarketCapUsd: number | null;
  currentMultiple: number | null;
  athMultiple: number | null;
  /** Standalone thesis title, null for everything else. */
  thesisTitle: string | null;
  /** Standalone thesis sentiment ('bullish'|'bearish'|'neutral'), else null. */
  sentiment: string | null;
  /** Achievement badge identifier, null for non-achievement items. */
  badgeKey: string | null;
  /** Human-readable badge name looked up from the catalogue. */
  badgeName: string | null;
  /** Recovery only: SOL recovered in this cleanup, null otherwise. */
  recoveredSol: number | null;
  /** Recovery only: rent accounts closed in this cleanup, null otherwise. */
  accountsClosed: number | null;
  timestamp: number;
  user: {
    user_id: number;
    x_username: string;
    x_display_name: string | null;
    x_avatar_url: string | null;
    graduation_tier?: string;
    official_badges?: string[];
  };
}

interface ActivityRow {
  id: string;
  kind: "spot" | "leverage" | "callout" | "thesis" | "achievement" | "recovery";
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
  badge_key: string | null;
}

const badgeDefMap = new Map(BADGE_DEFINITIONS.map((d) => [d.key, d]));

export async function getActivity(opts: {
  /** When provided, restrict to these internal user ids (the followed set). */
  followingUserIds?: number[] | null;
  limit?: number;
}): Promise<FeedActivityItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
  const follow = opts.followingUserIds;
  // An explicit empty follow set means "following nobody" → no activity.
  if (follow && follow.length === 0) return [];

  // Ensure all referenced schemas exist before querying them.
  await Promise.all([
    ensureProfileSchema(),
    ensureThesesSchema(),
    ensureBadgesSchema(),
  ]);

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
              i.user_id, i.x_username, i.x_display_name, i.x_avatar_url,
              NULL::text AS badge_key
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
              i.user_id, i.x_username, i.x_display_name, i.x_avatar_url,
              NULL::text AS badge_key
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
              u.avatar_url AS x_avatar_url,
              NULL::text AS badge_key
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
              u.avatar_url AS x_avatar_url,
              NULL::text AS badge_key
         FROM token_theses th
         JOIN user_identities xi
           ON xi.user_id = th.user_id AND xi.provider = 'x'
         JOIN users u ON u.id = th.user_id
        WHERE th.is_hidden_by_admin = FALSE AND th.is_test = FALSE
              ${followClauseUser.replace(/user_id/g, "th.user_id")}
       UNION ALL
       SELECT ('ach-' || ua.id) AS id,
              'achievement' AS kind,
              'earned' AS action,
              '' AS token_mint,
              NULL::text AS token_symbol,
              NULL::text AS token_name,
              NULL::text AS token_logo,
              NULL::int AS leverage,
              NULL::text AS direction,
              NULL::double precision AS pnl_sol,
              NULL::text AS thesis,
              NULL::text AS conviction,
              NULL::double precision AS call_market_cap,
              NULL::double precision AS call_price_usd,
              NULL::text AS thesis_title,
              NULL::text AS sentiment,
              ua.earned_at AS ts,
              ua.user_id AS user_id,
              xi.x_username AS x_username,
              u.display_name AS x_display_name,
              u.avatar_url AS x_avatar_url,
              ua.badge_key AS badge_key
         FROM user_achievements ua
         JOIN user_identities xi
           ON xi.user_id = ua.user_id AND xi.provider = 'x'
         JOIN users u ON u.id = ua.user_id
        WHERE TRUE ${followClauseUser.replace(/user_id/g, "ua.user_id")}
       UNION ALL
       -- Recovery cleanups by X-authenticated users. Real recovery_events only:
       -- successful cleanups that actually closed accounts. We re-use the int
       -- leverage column to carry accounts_closed and the double pnl_sol column
       -- to carry recovered_sol (the same field-overloading convention this
       -- UNION already uses, e.g. thesis carrying badge text). These are split
       -- back into dedicated fields in the row mapper below.
       SELECT ('rec-' || re.id) AS id,
              'recovery' AS kind,
              'cleanup' AS action,
              '' AS token_mint,
              NULL::text AS token_symbol,
              NULL::text AS token_name,
              NULL::text AS token_logo,
              re.accounts_closed AS leverage,
              NULL::text AS direction,
              re.recovered_sol AS pnl_sol,
              NULL::text AS thesis,
              NULL::text AS conviction,
              NULL::double precision AS call_market_cap,
              NULL::double precision AS call_price_usd,
              NULL::text AS thesis_title,
              NULL::text AS sentiment,
              re.created_at AS ts,
              xi.user_id AS user_id,
              xi.x_username AS x_username,
              u.display_name AS x_display_name,
              u.avatar_url AS x_avatar_url,
              NULL::text AS badge_key
         FROM recovery_events re
         JOIN user_identities xi
           ON xi.provider = 'x' AND xi.provider_user_id = re.x_user_id
         JOIN users u ON u.id = xi.user_id
        WHERE re.event_type = 'cleanup'
              AND re.status = 'success'
              AND re.x_user_id IS NOT NULL
              AND re.accounts_closed > 0
              ${followClauseUser.replace(/user_id/g, "xi.user_id")}
     )
     SELECT * FROM activity
      ORDER BY ts DESC
      LIMIT $${limitIdx}`,
    params,
  );

  const items: FeedActivityItem[] = rows.map((r) => {
    const badgeDef = r.badge_key ? (badgeDefMap.get(r.badge_key) ?? null) : null;
    const isRecovery = r.kind === "recovery";
    return {
      id: r.id,
      kind: r.kind,
      action: r.action,
      token: {
        mint: r.token_mint,
        symbol: r.token_symbol,
        name: r.token_name,
        logo: r.token_logo,
      },
      // For recovery rows leverage/pnl_sol carry accounts_closed/recovered_sol,
      // surfaced via the dedicated fields below — keep the trade fields null.
      leverage: isRecovery ? null : r.leverage,
      direction: r.direction,
      pnlSol: isRecovery ? null : r.pnl_sol,
      // For achievements, repurpose thesis to carry the badge description.
      thesis: r.kind === "achievement" ? (badgeDef?.description ?? null) : r.thesis,
      conviction: r.conviction,
      callMarketCapUsd: r.call_market_cap,
      currentMarketCapUsd: null,
      currentMultiple: null,
      athMultiple: null,
      thesisTitle: r.thesis_title,
      sentiment: r.sentiment,
      badgeKey: r.badge_key,
      badgeName: badgeDef?.name ?? null,
      recoveredSol: isRecovery ? r.pnl_sol : null,
      accountsClosed: isRecovery ? r.leverage : null,
      timestamp: r.ts,
      user: {
        user_id: r.user_id,
        x_username: r.x_username,
        x_display_name: r.x_display_name,
        x_avatar_url: r.x_avatar_url,
      },
    };
  });

  // Attach graduation_tier + official_badges per poster (decorative — never throws).
  const uniqueUserIds = [...new Set(rows.map((r) => r.user_id))];
  const [tierMap, badgeMap] = await Promise.all([
    getUserTiers(uniqueUserIds),
    getOfficialBadgesForUsers(uniqueUserIds),
  ]);
  for (const item of items) {
    const t = tierMap.get(item.user.user_id);
    if (t) item.user.graduation_tier = t;
    const b = badgeMap.get(item.user.user_id);
    if (b && b.length > 0) item.user.official_badges = b;
  }

  await enrichCalloutPerformance(items, rows);
  return items;
}

/**
 * Enrich callout feed items with live performance (Current MC, Current X, ATH X).
 * Computed dynamically and batched: one DexScreener stats batch + one peaks read
 * for all unique callout mints in the page. Best-effort — any failure leaves the
 * call showing its preserved Called MC with no live numbers. Trades, theses and
 * achievements are intentionally left untouched.
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

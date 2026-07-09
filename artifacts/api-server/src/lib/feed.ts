import { dbAll } from "./database.js";
import { ensureProfileSchema } from "./profiles.js";
import { ensureThesesSchema } from "./theses.js";
import { getTokenStatsBatch } from "./prices.js";
import { getTokenPeaks, recordTokenPeaks, athMultipleFrom } from "./peaks.js";
import { BADGE_DEFINITIONS, NON_FEED_BADGE_KEYS, ensureBadgesSchema, getOfficialBadgesForUsers } from "./badges.js";
import { ensureRecoverySchema } from "./recovery-verify.js";
import { ensureCampaignSchema } from "./campaign-schema.js";
import { ensureFeedSchema } from "./feed-schema.js";
import { getReactionsForEvents } from "./feed-service.js";
import {
  aggregateSpotTrades,
  type RawSpotTrade,
  type AggregatedTradeGroup,
} from "./feed-aggregate.js";
import { getUserTiers } from "./trading.js";
import { computeReputationBoard } from "./reputation.js";

/**
 * Activity Intelligence Engine — the feed read model.
 *
 * Two event sources, one feed (see docs/FEED_INTELLIGENCE.md):
 *
 *  1. Derived events: a SQL UNION over source-of-truth tables (trades,
 *     leverage trades, callouts, theses, achievements, recovery, campaigns).
 *     Retroactive and drift-free — the read always sees current row state.
 *  2. Published events (`feed_events`): milestones with no source table
 *     (tier promotions, follower milestones, future DNA changes), written
 *     through feedService.publishEvent().
 *
 * Spot trades are aggregated at read time: bursts of buys/sells in the same
 * token within a 30-minute gap window collapse into one "accumulated" /
 * "exited" card with an expandable per-trade breakdown. Raw rows stay raw in
 * the database.
 *
 * Every item carries a structured `meta` payload (replacing the old
 * field-overloading conventions) and a reaction summary.
 */

export interface FeedActivityItem {
  id: string;
  kind:
    | "spot"
    | "agg"
    | "leverage"
    | "callout"
    | "thesis"
    | "achievement"
    | "recovery"
    | "campaign"
    | "milestone";
  /**
   * spot: 'buy'|'sell'; agg: 'accumulated'|'exited'|'took_profits';
   * leverage: 'open'|'close'|'liquidated'; callout: 'call'; thesis: 'thesis';
   * achievement: 'earned'; recovery: 'cleanup';
   * campaign: 'launched'|'funded'|'completed';
   * milestone: the published event kind ('tier_up', 'follower_milestone', …).
   */
  action: string;
  token: {
    mint: string;
    symbol: string | null;
    name: string | null;
    logo: string | null;
  };
  /** Leverage multiplier, null for non-leverage items. */
  leverage: number | null;
  /** Leverage direction ('long' | 'short'), null for others. */
  direction: string | null;
  /** Realized P&L in SOL when applicable (sells, exits, leverage closes). */
  pnlSol: number | null;
  /** Callout thesis text / thesis body / badge or milestone summary. */
  thesis: string | null;
  /** Callout/thesis conviction tier. */
  conviction: string | null;
  /** Snapshotted market cap (USD) at the moment of a call. */
  callMarketCapUsd: number | null;
  /** Live callout performance (callouts only). */
  currentMarketCapUsd: number | null;
  currentMultiple: number | null;
  athMultiple: number | null;
  /** Thesis / campaign / milestone headline. */
  thesisTitle: string | null;
  /** Thesis sentiment ('bullish'|'bearish'|'neutral'). */
  sentiment: string | null;
  /** Achievement badge identifier / name / rarity. */
  badgeKey: string | null;
  badgeName: string | null;
  badgeRarity: string | null;
  /** Recovery only: SOL recovered / accounts closed. */
  recoveredSol: number | null;
  accountsClosed: number | null;
  /** Campaign only: public id + goal. */
  campaignPublicId: string | null;
  campaignGoalSol: number | null;
  /** Spot only: SOL size of the trade (buys and sells). */
  tradeSolAmount: number | null;
  /** Spot only: market cap in USD at execution (entry for buys, exit for sells). */
  tradeMarketCapUsd: number | null;
  /**
   * Structured payload. Aggregates: { tradeCount, windowStart, windowEnd,
   * totalSol, avgMarketCapUsd, totalPnlSol, breakdown[] }. Leverage:
   * { marginSol, notionalSol, marketCapUsd, closeReason, triggerMc }.
   * Recovery: { tokensBurned, netSol }. Milestones: publisher-defined plus
   * { category }.
   */
  meta: Record<string, unknown> | null;
  /** Reaction counts by key (only keys with count > 0). */
  reactions: Record<string, number>;
  /** The viewer's own reaction, when a session was present. */
  viewerReaction: string | null;
  timestamp: number;
  user: {
    user_id: number;
    x_username: string;
    x_display_name: string | null;
    x_avatar_url: string | null;
    graduation_tier?: string;
    official_badges?: string[];
    /** Shared Trust Score (decorative; from the cached reputation board). */
    trustScore?: number;
  };
}

interface ActivityRow {
  id: string;
  kind:
    | "spot"
    | "leverage"
    | "callout"
    | "thesis"
    | "achievement"
    | "recovery"
    | "campaign"
    | "milestone";
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
  sol_amount: number | null;
  mcap: number | null;
  meta: Record<string, unknown> | null;
  ts: number;
  user_id: number;
  x_username: string;
  x_display_name: string | null;
  x_avatar_url: string | null;
  badge_key: string | null;
}

const badgeDefMap = new Map(BADGE_DEFINITIONS.map((d) => [d.key, d]));

/** Feed kinds that can be requested via the kinds filter. */
const FILTERABLE_KINDS = new Set([
  "spot",
  "leverage",
  "callout",
  "thesis",
  "achievement",
  "recovery",
  "campaign",
  "milestone",
]);

export async function getActivity(opts: {
  /** When provided, restrict to these internal user ids (the followed set). */
  followingUserIds?: number[] | null;
  /** Restrict to one actor and include their private milestones (My Activity). */
  mineUserId?: number | null;
  /** Server-side kind filter (e.g. ["spot","leverage"] for the Trading tab). */
  kinds?: string[] | null;
  /** Viewer for reaction state (independent of filtering). */
  viewerUserId?: number | null;
  limit?: number;
}): Promise<FeedActivityItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
  const follow = opts.followingUserIds;
  // An explicit empty follow set means "following nobody" → no activity.
  if (follow && follow.length === 0) return [];

  const kinds = (opts.kinds ?? []).filter((k) => FILTERABLE_KINDS.has(k));

  // Ensure all referenced schemas exist before querying them.
  await Promise.all([
    ensureProfileSchema(),
    ensureThesesSchema(),
    ensureBadgesSchema(),
    ensureRecoverySchema(),
    ensureCampaignSchema(),
    ensureFeedSchema(),
  ]);

  const params: unknown[] = [];
  let followClause = "";
  let followClauseUser = "";
  const scopeIds = opts.mineUserId != null ? [opts.mineUserId] : follow;
  if (scopeIds && scopeIds.length > 0) {
    params.push(scopeIds);
    followClause = `AND i.user_id = ANY($${params.length}::int[])`;
    followClauseUser = `AND user_id = ANY($${params.length}::int[])`;
  }

  // Milestone visibility: global sees public; following/mine see more.
  const milestoneVisibility =
    opts.mineUserId != null
      ? "TRUE" // owner sees everything they published
      : follow && follow.length > 0
        ? "e.visibility IN ('public', 'followers')"
        : "e.visibility = 'public'";

  // Overfetch so read-time aggregation has room to collapse trade bursts and
  // still fill the page.
  params.push(Math.min(limit * 3, 300));
  const limitIdx = params.length;

  let kindsClause = "";
  if (kinds.length > 0) {
    params.push(kinds);
    kindsClause = `WHERE kind = ANY($${params.length}::text[])`;
  }

  // Trivial setup badges never post feed cards. Keys are code-controlled
  // constants (alphanumeric/underscore), so inlining them is injection-safe.
  const nonFeedBadgeClause =
    NON_FEED_BADGE_KEYS.length > 0
      ? `AND ua.badge_key NOT IN (${NON_FEED_BADGE_KEYS.map((k) => `'${k}'`).join(", ")})`
      : "";

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
              t.sol_amount AS sol_amount,
              t.market_cap_usd AS mcap,
              NULL::jsonb AS meta,
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
              lt.margin_sol AS sol_amount,
              lt.market_cap AS mcap,
              jsonb_build_object(
                'marginSol', lt.margin_sol,
                'notionalSol', lt.notional_sol,
                'marketCapUsd', lt.market_cap,
                'closeReason', lt.close_reason,
                'triggerMc', lt.trigger_mc
              ) AS meta,
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
              NULL::double precision AS sol_amount,
              NULL::double precision AS mcap,
              NULL::jsonb AS meta,
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
              NULL::double precision AS sol_amount,
              NULL::double precision AS mcap,
              NULL::jsonb AS meta,
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
              NULL::double precision AS sol_amount,
              NULL::double precision AS mcap,
              NULL::jsonb AS meta,
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
        WHERE TRUE ${nonFeedBadgeClause} ${followClauseUser.replace(/user_id/g, "ua.user_id")}
       UNION ALL
       -- Recovery cleanups by X-authenticated users. Structured payload in
       -- meta; recovered SOL / accounts closed still surface via dedicated
       -- fields for the card.
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
              NULL::double precision AS sol_amount,
              NULL::double precision AS mcap,
              jsonb_build_object(
                'tokensBurned', re.tokens_burned,
                'netSol', re.net_sol
              ) AS meta,
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
              AND re.verified = true
              AND re.x_user_id IS NOT NULL
              AND re.accounts_closed > 0
              ${followClauseUser.replace(/user_id/g, "xi.user_id")}
       UNION ALL
       -- Community campaign milestones (launched / funded / completed). The
       -- token_mint column carries the campaign public id (link target).
       SELECT ('camp-' || ce.id) AS id,
              'campaign' AS kind,
              ce.event_key AS action,
              c.public_id AS token_mint,
              NULL::text AS token_symbol,
              NULL::text AS token_name,
              c.image_url AS token_logo,
              NULL::int AS leverage,
              NULL::text AS direction,
              (c.goal_lamports / 1e9)::double precision AS pnl_sol,
              c.brief AS thesis,
              NULL::text AS conviction,
              NULL::double precision AS call_market_cap,
              NULL::double precision AS call_price_usd,
              c.title AS thesis_title,
              NULL::text AS sentiment,
              NULL::double precision AS sol_amount,
              NULL::double precision AS mcap,
              jsonb_build_object(
                'goalUsd', c.goal_usd,
                'goalLabel', c.goal_label,
                'typeKey', c.type_key
              ) AS meta,
              ce.created_at AS ts,
              c.creator_user_id AS user_id,
              xi.x_username AS x_username,
              u.display_name AS x_display_name,
              u.avatar_url AS x_avatar_url,
              NULL::text AS badge_key
         FROM campaign_events ce
         JOIN campaigns c ON c.id = ce.campaign_id
         JOIN user_identities xi
           ON xi.user_id = c.creator_user_id AND xi.provider = 'x'
         JOIN users u ON u.id = c.creator_user_id
        WHERE ce.event_key IN ('launched', 'funded', 'completed')
              ${followClauseUser.replace(/user_id/g, "c.creator_user_id")}
       UNION ALL
       -- Published milestone events (tier promotions, follower milestones,
       -- future DNA changes / AI insights) - the feed_events table.
       SELECT ('fe-' || e.id) AS id,
              'milestone' AS kind,
              e.kind AS action,
              '' AS token_mint,
              NULL::text AS token_symbol,
              NULL::text AS token_name,
              NULL::text AS token_logo,
              NULL::int AS leverage,
              NULL::text AS direction,
              NULL::double precision AS pnl_sol,
              e.summary AS thesis,
              NULL::text AS conviction,
              NULL::double precision AS call_market_cap,
              NULL::double precision AS call_price_usd,
              e.title AS thesis_title,
              NULL::text AS sentiment,
              NULL::double precision AS sol_amount,
              NULL::double precision AS mcap,
              (jsonb_build_object('category', e.category)
                || COALESCE(e.meta, '{}'::jsonb)) AS meta,
              e.created_at AS ts,
              e.actor_user_id AS user_id,
              xi.x_username AS x_username,
              u.display_name AS x_display_name,
              u.avatar_url AS x_avatar_url,
              NULL::text AS badge_key
         FROM feed_events e
         JOIN user_identities xi
           ON xi.user_id = e.actor_user_id AND xi.provider = 'x'
         JOIN users u ON u.id = e.actor_user_id
        WHERE ${milestoneVisibility}
              ${followClauseUser.replace(/user_id/g, "e.actor_user_id")}
     )
     SELECT * FROM activity
      ${kindsClause}
      ORDER BY ts DESC
      LIMIT $${limitIdx}`,
    params,
  );

  // ── Read-time trade aggregation ────────────────────────────────────────────
  const spotRows = rows.filter((r) => r.kind === "spot");
  const otherRows = rows.filter((r) => r.kind !== "spot");
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const rawTrades: RawSpotTrade[] = spotRows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    mint: r.token_mint,
    side: r.action === "buy" ? "buy" : "sell",
    ts: r.ts,
    solAmount: r.sol_amount ?? 0,
    pnlSol: r.pnl_sol,
    marketCapUsd: r.mcap,
  }));
  const tradeItems = aggregateSpotTrades(rawTrades);

  const items: FeedActivityItem[] = [];
  for (const t of tradeItems) {
    if (t.type === "single") {
      const row = rowById.get(t.trade.id);
      if (row) items.push(mapRow(row));
    } else {
      const firstRow = rowById.get(t.group.breakdown[0].id);
      if (firstRow) items.push(mapAggGroup(t.group, firstRow));
    }
  }
  for (const r of otherRows) items.push(mapRow(r));

  items.sort((a, b) => b.timestamp - a.timestamp);
  const page = items.slice(0, limit);

  // Attach graduation_tier + official_badges + trust score per poster
  // (decorative - never throws). Trust comes from the cached reputation board.
  const uniqueUserIds = [...new Set(page.map((i) => i.user.user_id))];
  const [tierMap, badgeMap, reputation] = await Promise.all([
    getUserTiers(uniqueUserIds),
    getOfficialBadgesForUsers(uniqueUserIds),
    computeReputationBoard().catch(() => []),
  ]);
  const trustMap = new Map(reputation.map((e) => [e.user_id, e.trustScore]));
  for (const item of page) {
    const t = tierMap.get(item.user.user_id);
    if (t) item.user.graduation_tier = t;
    const b = badgeMap.get(item.user.user_id);
    if (b && b.length > 0) item.user.official_badges = b;
    const trust = trustMap.get(item.user.user_id);
    if (trust != null) item.user.trustScore = trust;
  }

  // Attach reactions (best-effort; feed still renders without them).
  try {
    const reactions = await getReactionsForEvents(
      page.map((i) => i.id),
      opts.viewerUserId ?? null,
    );
    for (const item of page) {
      const r = reactions.get(item.id);
      if (r) {
        item.reactions = r.counts;
        item.viewerReaction = r.viewerReaction;
      }
    }
  } catch {
    // Feed must render even if the reaction store hiccups.
  }

  await enrichCalloutPerformance(page, rows);
  return page;
}

/** Map one UNION row to a feed item (no aggregation). */
function mapRow(r: ActivityRow): FeedActivityItem {
  const badgeDef = r.badge_key ? (badgeDefMap.get(r.badge_key) ?? null) : null;
  const isRecovery = r.kind === "recovery";
  const isCampaign = r.kind === "campaign";
  return {
    id: r.id,
    kind: r.kind,
    action: r.action,
    token: {
      // Campaign rows carry the campaign public id in the mint column;
      // never surface it as a token.
      mint: isCampaign ? "" : r.token_mint,
      symbol: r.token_symbol,
      name: r.token_name,
      logo: r.token_logo,
    },
    leverage: isRecovery ? null : r.leverage,
    direction: r.direction,
    pnlSol: isRecovery || isCampaign ? null : r.pnl_sol,
    // For achievements, thesis carries the badge description.
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
    badgeRarity: badgeDef?.rarity ?? null,
    recoveredSol: isRecovery ? r.pnl_sol : null,
    accountsClosed: isRecovery ? r.leverage : null,
    campaignPublicId: isCampaign ? r.token_mint : null,
    campaignGoalSol: isCampaign ? r.pnl_sol : null,
    tradeSolAmount: r.kind === "spot" ? r.sol_amount : null,
    tradeMarketCapUsd: r.kind === "spot" ? r.mcap : null,
    meta: r.meta ?? null,
    reactions: {},
    viewerReaction: null,
    timestamp: r.ts,
    user: {
      user_id: r.user_id,
      x_username: r.x_username,
      x_display_name: r.x_display_name,
      x_avatar_url: r.x_avatar_url,
    },
  };
}

/** Map an aggregated trade group to a feed item (user/token from first row). */
function mapAggGroup(
  g: AggregatedTradeGroup,
  firstRow: ActivityRow,
): FeedActivityItem {
  const action =
    g.side === "buy"
      ? "accumulated"
      : g.totalPnlSol != null && g.totalPnlSol >= 0
        ? "took_profits"
        : "exited";
  return {
    id: g.id,
    kind: "agg",
    action,
    token: {
      mint: firstRow.token_mint,
      symbol: firstRow.token_symbol,
      name: firstRow.token_name,
      logo: firstRow.token_logo,
    },
    leverage: null,
    direction: null,
    pnlSol: g.totalPnlSol,
    thesis: null,
    conviction: null,
    callMarketCapUsd: null,
    currentMarketCapUsd: null,
    currentMultiple: null,
    athMultiple: null,
    thesisTitle: null,
    sentiment: null,
    badgeKey: null,
    badgeName: null,
    badgeRarity: null,
    recoveredSol: null,
    accountsClosed: null,
    campaignPublicId: null,
    campaignGoalSol: null,
    tradeSolAmount: null,
    tradeMarketCapUsd: null,
    meta: {
      tradeCount: g.tradeCount,
      windowStart: g.windowStart,
      windowEnd: g.windowEnd,
      totalSol: g.totalSol,
      avgMarketCapUsd: g.avgMarketCapUsd,
      totalPnlSol: g.totalPnlSol,
      breakdown: g.breakdown,
    },
    reactions: {},
    viewerReaction: null,
    timestamp: g.windowEnd,
    user: {
      user_id: firstRow.user_id,
      x_username: firstRow.x_username,
      x_display_name: firstRow.x_display_name,
      x_avatar_url: firstRow.x_avatar_url,
    },
  };
}

/**
 * Enrich callout feed items with live performance (Current MC, Current X, ATH X).
 * Computed dynamically and batched: one DexScreener stats batch + one peaks read
 * for all unique callout mints in the page. Best-effort - any failure leaves the
 * call showing its preserved Called MC with no live numbers.
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

import { dbAll, dbGet } from "./database.js";
import { ensureProfileSchema } from "./profiles.js";
import { ensureJournalSchema } from "./journal.js";
import { countTokenTheses, getTokenTheses } from "./theses.js";
import { getExecutionPrice } from "./prices.js";

/**
 * Per-token "intelligence" aggregation for the Token Page V2 workstation.
 *
 * This is a pure, read-only roll-up over existing tables (callouts, watchlist,
 * journal_entries) for a single mint. It NEVER mutates anything — callouts are
 * immutable by product rule, and journal/watchlist rows are owner-scoped writes
 * that happen elsewhere. The current price is fetched once and used to grade
 * each callout live (current ÷ snapshotted call price = multiple), exactly like
 * the Top Callers board, so the page never invents a number it can't back.
 *
 * Data the underlying model does not capture (live holder count, individual
 * largest buy/sell, per-trade recent activity, all-time-high multiple) is
 * intentionally NOT fabricated here — the client renders "Coming Soon" for
 * those. We only return what we can compute honestly.
 */

/** A call counts as a "hit" once it has at least doubled from the call price. */
const HIT_MULTIPLE = 2;
/** How many recent callouts/theses to preview on the page. */
const RECENT_LIMIT = 8;

export interface TokenSentiment {
  totalCalls: number;
  activeCallers: number;
  gradedCalls: number;
  /** Fraction (0..1) of graded calls that have at least doubled. */
  successRate: number;
  theses: number;
  convictionHigh: number;
  convictionMedium: number;
  convictionLow: number;
}

export interface TokenCommunity {
  watchers: number;
  callers: number;
  journalEntries: number;
  theses: number;
}

export interface RecentCallout {
  id: number;
  user_id: number;
  x_username: string | null;
  x_display_name: string | null;
  x_avatar_url: string | null;
  call_market_cap: number | null;
  call_price_usd: number | null;
  conviction: string | null;
  /** Live multiple (current ÷ call price), or null when no fresh price. */
  currentMultiple: number | null;
  currentMarketCapUsd: number | null;
  created_at: number;
}

export interface RecentThesis {
  id: number;
  user_id: number;
  x_username: string | null;
  x_display_name: string | null;
  x_avatar_url: string | null;
  title: string;
  content: string;
  sentiment: string;
  conviction: string | null;
  created_at: number;
  updated_at: number;
}

export interface TokenIntelligence {
  mint: string;
  sentiment: TokenSentiment;
  community: TokenCommunity;
  recentCallouts: RecentCallout[];
  recentTheses: RecentThesis[];
}

interface CalloutRow {
  id: number;
  user_id: number;
  token_symbol: string | null;
  call_market_cap: number | null;
  call_price_usd: number | null;
  thesis: string | null;
  conviction: string | null;
  created_at: number;
  x_username: string | null;
  x_display_name: string | null;
  x_avatar_url: string | null;
}

/** Aggregate everything the Token Page V2 panels need for one mint. */
export async function getTokenIntelligence(
  mint: string,
): Promise<TokenIntelligence> {
  await Promise.all([ensureProfileSchema(), ensureJournalSchema()]);

  // All callouts for this mint, joined to the caller's X identity, newest first.
  const rows = await dbAll<CalloutRow>(
    `SELECT c.id, c.user_id, c.token_symbol, c.call_market_cap,
            c.call_price_usd, c.thesis, c.conviction, c.created_at,
            xi.x_username AS x_username,
            u.display_name AS x_display_name,
            u.avatar_url AS x_avatar_url
       FROM callouts c
       JOIN user_identities xi ON xi.user_id = c.user_id AND xi.provider = 'x'
       JOIN users u ON u.id = c.user_id
      WHERE c.token_mint = $1
        AND c.is_hidden_by_admin = FALSE AND c.is_test = FALSE
      ORDER BY c.created_at DESC`,
    [mint],
  );

  // Standalone theses (separate content type — never graded as calls).
  const [thesisRows, thesesTotal] = await Promise.all([
    getTokenTheses(mint, { limit: RECENT_LIMIT }),
    countTokenTheses(mint),
  ]);

  // One live price lookup, reused to grade every call for this token.
  const px = await getExecutionPrice(mint).catch(() => null);
  const currentPriceUsd = px?.priceUsd ?? null;
  const currentMarketCapUsd = px?.marketCapUsd ?? null;

  const callerIds = new Set<number>();
  const theses = thesesTotal;
  let convictionHigh = 0;
  let convictionMedium = 0;
  let convictionLow = 0;
  let gradedCalls = 0;
  let hits = 0;

  for (const r of rows) {
    callerIds.add(r.user_id);
    if (r.conviction === "high") convictionHigh += 1;
    else if (r.conviction === "medium") convictionMedium += 1;
    else if (r.conviction === "low") convictionLow += 1;

    if (
      currentPriceUsd != null &&
      currentPriceUsd > 0 &&
      r.call_price_usd != null &&
      r.call_price_usd > 0
    ) {
      gradedCalls += 1;
      if (currentPriceUsd / r.call_price_usd >= HIT_MULTIPLE) hits += 1;
    }
  }

  const sentiment: TokenSentiment = {
    totalCalls: rows.length,
    activeCallers: callerIds.size,
    gradedCalls,
    successRate: gradedCalls > 0 ? hits / gradedCalls : 0,
    theses,
    convictionHigh,
    convictionMedium,
    convictionLow,
  };

  const recentCallouts: RecentCallout[] = rows.slice(0, RECENT_LIMIT).map((r) => {
    const multiple =
      currentPriceUsd != null &&
      currentPriceUsd > 0 &&
      r.call_price_usd != null &&
      r.call_price_usd > 0
        ? currentPriceUsd / r.call_price_usd
        : null;
    return {
      id: r.id,
      user_id: r.user_id,
      x_username: r.x_username,
      x_display_name: r.x_display_name,
      x_avatar_url: r.x_avatar_url,
      call_market_cap: r.call_market_cap,
      call_price_usd: r.call_price_usd,
      conviction: r.conviction,
      currentMultiple: multiple,
      currentMarketCapUsd,
      created_at: r.created_at,
    };
  });

  const recentTheses: RecentThesis[] = thesisRows.map((t) => ({
    id: t.id,
    user_id: t.user_id,
    x_username: t.x_username,
    x_display_name: t.x_display_name,
    x_avatar_url: t.x_avatar_url,
    title: t.title,
    content: t.content,
    sentiment: t.sentiment,
    conviction: t.conviction,
    created_at: t.created_at,
    updated_at: t.updated_at,
  }));

  // Cheap COUNT roll-ups for the Community Intelligence card.
  const [watchRow, journalRow] = await Promise.all([
    dbGet<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM watchlist WHERE token_mint = $1`,
      [mint],
    ),
    dbGet<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM journal_entries WHERE token_mint = $1`,
      [mint],
    ),
  ]);

  const community: TokenCommunity = {
    watchers: watchRow?.n ?? 0,
    callers: callerIds.size,
    journalEntries: journalRow?.n ?? 0,
    theses,
  };

  return { mint, sentiment, community, recentCallouts, recentTheses };
}

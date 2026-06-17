const API_BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : null) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

// ---- Types ----
export interface Account {
  wallet: string;
  paper_balance: number;
  total_trades: number;
  winning_trades: number;
  total_pnl: number;
  realized_pnl: number;
  best_trade: number;
  worst_trade: number;
  current_streak: number;
  participation_points: number;
  graduation_tier: string;
  created_at: number;
  last_active: number;
  last_reset_at: number | null;
  win_rate: number;
  season?: number;
}

// ---- Admin / feature flags ----
export type FeatureFlagKey =
  | "buy_limits"
  | "tp_sl"
  | "multi_target_tp"
  | "experimental_utilities"
  | "leverage";

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export interface AdminMe {
  admin: boolean;
  x_username: string | null;
}

export type AdminStatsWindow = "24h" | "7d" | "30d" | "all";

export interface AdminUserStats {
  new_users: number;
  guest_users: number;
  x_users: number;
  returning_users: number;
  active_users: number;
}

export interface AdminTradingStats {
  trades: number;
  spot_trades: number;
  leverage_trades: number;
  volume_sol: number;
  avg_trade_size: number;
  buys: number;
  sells: number;
  unique_traders: number;
  largest_trade: number;
}

export interface AdminFeedStats {
  feed_views: number;
  profile_views: number;
  follows: number;
}

/**
 * Windowed guest funnel — full journey, each stage a first-touch-per-device
 * beacon so counts are monotonic and conversion/dropoff are well-defined.
 */
export interface AdminFunnel {
  guest_sessions: number;
  wallet_searches: number;
  token_views: number;
  first_trade: number;
  second_trade: number;
  x_connect: number;
  registration: number;
}

/** Lifetime structural counts + guest funnel (not windowed). */
export interface AdminTotals {
  accounts: number;
  users: number;
  wallet_links: number;
  x_links: number;
  positions: number;
  active_orders: number;
  leaderboard_users: number;
  guest_created: number;
  guest_traded: number;
  guest_converted: number;
  portfolio_views: number;
  leaderboard_views: number;
}

export interface AdminTopToken {
  token_symbol: string | null;
  token_mint: string;
  trades: number;
  volume_sol: number;
}

export interface AdminStatsResponse {
  window: AdminStatsWindow;
  generatedAt: number;
  users: AdminUserStats;
  trading: AdminTradingStats;
  tokens: AdminTopToken[];
  tokens_by_volume: AdminTopToken[];
  tokens_by_buys: AdminTopToken[];
  tokens_by_sells: AdminTopToken[];
  feed: AdminFeedStats;
  funnel: AdminFunnel;
  totals: AdminTotals;
}

export type AnalyticsEventType =
  | "guest_created"
  | "guest_first_trade"
  | "guest_converted"
  | "portfolio_view"
  | "leaderboard_view"
  // Guest funnel expansion.
  | "wallet_search"
  | "token_view"
  | "guest_second_trade"
  | "x_connect"
  // Social layer (Phase 1).
  | "feed_view"
  | "profile_view"
  | "follow_created"
  | "follow_removed"
  | "feed_tab_changed"
  | "x_profile_link_clicked";

export interface AdminHealth {
  api: { ok: boolean; uptimeSeconds: number; node: string };
  db: { ok: boolean; latencyMs: number | null };
  market: {
    lastUpdated: number | null;
    tokenCount: number;
    pumpportalConnected: boolean;
    cacheAge: number | null;
  };
  memory: { rssMb: number; heapUsedMb: number };
}

export interface ResetOptions {
  resetBalance?: boolean;
  clearPositions?: boolean;
  clearOrders?: boolean;
  clearTrades?: boolean;
  resetLeaderboard?: boolean;
  clearWatchlist?: boolean;
  clearLeverage?: boolean;
}

export interface ResetResult {
  ok: boolean;
  scope: "user" | "all";
  wallet?: string;
  applied: string[];
  deleted: Record<string, number>;
  accountsReset: number;
}

/** Result of a social/journal/test-data/full reset (backup + delete counts). */
export interface SocialResetResult {
  ok: boolean;
  kind: "social" | "journal" | "test-data" | "full";
  backupSchema?: string;
  deleted?: Record<string, number>;
}

export interface AdminSocialOverview {
  callouts_total: number;
  callouts_test: number;
  callouts_hidden: number;
  theses_total: number;
  theses_test: number;
  theses_hidden: number;
  journal_total: number;
  journal_test: number;
  follows_total: number;
}

export type AdminSocialTestFilter = "all" | "test" | "real" | "hidden";

export interface AdminSocialFilters {
  filter?: AdminSocialTestFilter;
  token?: string;
  user?: string;
  limit?: number;
}

/** Build the query string for an admin social listing request. */
function socialQs(f?: AdminSocialFilters): string {
  const qs = new URLSearchParams();
  if (f?.filter && f.filter !== "all") qs.set("filter", f.filter);
  if (f?.token) qs.set("token", f.token);
  if (f?.user) qs.set("user", f.user);
  if (f?.limit) qs.set("limit", String(f.limit));
  const q = qs.toString();
  return q ? `?${q}` : "";
}

/** POST `{ id, value }` to a moderation toggle endpoint. */
function postId(path: string, id: number, value: boolean) {
  return request<{ ok: boolean; error?: string }>(path, {
    method: "POST",
    body: JSON.stringify({ id, value }),
  });
}

interface AdminAuthor {
  x_username: string | null;
  x_display_name: string | null;
  x_avatar_url?: string | null;
}

export interface AdminCallout extends AdminAuthor {
  id: number;
  user_id: number;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  token_logo: string | null;
  call_market_cap: number | null;
  conviction: string | null;
  thesis: string | null;
  is_test: boolean;
  is_hidden_by_admin: boolean;
  created_at: number;
}

export interface AdminThesis extends AdminAuthor {
  id: number;
  user_id: number;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  token_logo: string | null;
  title: string;
  content: string;
  sentiment: string;
  conviction: string | null;
  is_test: boolean;
  is_hidden_by_admin: boolean;
  created_at: number;
  updated_at: number;
}

export interface AdminJournalEntry extends AdminAuthor {
  id: number;
  user_id: number;
  title: string | null;
  token: string | null;
  token_mint: string | null;
  outcome: string | null;
  is_test: boolean;
  is_hidden_by_admin: boolean;
  created_at: number;
}

export interface TokenInfo {
  mint: string;
  name: string | null;
  symbol: string | null;
  logo: string | null;
  priceUsd: number | null;
  priceSol: number | null;
  priceChange24h: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  source: string;
  isMigrated: boolean;
  pairAddress: string | null;
  // ── Token Page V2 detail fields (optional, display-only) ──
  buys24h?: number | null;
  sells24h?: number | null;
  /** Pair creation time (ms epoch) — used to render token age. */
  pairCreatedAt?: number | null;
  volume6hUsd?: number | null;
  volume1hUsd?: number | null;
}

/** ── Token Page V2 intelligence roll-up (read-only over existing tables) ── */
export interface TokenSentiment {
  totalCalls: number;
  activeCallers: number;
  gradedCalls: number;
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
  currentMultiple: number | null;
  /** Peak-since-tracking multiple (ATH high-water mark), >= currentMultiple. */
  athMultiple: number | null;
  currentMarketCapUsd: number | null;
  /** Caller's graduation tier (decorative). */
  graduation_tier?: string;
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
  /** Author's graduation tier (decorative). */
  graduation_tier?: string;
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

export interface MarketFeedResponse {
  tokens: TokenInfo[];
  /** ms epoch of the last upstream feed fetch, or null if never fetched yet. */
  lastUpdated: number | null;
  /** Age of the cached feed in seconds, or null if never fetched yet. */
  cacheAge: number | null;
}

export interface SearchResult {
  mint: string;
  name: string | null;
  symbol: string | null;
  logo: string | null;
  priceUsd?: number | null;
  marketCapUsd?: number | null;
}

export interface Position {
  id: number;
  wallet: string;
  token_mint: string;
  token_name: string | null;
  token_symbol: string | null;
  token_logo: string | null;
  total_tokens: number;
  total_sol_spent: number;
  avg_entry_price: number;
  entry_market_cap: number | null;
  opened_at: number;
  currentPriceSol: number | null;
  currentValueSol: number;
  unrealizedPnlSol: number;
  unrealizedPnlPercent: number;
  // P&L split (#8): slippage-free cost basis, pure market movement, the entry
  // trading costs paid (≤ 0), and the net result (= unrealizedPnlSol).
  costBasisMarketSol: number;
  unrealizedPnlMarketSol: number;
  tradingCostsSol: number;
  netResultSol: number;
  currentMarketCapUsd: number | null;
  marketCapChangePercent: number | null;
}

export interface Trade {
  id: number;
  token_mint: string;
  token_name: string | null;
  token_symbol: string | null;
  token_logo: string | null;
  side: "buy" | "sell";
  sol_amount: number;
  token_amount: number;
  price: number;
  pnl: number | null;
  source?: string | null;
  executed_at: number;
  raw_price_usd?: number | null;
  effective_price_usd?: number | null;
  slippage_percent?: number | null;
  trade_impact_percent?: number | null;
  liquidity_usd_at_execution?: number | null;
  sol_usd_price_at_execution?: number | null;
  trade_usd_value?: number | null;
}

export type OrderType = "take_profit" | "stop_loss" | "buy_limit";
export type TriggerType = "market_cap" | "price";
export type TriggerDirection = "gte" | "lte";

export interface PaperOrder {
  id: number;
  wallet: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  order_type: OrderType;
  side: string;
  trigger_type: TriggerType;
  trigger_value: number;
  trigger_direction: TriggerDirection;
  amount_type: string;
  amount_value: number;
  status: string;
  linked_group_id: string | null;
  linked_trade_plan: string | null;
  created_at: number;
  updated_at: number;
  last_checked_at: number | null;
  filled_at: number | null;
  fill_market_cap: number | null;
  fill_price: number | null;
  fill_reason: string | null;
}

export interface OrderFill {
  orderId: number;
  orderType: OrderType;
  tokenMint: string;
  tokenSymbol: string | null;
  percent: number;
  /** Populated for buy_limit fills; null for TP/SL. */
  solAmount?: number | null;
  triggerType: TriggerType;
  triggerValue: number;
  fillMarketCap: number | null;
  fillPrice: number | null;
  pnl: number | null;
}

export type WarningLevel = "none" | "high" | "extreme";

export interface TradeQuote {
  ok: boolean;
  error?: string;
  blocked?: boolean;
  lowData?: boolean;
  side: "buy" | "sell";
  rawPriceUsd: number;
  effectivePriceUsd: number;
  slippagePercent: number;
  tradeImpactPercent: number;
  liquidityUsd: number;
  solUsd: number;
  tradeUsdValue: number;
  warningLevel: WarningLevel;
  estimatedTokens: number | null;
  estimatedSol: number | null;
}

export interface Portfolio {
  wallet: string;
  balance: number;
  positionsValueSol: number;
  equitySol: number;
  unrealizedPnlSol: number;
  realizedPnlSol: number;
  totalPnlSol: number;
  solUsd: number;
  positions: Position[];
}

export interface PortfolioStats {
  wallet: string;
  balance: number;
  /** Total account equity: cash + open spot value + open leverage equity. */
  equitySol: number;
  equityUsd: number;
  /** totalEquitySol − STARTING_BALANCE (all sources: spot + leverage). */
  totalPnlSol: number;
  /** Spot realized P&L only (post-reset). */
  realizedPnlSol: number;
  /** Spot unrealized P&L only. */
  unrealizedPnlSol: number;
  roiPercent: number;
  /** Spot + leverage trade events. */
  totalExecutions: number;
  /** Spot closed trades + leverage closes/liquidations. */
  closedTrades: number;
  /** Spot winning trades only (win rate stays a spot-only metric). */
  winningTrades: number;
  /** Spot win rate only. */
  winRate: number;
  /** Largest winning spot trade, or null when none. */
  bestTrade: number | null;
  worstTrade: number;
  currentStreak: number;
  participationPoints: number;
  graduationTier: string;
  openPositions: number;
  solUsd: number;
  // ── Leverage breakdown ──────────────────────────────────────────────────
  /** Sum of max(0, positionEquitySol ?? margin) for each open leverage position. */
  openLeverageEquitySol: number;
  /** Cumulative realized P&L from closed/liquidated leverage positions. */
  leverageRealizedPnlSol: number;
  /** Cumulative unrealized P&L across open leverage positions. */
  leverageUnrealizedPnlSol: number;
  /** Number of currently open leverage positions. */
  leverageOpenCount: number;
}

export interface ChartPoint {
  t: number;
  equity: number;
  balance: number;
}

export interface LiveTrade {
  mint: string;
  trader: string;
  side: "buy" | "sell";
  solAmount: number;
  tokenAmount: number;
  timestamp: number;
}

export interface NewToken {
  mint: string;
  name?: string | null;
  symbol?: string | null;
  uri?: string | null;
  marketCapSol?: number | null;
  timestamp: number;
}

export interface MigratedToken {
  mint: string;
  name: string | null;
  symbol: string | null;
  logo: string | null;
  migratedAt: number;
  priceUsd: number | null;
  priceChange24h: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
}

export interface WatchItem {
  mint: string;
  name: string | null;
  symbol: string | null;
  logo: string | null;
  priceUsd: number | null;
  priceSol: number | null;
  priceChange24h: number | null;
  marketCapUsd: number | null;
}

export type LeaderboardPeriod = "daily" | "weekly" | "all";

export interface LeaderboardEntry {
  rank: number;
  wallet: string;
  user_id: number | null;
  x_username: string | null;
  x_avatar_url: string | null;
  x_display_name: string | null;
  realized_pnl: number;
  roi: number;
  win_rate: number;
  total_closed_trades: number;
  best_trade: number;
  graduation_tier: string;
  officialBadges?: OfficialBadgeType[];
  created_at: number;
  updated_at: number;
}

export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  minTrades: number;
  entries: LeaderboardEntry[];
  solUsd: number;
}

// ---- Social: profiles, follows, feed (Phase 1) ----
export interface ProfileStats {
  roiPercent: number;
  totalPnlSol: number;
  realizedPnlSol: number;
  winRate: number;
  totalExecutions: number;
  closedTrades: number;
  bestTrade: number | null;
  graduationTier: string;
}

export interface XReputation {
  /** Unix-second timestamp the X account was created, or null. */
  accountCreatedAt: number | null;
  verified: boolean | null;
  followers: number | null;
  following: number | null;
}

export type TrustLabel = "New" | "Building" | "Established" | "Proven";
export interface TrustScore {
  score: number;
  label: TrustLabel;
}

export type OfficialBadgeType = "founder" | "bp_team";

export type BadgeCategory = "trading" | "caller" | "thesis" | "community";
export interface BadgeEntry {
  key: string;
  name: string;
  description: string;
  category: BadgeCategory;
  icon: string;
  earned: boolean;
  earnedAt: number | null;
}

export interface ProfileResponse {
  user_id: number;
  x_id: string;
  x_username: string;
  x_display_name: string | null;
  x_avatar_url: string | null;
  rank: number | null;
  graduationTier: string;
  followers: number;
  following: number;
  isFollowing: boolean;
  isSelf: boolean;
  /** Owner-editable plain-text bio (≤250 chars), or null when unset. */
  bio: string | null;
  xReputation: XReputation;
  stats: ProfileStats;
  /** Computed trust score (0–100). Present on profile GET responses. */
  trustScore?: TrustScore;
  /** Admin-assigned official badges (founder / bp_team). */
  officialBadges?: OfficialBadgeType[];
}

/** Max bio length, kept in sync with the server-side BIO_MAX_LENGTH. */
export const BIO_MAX_LENGTH = 250;

export type Conviction = "low" | "medium" | "high";

/** Max length for a callout thesis / update, in sync with the server. */
export const CALLOUT_THESIS_MAX = 500;
export const CALLOUT_UPDATE_MAX = 500;

/** An immutable on-the-record callout (no edits, no deletes). */
export interface Callout {
  id: number;
  user_id: number;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  token_logo: string | null;
  call_price_sol: number | null;
  call_price_usd: number | null;
  call_market_cap: number | null;
  liquidity_usd: number | null;
  holder_count: number | null;
  thesis: string | null;
  conviction: string | null;
  created_at: number;
}

/** An append-only follow-up note attached to a callout. */
export interface CalloutUpdate {
  id: number;
  callout_id: number;
  user_id: number;
  content: string;
  created_at: number;
}

/** Live result for a callout, or null when no fresh price is available. */
export interface CalloutResult {
  currentPriceUsd: number;
  currentMarketCapUsd: number | null;
  pnlPercent: number | null;
  currentMultiple: number | null;
  /** Peak-since-tracking multiple (ATH high-water mark), >= currentMultiple. */
  athMultiple: number | null;
}

/** A callout enriched with its update trail and current live result. */
export interface CalloutWithDetail extends Callout {
  updates: CalloutUpdate[];
  result: CalloutResult | null;
}

export interface FollowUser {
  user_id: number;
  x_username: string;
  x_display_name: string | null;
  x_avatar_url: string | null;
}

// ---- Standalone Theses ----
// A thesis is a piece of token research, distinct from a callout. It is NOT
// graded as a price prediction and never affects caller ranking, multiples,
// hit rate, or call history. Unlike callouts, theses ARE owner-editable and
// owner-deletable.
export type Sentiment = "bullish" | "bearish" | "neutral";

export const THESIS_TITLE_MAX = 120;
export const THESIS_CONTENT_MAX = 2000;
export const SENTIMENTS: Sentiment[] = ["bullish", "bearish", "neutral"];

export interface Thesis {
  id: number;
  user_id: number;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  token_logo: string | null;
  title: string;
  content: string;
  sentiment: Sentiment;
  conviction: Conviction | null;
  is_test?: boolean;
  is_hidden_by_admin?: boolean;
  created_at: number;
  updated_at: number;
}

/** A thesis joined to its author's X identity (public reads). */
export interface ThesisWithAuthor extends Thesis {
  x_username: string;
  x_display_name: string | null;
  x_avatar_url: string | null;
}

/** Editable fields for creating/updating a thesis. */
export interface ThesisInput {
  tokenMint?: string;
  title: string;
  content: string;
  sentiment: Sentiment;
  conviction?: Conviction | null;
}

// ---- Trading Journal ----
export type JournalTradeType = "spot" | "leverage";
export type JournalDirection = "long" | "short";
export type JournalOutcome = "win" | "loss" | "neutral";

/** A private trade review. Mutable and owner-scoped (unlike callouts). */
export interface JournalEntry {
  id: number;
  user_id: number;
  title: string | null;
  trade_type: string | null;
  direction: string | null;
  outcome: string | null;
  token: string | null;
  token_mint: string | null;
  trade_date: number | null;
  entry_reason: string | null;
  exit_reason: string | null;
  went_right: string | null;
  went_wrong: string | null;
  lessons: string | null;
  emotion_before: string | null;
  emotion_after: string | null;
  rating: number | null;
  notes: string | null;
  template: string | null;
  source: string | null;
  entry_mc: number | null;
  exit_mc: number | null;
  roi: number | null;
  pnl: number | null;
  created_at: number;
  updated_at: number;
}

/** Fields accepted when creating/updating a journal entry. */
export interface JournalInput {
  title?: string | null;
  tradeType?: string | null;
  direction?: string | null;
  outcome?: string | null;
  token?: string | null;
  tradeDate?: number | null;
  entryReason?: string | null;
  exitReason?: string | null;
  wentRight?: string | null;
  wentWrong?: string | null;
  lessons?: string | null;
  emotionBefore?: string | null;
  emotionAfter?: string | null;
  rating?: number | null;
  notes?: string | null;
  template?: string | null;
}

export interface JournalStats {
  totalEntries: number;
  entriesThisMonth: number;
  winningReviews: number;
  losingReviews: number;
  lessonsRecorded: number;
}

export interface FeedActivityItem {
  id: string;
  kind: "spot" | "leverage" | "callout" | "thesis" | "achievement";
  action: string;
  token: {
    mint: string;
    symbol: string | null;
    name: string | null;
    logo: string | null;
  };
  leverage: number | null;
  direction: string | null;
  pnlSol: number | null;
  /** Callout thesis text / thesis body / badge description for achievements. */
  thesis: string | null;
  conviction: string | null;
  callMarketCapUsd: number | null;
  /** Live callout performance (callouts only; null for trades/theses/achievements). */
  currentMarketCapUsd?: number | null;
  currentMultiple?: number | null;
  athMultiple?: number | null;
  thesisTitle?: string | null;
  sentiment?: string | null;
  /** Achievement badge identifier key, null for non-achievement items. */
  badgeKey?: string | null;
  /** Human-readable badge name, null for non-achievement items. */
  badgeName?: string | null;
  timestamp: number;
  user: {
    user_id: number;
    x_username: string;
    x_display_name: string | null;
    x_avatar_url: string | null;
    graduation_tier?: string;
    official_badges?: OfficialBadgeType[];
  };
}

// ---- Top Caller reputation ----
export interface CallerBestCall {
  token_symbol: string | null;
  token_mint: string;
  athMultiple?: number | null;
  multiple: number;
  calledMarketCapUsd?: number | null;
  currentMarketCapUsd?: number | null;
}

/** A caller's aggregated reputation stats + rank on the Top Callers board. */
export interface CallerEntry {
  rank: number;
  user_id: number;
  x_username: string | null;
  x_display_name: string | null;
  x_avatar_url: string | null;
  callsMade: number;
  gradedCalls: number;
  avgMultiple: number | null;
  bestMultiple: number | null;
  hitRate: number;
  callerScore: number;
  bestCall: CallerBestCall | null;
  officialBadges?: OfficialBadgeType[];
  graduation_tier?: string;
}

export interface MostFollowedEntry {
  rank: number;
  user_id: number;
  x_username: string;
  x_display_name: string | null;
  x_avatar_url: string | null;
  follower_count: number;
  officialBadges?: OfficialBadgeType[];
  graduation_tier?: string;
}

// ---- SOL Recovery analytics ----
export interface RecoveryTrackBody {
  eventType: "scan" | "cleanup";
  wallet: string;
  accountsFound?: number;
  accountsClosed?: number;
  recoverableSol?: number;
  recoveredSol?: number;
  status?: "success" | "failed";
  error?: string;
  /** Confirmed close-tx signatures for a cleanup (omitted for scans). */
  txSignatures?: string[];
  /** Estimated Solana base network fee paid for the cleanup (SOL). */
  networkFeeSol?: number;
  /** Net SOL that landed in the wallet after the network fee (SOL). */
  netSol?: number;
}

/**
 * Per-mint token metadata for the recovery account list. Every field is
 * nullable; a null means "not resolvable", and the UI shows its own fallback
 * ("Unknown Token" + short mint). The server never fabricates symbol/name.
 */
export interface RecoveryTokenMeta {
  symbol: string | null;
  name: string | null;
  logo: string | null;
}

export interface RecoveryWindowStats {
  scans: number;
  unique_wallets: number;
  accounts_closed: number;
  sol_recovered: number;
  successful_cleanups: number;
}

export interface RecoveryLifetimeStats extends RecoveryWindowStats {
  failed_cleanups: number;
  largest_recovery: number;
  avg_recovered: number;
  /** Total estimated network fees paid across all successful cleanups (SOL). */
  total_network_fees: number;
  /** Total BlackPebble platform fees collected — always 0 today (SOL). */
  total_bp_fees: number;
  /** Total net SOL that landed in wallets across successful cleanups (SOL). */
  total_net: number;
}

export interface RecoveryRecentRow {
  created_at: number;
  wallet: string;
  accounts_closed: number;
  recovered_sol: number;
  status: string;
  x_username: string | null;
  /** Net SOL after network fees for this cleanup (SOL). */
  net_sol?: number;
  /** Estimated network fee paid for this cleanup (SOL). */
  network_fee_sol?: number;
}

export interface RecoveryTopUser {
  wallet: string;
  x_username: string | null;
  total_recovered: number;
  total_closed: number;
}

export interface RecoveryStatsResponse {
  generatedAt: number;
  lifetime: RecoveryLifetimeStats;
  windows: {
    day: RecoveryWindowStats;
    week: RecoveryWindowStats;
    month: RecoveryWindowStats;
  };
  recent: RecoveryRecentRow[];
  topUsers: RecoveryTopUser[];
}

export interface ExecuteResult {
  ok: boolean;
  error?: string;
  trade?: {
    side: "buy" | "sell";
    mint: string;
    solAmount: number;
    tokenAmount: number;
    price: number;
    pnl: number | null;
  };
  balance?: number;
}

// ---- Paper leverage trading ----
export type LeverageCloseReason =
  | "manual"
  | "take_profit"
  | "stop_loss"
  | "liquidated";

export interface LeveragePosition {
  id: number;
  wallet: string;
  token_mint: string;
  token_name: string | null;
  token_symbol: string | null;
  token_logo: string | null;
  direction: string;
  leverage: number;
  margin_sol: number;
  notional_sol: number;
  tokens: number;
  entry_price_sol: number;
  entry_market_cap: number | null;
  liq_price_sol: number;
  liq_market_cap: number | null;
  tp_trigger_mc: number | null;
  sl_trigger_mc: number | null;
  status: string;
  realized_pnl_sol: number | null;
  exit_price_sol: number | null;
  exit_market_cap: number | null;
  close_reason: string | null;
  entry_slippage_percent: number | null;
  entry_trade_impact_percent: number | null;
  opened_at: number;
  updated_at: number;
  closed_at: number | null;
  // Valuation fields (present on the positions endpoint).
  currentPriceSol: number | null;
  currentMarketCapUsd: number | null;
  priceMovePercent: number | null;
  unrealizedPnlSol: number | null;
  roiOnMargin: number | null;
  positionEquitySol: number | null;
  marketCapChangePercent: number | null;
}

export interface LeverageFill {
  positionId: number;
  tokenMint: string;
  tokenSymbol: string | null;
  reason: LeverageCloseReason;
  exitPriceSol: number | null;
  exitMarketCap: number | null;
  realizedPnlSol: number | null;
}

export interface LeverageTrade {
  id: number;
  position_id: number;
  wallet: string;
  token_mint: string;
  token_name: string | null;
  token_symbol: string | null;
  token_logo: string | null;
  action: "open" | "close" | "liquidated";
  direction: string;
  leverage: number;
  margin_sol: number;
  notional_sol: number;
  tokens: number;
  price_sol: number;
  market_cap: number | null;
  pnl_sol: number | null;
  executed_at: number;
}

export interface LeverageOpenResult {
  ok: boolean;
  error?: string;
  blocked?: boolean;
  position?: LeveragePosition;
  balance?: number;
}

export interface LeverageCloseResult {
  ok: boolean;
  error?: string;
  position?: LeveragePosition;
  realizedPnlSol?: number;
  reason?: LeverageCloseReason;
  balance?: number;
}

export interface LeverageStats {
  totalPositions: number;
  openPositions: number;
  liquidations: number;
  totalVolumeSol: number;
  totalMarginSol: number;
  realizedPnlSol: number;
  uniqueTraders: number;
  topUsers: {
    wallet: string;
    x_username: string | null;
    positions: number;
    volume_sol: number;
    realized_pnl_sol: number;
  }[];
}

// ---- API ----
export const api = {
  createAccount: (wallet: string) =>
    request<Account>("/account/create", {
      method: "POST",
      body: JSON.stringify({ wallet }),
    }),
  getAccount: (wallet: string) => request<Account>(`/account/${wallet}`),
  resetAccount: (wallet: string) =>
    request<{ ok: boolean; error?: string; account?: Account }>(
      "/account/reset",
      { method: "POST", body: JSON.stringify({ wallet }) },
    ),

  search: (q: string, wallet?: string) =>
    request<{ results: SearchResult[] }>(
      `/trade/search?q=${encodeURIComponent(q)}${wallet ? `&wallet=${wallet}` : ""}`,
    ),
  getToken: (mint: string, wallet?: string) =>
    request<TokenInfo>(
      `/trade/token/${mint}${wallet ? `?wallet=${wallet}` : ""}`,
    ),
  execute: (body: Record<string, unknown>) =>
    request<ExecuteResult>("/trade/execute", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  quote: (body: Record<string, unknown>) =>
    request<TradeQuote>("/trade/quote", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  positions: (wallet: string) =>
    request<{ positions: Position[]; solUsd: number; orderFills?: OrderFill[] }>(
      `/trade/positions/${wallet}`,
    ),
  history: (wallet: string) =>
    request<{ trades: Trade[] }>(`/trade/history/${wallet}`),

  orders: (wallet: string, mint?: string) =>
    request<{ orders: PaperOrder[] }>(
      `/trade/orders/${wallet}${mint ? `?mint=${encodeURIComponent(mint)}` : ""}`,
    ),
  createOrder: (body: {
    wallet: string;
    mint: string;
    symbol?: string | null;
    name?: string | null;
    orderType: OrderType;
    triggerType: TriggerType;
    triggerValue: number;
    amountPercent: number;
  }) =>
    request<{ ok: boolean; error?: string; order?: PaperOrder }>(
      "/trade/orders",
      { method: "POST", body: JSON.stringify(body) },
    ),
  cancelOrder: (wallet: string, id: number) =>
    request<{ ok: boolean; error?: string }>("/trade/orders/cancel", {
      method: "POST",
      body: JSON.stringify({ wallet, id }),
    }),
  createBuyLimit: (body: {
    wallet: string;
    mint: string;
    symbol?: string | null;
    name?: string | null;
    triggerMc: number;
    solAmount: number;
  }) =>
    request<{ ok: boolean; error?: string; order?: PaperOrder }>(
      "/trade/buy-limit",
      { method: "POST", body: JSON.stringify(body) },
    ),
  checkBuyLimits: (wallet: string) =>
    request<{ fills: OrderFill[] }>(`/trade/buy-limits/check/${wallet}`),
  watchlist: (wallet: string) =>
    request<{ watchlist: WatchItem[] }>(`/trade/watchlist/${wallet}`),
  watchlistAdd: (body: Record<string, unknown>) =>
    request<{ ok: boolean }>("/trade/watchlist/add", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  watchlistRemove: (wallet: string, mint: string) =>
    request<{ ok: boolean }>("/trade/watchlist/remove", {
      method: "POST",
      body: JSON.stringify({ wallet, mint }),
    }),

  liveTrades: (mint: string) =>
    request<{ trades: LiveTrade[]; connected: boolean }>(
      `/live/trades/${mint}`,
    ),
  newTokens: () =>
    request<{ tokens: NewToken[]; connected: boolean }>(`/live/new-tokens`),
  migrations: () =>
    request<{ migrations: NewToken[]; connected: boolean }>(`/live/migrations`),

  trending: () => request<MarketFeedResponse>(`/markets/trending`),
  gainers: () => request<MarketFeedResponse>(`/markets/gainers`),
  volume: () => request<MarketFeedResponse>(`/markets/volume`),
  // Manual force-refresh: bypasses the server feed caches, then the client
  // refetches the active feed. Returns the new market status.
  refreshMarkets: () =>
    request<{
      lastUpdated: number | null;
      tokenCount: number;
      pumpportalConnected: boolean;
      cacheAge: number | null;
    }>(`/markets/refresh`, { method: "POST" }),
  migrated: () =>
    request<{ tokens: MigratedToken[]; connected: boolean }>(
      `/markets/migrated`,
    ),
  marketStatus: () =>
    request<{
      lastUpdated: number | null;
      tokenCount: number;
      pumpportalConnected: boolean;
      cacheAge: number | null;
    }>(`/markets/status`),

  // Current SOL/USD rate — lets any page render USD even with no positions.
  solPrice: () => request<{ solUsd: number }>(`/markets/sol-price`),

  // Token Page V2 intelligence roll-up (sentiment / community / recent activity).
  tokenIntelligence: (mint: string) =>
    request<TokenIntelligence>(
      `/markets/${encodeURIComponent(mint)}/intelligence`,
    ),

  portfolio: (wallet: string) => request<Portfolio>(`/portfolio/${wallet}`),
  portfolioChart: (wallet: string) =>
    request<{ points: ChartPoint[]; solUsd: number }>(
      `/portfolio/chart/${wallet}`,
    ),
  portfolioStats: (wallet: string) =>
    request<PortfolioStats>(`/portfolio/stats/${wallet}`),

  leaderboard: (period: LeaderboardPeriod) =>
    request<LeaderboardResponse>(`/leaderboard?period=${period}`),

  // Top Callers reputation leaderboard (derived live from immutable callouts).
  leaderboardCallers: () =>
    request<{ entries: CallerEntry[] }>(`/leaderboard/callers`),

  // Most Followed leaderboard: users ranked by BlackPebble follower count.
  leaderboardMostFollowed: () =>
    request<{ entries: MostFollowedEntry[] }>(`/leaderboard/most-followed`),

  // Self-service "start a new season" for a depleted account.
  newSeason: (wallet: string) =>
    request<{ ok: boolean; error?: string; balance?: number; season?: number; account?: Account }>(
      "/account/new-season",
      { method: "POST", body: JSON.stringify({ wallet }) },
    ),

  // Public feature flags (read-only) consumed by the trading UI.
  featureFlags: () => request<{ flags: FeatureFlags }>("/feature-flags"),

  // Paper leverage trading (gated behind the `leverage` feature flag).
  leverage: {
    open: (body: {
      wallet: string;
      mint: string;
      symbol?: string | null;
      name?: string | null;
      logo?: string | null;
      marginSol: number;
      leverage: number;
      tpTriggerMc?: number | null;
      slTriggerMc?: number | null;
    }) =>
      request<LeverageOpenResult>("/leverage/open", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    close: (wallet: string, id: number) =>
      request<LeverageCloseResult>("/leverage/close", {
        method: "POST",
        body: JSON.stringify({ wallet, id }),
      }),
    positions: (wallet: string) =>
      request<{
        positions: LeveragePosition[];
        solUsd: number;
        fills?: LeverageFill[];
      }>(`/leverage/positions/${wallet}`),
    history: (wallet: string) =>
      request<{ trades: LeverageTrade[] }>(`/leverage/history/${wallet}`),
  },

  // SOL Recovery usage tracking (public — recovery works for guests too).
  recovery: {
    track: (body: RecoveryTrackBody) =>
      request<{ ok: boolean }>("/recovery/events", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    tokenMetadata: (mints: string[]) =>
      request<{ tokens: Record<string, RecoveryTokenMeta> }>(
        "/recovery/token-metadata",
        { method: "POST", body: JSON.stringify({ mints }) },
      ),
  },

  // Social: profiles + follow graph (X-authenticated only). `id` is a numeric
  // user id or an X handle.
  profiles: {
    get: (id: string | number) =>
      request<ProfileResponse>(`/profiles/${encodeURIComponent(String(id))}`),
    follow: (id: string | number) =>
      request<{ ok: boolean; error?: string }>(
        `/profiles/${encodeURIComponent(String(id))}/follow`,
        { method: "POST" },
      ),
    unfollow: (id: string | number) =>
      request<{ ok: boolean; error?: string }>(
        `/profiles/${encodeURIComponent(String(id))}/follow`,
        { method: "DELETE" },
      ),
    followers: (id: string | number) =>
      request<{ users: FollowUser[] }>(
        `/profiles/${encodeURIComponent(String(id))}/followers`,
      ),
    following: (id: string | number) =>
      request<{ users: FollowUser[] }>(
        `/profiles/${encodeURIComponent(String(id))}/following`,
      ),
    // Owner-only bio update (session-scoped). Pass "" to clear.
    setBio: (bio: string) =>
      request<{ ok: boolean; bio: string | null; error?: string }>(
        `/profiles/me/bio`,
        { method: "PUT", body: JSON.stringify({ bio }) },
      ),
    badges: (id: string | number) =>
      request<{ badges: BadgeEntry[]; earnedCount: number }>(
        `/profiles/${encodeURIComponent(String(id))}/badges`,
      ),
  },

  // Immutable call history. Reads are public; create/update are owner-only and
  // session-scoped. There is no edit/delete path by design.
  callouts: {
    list: (id: string | number) =>
      request<{ callouts: CalloutWithDetail[] }>(
        `/profiles/${encodeURIComponent(String(id))}/callouts`,
      ),
    create: (input: {
      tokenMint: string;
      thesis: string;
      conviction?: Conviction | null;
    }) =>
      request<{ callout: Callout }>(`/profiles/me/callouts`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    addUpdate: (calloutId: number, content: string) =>
      request<{ update: CalloutUpdate }>(
        `/callouts/${calloutId}/updates`,
        { method: "POST", body: JSON.stringify({ content }) },
      ),
    callerStats: (id: string | number) =>
      request<{ stats: CallerEntry | null }>(
        `/profiles/${encodeURIComponent(String(id))}/caller-stats`,
      ),
  },

  // Standalone token theses. Public reads; create/update/delete are owner-only
  // and session-scoped (X-auth). Unlike callouts, theses are editable and
  // deletable by their author and are never graded as calls.
  theses: {
    getByToken: (mint: string) =>
      request<{ theses: ThesisWithAuthor[] }>(
        `/markets/${encodeURIComponent(mint)}/theses`,
      ),
    getByUser: (id: string | number) =>
      request<{ theses: ThesisWithAuthor[] }>(
        `/profiles/${encodeURIComponent(String(id))}/theses`,
      ),
    get: (id: number) =>
      request<{ thesis: ThesisWithAuthor }>(`/theses/${id}`),
    create: (input: ThesisInput & { tokenMint: string }) =>
      request<{ thesis: Thesis }>(`/theses`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: number, input: ThesisInput) =>
      request<{ thesis: Thesis }>(`/theses/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/theses/${id}`, { method: "DELETE" }),
  },

  // Social: read-only activity feed.
  feed: {
    global: () => request<{ items: FeedActivityItem[] }>(`/feed/global`),
    following: () => request<{ items: FeedActivityItem[] }>(`/feed/following`),
  },

  // Trading Journal: private, owner-scoped CRUD. Every call is session-scoped
  // (X-auth required); there is no public read path.
  journal: {
    list: () => request<{ entries: JournalEntry[] }>(`/journal`),
    stats: () => request<{ stats: JournalStats }>(`/journal/stats`),
    create: (input: JournalInput) =>
      request<{ entry: JournalEntry }>(`/journal`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: number, input: JournalInput) =>
      request<{ entry: JournalEntry }>(`/journal/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/journal/${id}`, { method: "DELETE" }),
  },

  // Lightweight funnel / activity beacons (public, fire-and-forget).
  analytics: {
    track: (type: AnalyticsEventType, anonId?: string | null) =>
      request<{ ok: boolean }>("/analytics/event", {
        method: "POST",
        body: JSON.stringify({ type, anonId: anonId ?? null }),
      }),
  },

  admin: {
    me: () => request<AdminMe>("/admin/me"),
    stats: (window: AdminStatsWindow = "24h") =>
      request<AdminStatsResponse>(`/admin/stats?window=${window}`),
    health: () => request<AdminHealth>("/admin/health"),
    orders: (filters?: { token?: string; user?: string; status?: string }) => {
      const qs = new URLSearchParams();
      if (filters?.token) qs.set("token", filters.token);
      if (filters?.user) qs.set("user", filters.user);
      if (filters?.status) qs.set("status", filters.status);
      const q = qs.toString();
      return request<{ orders: PaperOrder[] }>(`/admin/orders${q ? `?${q}` : ""}`);
    },
    cancelOrder: (id: number) =>
      request<{ ok: boolean; error?: string }>("/admin/orders/cancel", {
        method: "POST",
        body: JSON.stringify({ id }),
      }),
    refreshMarket: () =>
      request<{ ok: boolean; tokenCount: number }>("/admin/market/refresh", {
        method: "POST",
      }),
    featureFlags: () => request<{ flags: FeatureFlags }>("/admin/feature-flags"),
    setFeatureFlag: (key: FeatureFlagKey, enabled: boolean) =>
      request<{ ok: boolean; error?: string; flags?: FeatureFlags }>(
        "/admin/feature-flags",
        { method: "POST", body: JSON.stringify({ key, enabled }) },
      ),
    resetUser: (wallet: string, options: ResetOptions) =>
      request<ResetResult>("/admin/reset-user", {
        method: "POST",
        body: JSON.stringify({ wallet, options }),
      }),
    resetAll: (options: ResetOptions) =>
      request<ResetResult>("/admin/reset-all", {
        method: "POST",
        body: JSON.stringify({ options }),
      }),
    recoveryStats: () =>
      request<RecoveryStatsResponse>("/admin/recovery-stats"),
    leverageStats: () => request<LeverageStats>("/admin/leverage-stats"),

    // ── Official Badges ──
    assignOfficialBadge: (x_handle: string, badge_type: OfficialBadgeType) =>
      request<{ ok: boolean; user_id: number; x_username: string }>(
        "/admin/official-badges/assign",
        { method: "POST", body: JSON.stringify({ x_handle, badge_type }) },
      ),
    removeOfficialBadge: (x_handle: string, badge_type: OfficialBadgeType) =>
      request<{ ok: boolean }>(
        "/admin/official-badges/remove",
        { method: "POST", body: JSON.stringify({ x_handle, badge_type }) },
      ),

    // ── Social Control Center ──
    social: {
      overview: () =>
        request<{ overview: AdminSocialOverview }>("/admin/social/overview"),
      listCallouts: (f?: AdminSocialFilters) =>
        request<{ callouts: AdminCallout[] }>(
          `/admin/social/callouts${socialQs(f)}`,
        ),
      listTheses: (f?: AdminSocialFilters) =>
        request<{ theses: AdminThesis[] }>(
          `/admin/social/theses${socialQs(f)}`,
        ),
      listJournal: (f?: AdminSocialFilters) =>
        request<{ journal: AdminJournalEntry[] }>(
          `/admin/social/journal${socialQs(f)}`,
        ),
      markCalloutTest: (id: number, value: boolean) =>
        postId("/admin/social/callouts/test", id, value),
      hideCallout: (id: number, value: boolean) =>
        postId("/admin/social/callouts/hide", id, value),
      deleteCallout: (id: number) =>
        request<{ ok: boolean }>("/admin/social/callouts/delete", {
          method: "POST",
          body: JSON.stringify({ id }),
        }),
      markThesisTest: (id: number, value: boolean) =>
        postId("/admin/social/theses/test", id, value),
      hideThesis: (id: number, value: boolean) =>
        postId("/admin/social/theses/hide", id, value),
      deleteThesis: (id: number) =>
        request<{ ok: boolean }>("/admin/social/theses/delete", {
          method: "POST",
          body: JSON.stringify({ id }),
        }),
      markJournalTest: (id: number, value: boolean) =>
        postId("/admin/social/journal/test", id, value),
      deleteJournal: (id: number) =>
        request<{ ok: boolean }>("/admin/social/journal/delete", {
          method: "POST",
          body: JSON.stringify({ id }),
        }),
      bulkTagTest: (
        type: "callouts" | "theses" | "journal",
        value: boolean,
      ) =>
        request<{ ok: boolean; tagged: number }>(
          "/admin/social/bulk-tag-test",
          { method: "POST", body: JSON.stringify({ type, value }) },
        ),
    },

    // ── Reset controls (typed-confirmation gated) ──
    resetTestData: (confirm: string) =>
      request<SocialResetResult>("/admin/reset-test-data", {
        method: "POST",
        body: JSON.stringify({ confirm }),
      }),
    resetSocial: (confirm: string) =>
      request<SocialResetResult>("/admin/reset-social", {
        method: "POST",
        body: JSON.stringify({ confirm }),
      }),
    resetJournal: (confirm: string) =>
      request<SocialResetResult>("/admin/reset-journal", {
        method: "POST",
        body: JSON.stringify({ confirm }),
      }),
    fullReset: (confirm: string) =>
      request<{ ok: boolean }>("/admin/full-reset", {
        method: "POST",
        body: JSON.stringify({ confirm }),
      }),
  },
};

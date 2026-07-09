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

/** Build the shared ?kinds=&limit= query string for feed endpoints. */
function feedQuery(opts?: { kinds?: string[]; limit?: number }): string {
  const p = new URLSearchParams();
  if (opts?.kinds && opts.kinds.length > 0) p.set("kinds", opts.kinds.join(","));
  if (opts?.limit) p.set("limit", String(opts.limit));
  const s = p.toString();
  return s ? `?${s}` : "";
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
  | "leverage"
  | "real_trading_analysis"
  | "community_campaigns"
  | "public_paper_trading";

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export interface AdminMe {
  admin: boolean;
  x_username: string | null;
}

// ---- Community Campaigns ----
export type CampaignState =
  | "live"
  | "funded"
  | "settled"
  | "failed"
  | "refunded"
  | "frozen";

export interface CampaignSummary {
  publicId: string;
  kind: string;
  typeKey: string;
  title: string;
  brief: string;
  tokenMint: string | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  linkUrl: string | null;
  goalLamports: number;
  goalUsd: number | null;
  goalLabel: string | null;
  deadlineAt: number;
  state: CampaignState;
  trustScore: number;
  escrowAddress: string;
  createdAt: number;
  fundedAt: number | null;
  settledAt: number | null;
  fulfillmentNote: string | null;
  fulfillmentUrl: string | null;
  creator: {
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  accounting: {
    depositedLamports: number;
    paidOutLamports: number;
    refundedLamports: number;
    feeLamports: number;
    remainingLamports: number;
    contributorCount: number;
    progress: number;
  };
}

export interface CampaignLedgerEntry {
  kind: string;
  lamports: number;
  txSignature: string | null;
  counterparty: string | null;
  note: string | null;
  createdAt: number;
}

export type CampaignAsset = "icon" | "banner" | "title" | "pitch";

export interface CampaignGoalOption {
  label: string;
  usd: number;
  description: string;
}

export interface CampaignTypeDef {
  key: string;
  /** Platform grouping (DEXScreener / DEXTools / Community). */
  group: string;
  label: string;
  description: string;
  /** Fixed goal tiers. Every campaign goal is set in stone. */
  goalOptions: CampaignGoalOption[];
  requiresToken: boolean;
  /** Assets needed for fulfillment (icon auto-fills from the token). */
  requiredAssets: CampaignAsset[];
}

export interface CampaignTokenValidation {
  mint: string;
  valid: boolean;
  symbol: string | null;
  name: string | null;
  logo: string | null;
  safety: "ok" | "warning" | "danger" | "unknown";
  risks: { name: string; level: string; description: string }[];
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
 * Windowed guest funnel - full journey, each stage a first-touch-per-device
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
  /** Pair creation time (ms epoch) - used to render token age. */
  pairCreatedAt?: number | null;
  volume6hUsd?: number | null;
  volume1hUsd?: number | null;
  /** Token identity links surfaced from DexScreener (display-only). */
  websiteUrl?: string | null;
  twitterUrl?: string | null;
  telegramUrl?: string | null;
  /** Banner / header image from DexScreener - background artwork for the token card. */
  bannerUrl?: string | null;
  /** DEX identifier from DexScreener (e.g. "raydium", "meteora", "orca") - display-only. */
  dexId?: string | null;
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

// ── Token chart candles (Chart Intelligence Phase 1) ─────────────────────────

export const CANDLE_RESOLUTIONS = [
  "15s",
  "30s",
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
] as const;

export type CandleResolution = (typeof CANDLE_RESOLUTIONS)[number];

/** One OHLCV candle, USD-priced; `t` is the candle open time (unix seconds). */
export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface CandlesResponse {
  candles: Candle[];
  /**
   * Pinned on-chain supply. Multiplying price candles by this yields market-cap
   * candles that stay consistent across timeframes. Null when unavailable.
   */
  supply: number | null;
  poolAddress: string;
  resolution: CandleResolution;
  /** True when the server served expired-cache candles after an upstream failure. */
  stale: boolean;
}

/**
 * Range-based candle response backing the TradingView Advanced Charts Datafeed
 * (`getBars`). Candles are oldest-first and MC-valued when `marketCap` is true.
 */
export interface CandleRangeResponse {
  candles: Candle[];
  supply: number | null;
  poolAddress: string;
  resolution: CandleResolution;
  /** True only when the server actually applied market-cap units. */
  marketCap: boolean;
  /** True when the requested range has no more history. */
  noData: boolean;
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
  /** USD market cap at execution (null on pre-upgrade rows). */
  market_cap_usd?: number | null;
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
  /** First (or only) blocking reason - kept for backward compat. */
  error?: string;
  /** All blocking reasons when more than one validation fails simultaneously. */
  errors?: string[];
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

/** Sparkline history windows. 24h is the default the UI renders today. */
export type SparklineWindow = "1h" | "6h" | "24h";

/** Which fallback level produced a series; null → only an artificial placeholder is possible. */
export type SparklineSource = "gecko" | "dexscreener" | "birdeye" | "snapshot";

/** A resolved sparkline: its points (null when no real data) and the source that produced it. */
export interface SparklineEntry {
  points: number[] | null;
  source: SparklineSource | null;
}

export interface SparklineResponse {
  window: SparklineWindow;
  /** mint → resolved entry: chronological close-price series (oldest first) + source. */
  sparklines: Record<string, SparklineEntry>;
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
  tweetCount: number | null;
}

export type TrustLabel = "New" | "Building" | "Established" | "Proven";
export interface TrustScore {
  score: number;
  label: TrustLabel;
}

/**
 * Owner-editable off-platform links shown as compact icon pills. Each is
 * nullable. Stored normalized server-side: `website` is a full http(s) URL;
 * `telegram` is a bare handle (build t.me/<handle>); `discord` is a bare invite
 * code (build discord.gg/<code>).
 */
export interface ProfileSocials {
  website: string | null;
  telegram: string | null;
  discord: string | null;
}

export type OfficialBadgeType =
  | "founder"
  | "bp_team"
  | "early_user"
  | "verified_trader"
  | "ambassador";

export type BadgeCategory =
  | "trading"
  | "profit"
  | "caller"
  | "thesis"
  | "wallet"
  | "community"
  | "profile"
  | "milestone"
  | "special";

export type BadgeRarity = "common" | "rare" | "epic" | "legendary";

export interface BadgeEntry {
  key: string;
  name: string;
  description: string;
  category: BadgeCategory;
  icon: string;
  earned: boolean;
  earnedAt: number | null;
  /** Collectible rarity tier. Optional; defaults to "common" when absent. */
  rarity?: BadgeRarity;
  /** Progress toward unlocking (current / target); null for boolean badges. */
  progress?: { current: number; target: number } | null;
  /** Hidden achievements stay out of the locked catalogue until earned. */
  hidden?: boolean;
  /** % of registered users who hold this badge - share-card rarity signal. */
  globalEarnedPercent?: number | null;
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
  /** X profile banner (header) image URL, or null when unavailable. */
  x_banner_url: string | null;
  xReputation: XReputation;
  /** Owner-editable off-platform links (website / telegram / discord). */
  socials: ProfileSocials;
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

/** One trade inside an aggregated buy/sell group's expandable breakdown. */
export interface FeedTradeBreakdownRow {
  id: string;
  ts: number;
  solAmount: number;
  marketCapUsd: number | null;
  pnlSol: number | null;
}

/** Structured payload for aggregated trade cards (item.kind === "agg"). */
export interface FeedAggMeta {
  tradeCount: number;
  windowStart: number;
  windowEnd: number;
  totalSol: number;
  avgMarketCapUsd: number | null;
  totalPnlSol: number | null;
  breakdown: FeedTradeBreakdownRow[];
}

/** The ten reaction keys, in display order (matches the backend vocabulary). */
export const FEED_REACTIONS = [
  { key: "rocket", emoji: "🚀", label: "Bullish" },
  { key: "fire", emoji: "🔥", label: "Hot Trade" },
  { key: "gem", emoji: "💎", label: "Conviction" },
  { key: "brain", emoji: "🧠", label: "Smart" },
  { key: "clap", emoji: "👏", label: "Congrats" },
  { key: "eyes", emoji: "👀", label: "Watching" },
  { key: "moneybag", emoji: "💰", label: "Nice Profit" },
  { key: "flag", emoji: "🚩", label: "Red Flag" },
  { key: "poop", emoji: "💩", label: "Bad Call" },
  { key: "target", emoji: "🎯", label: "Accurate Call" },
] as const;

export type FeedReactionKey = (typeof FEED_REACTIONS)[number]["key"];

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
  /** Achievement rarity (for premium feed tinting), null otherwise. */
  badgeRarity?: BadgeRarity | null;
  /** Recovery only: SOL recovered in this cleanup, null otherwise. */
  recoveredSol?: number | null;
  /** Recovery only: rent accounts closed in this cleanup, null otherwise. */
  accountsClosed?: number | null;
  /** Campaign only: public id for linking to the campaign page. */
  campaignPublicId?: string | null;
  /** Campaign only: funding goal in SOL. */
  campaignGoalSol?: number | null;
  /**
   * Structured payload: FeedAggMeta for aggregates, margin/notional/MC data
   * for leverage, tokensBurned/netSol for recovery, publisher metadata for
   * milestones.
   */
  meta?: Record<string, unknown> | null;
  /** Reaction counts by key (only keys with count > 0). */
  reactions?: Record<string, number>;
  /** The viewer's own reaction, when signed in. */
  viewerReaction?: string | null;
  timestamp: number;
  user: {
    user_id: number;
    x_username: string;
    x_display_name: string | null;
    x_avatar_url: string | null;
    graduation_tier?: string;
    official_badges?: OfficialBadgeType[];
    /** Shared Trust Score (decorative; from the cached reputation board). */
    trustScore?: number;
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

/**
 * A trader's row on the Reputation Network - the shared shape returned by
 * trader search, Top Rising Traders, and Highest Trust Score. Reuses the same
 * Trust Score / tier / caller primitives shown on the profile.
 */
export interface ReputationEntry {
  rank?: number;
  user_id: number;
  x_username: string | null;
  x_display_name: string | null;
  x_avatar_url: string | null;
  graduation_tier: string;
  officialBadges?: OfficialBadgeType[];
  trustScore: number;
  trustLabel: TrustLabel;
  followers: number;
  following: number;
  followers30d: number;
  callsMade: number;
  calls30d: number;
  winRate: number;
  roiPercent: number;
  realizedPnlSol: number;
  closedTrades: number;
  traderRank: number | null;
  callerScore: number;
  trustGrowth30d: number;
  risingScore: number;
}

export type TraderSort = "trust" | "followers" | "rising" | "calls";

export interface TraderSearchParams {
  q?: string;
  tier?: string;
  minTrust?: number;
  minFollowers?: number;
  sort?: TraderSort;
  limit?: number;
}

/** A single best/worst call within a performance window. */
export interface PeriodCall {
  token_symbol: string | null;
  token_mint: string;
  returnPercent: number;
}

/** Call performance over one time window (30d / 90d / all). */
export interface PeriodPerformance {
  totalCalls: number;
  gradedCalls: number;
  winRate: number;
  avgReturnPercent: number | null;
  bestCall: PeriodCall | null;
  worstCall: PeriodCall | null;
}

export interface PerformanceResponse {
  window30d: PeriodPerformance;
  window90d: PeriodPerformance;
  all: PeriodPerformance;
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
  /**
   * Client-claimed count of SPL tokens burned in this cleanup. This is only a
   * hint - the server independently proves burns on-chain before any value
   * counts toward public/lifetime totals (see recovery-verify.ts).
   */
  tokensBurned?: number;
}

/** Conservative token risk classes, worst → best. Mirrors the backend engine. */
export type TokenRiskClass =
  | "verified"
  | "normal"
  | "unknown"
  | "suspicious"
  | "spam"
  | "high_risk";

export type TokenRiskFactorKey =
  | "market"
  | "sell-route"
  | "mint-auth"
  | "freeze-auth"
  | "mutable-metadata"
  | "low-liq";

export interface TokenRiskFactor {
  key: TokenRiskFactorKey;
  /** "ok" = healthy, "warn" = caution, "bad" = serious red flag. */
  level: "ok" | "warn" | "bad";
  label: string;
}

/**
 * Position-independent token intelligence for the wallet-cleanup suite. Every
 * market/authority signal is nullable - a null means "not resolvable" and the
 * client treats it as UNKNOWN, never silently safe. Sellability, USD value and
 * realizable value are intentionally NOT here: they depend on the holder's
 * balance and are derived client-side from these signals × the real balance.
 */
export interface TokenIntel {
  mint: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  /** true/false = positive verdict from a successful lookup; null = market lookup failed (UNKNOWN, never "no market"). */
  hasMarket: boolean | null;
  hasSellRoute: boolean | null;
  hasMintAuthority: boolean | null;
  hasFreezeAuthority: boolean | null;
  mutableMetadata: boolean | null;
  verified: boolean;
  risk: TokenRiskClass;
  riskReasons: string[];
  riskFactors: TokenRiskFactor[];
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
  /** Distinct wallets with at least one successful cleanup. */
  recovery_users: number;
  failed_cleanups: number;
  largest_recovery: number;
  avg_recovered: number;
  /** Total estimated network fees paid across all successful cleanups (SOL). */
  total_network_fees: number;
  /** Total BlackPebble platform fees collected - always 0 today (SOL). */
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

/** One stored cleanup in a wallet's Recovery History (real persisted data only). */
export interface RecoveryHistoryEvent {
  created_at: number;
  accounts_closed: number;
  /** On-chain-proven count of SPL tokens burned in this cleanup. */
  tokens_burned: number;
  recovered_sol: number;
  network_fee_sol: number;
  /** BlackPebble platform fee - always 0 today (SOL). */
  bp_fee_sol: number;
  net_sol: number;
  status: string;
  signatures: string[];
  error_message: string | null;
}

/** Lifetime recovery metrics for a wallet, aggregated from its history rows. */
export interface RecoveryHistoryLifetime {
  sol_recovered: number;
  accounts_closed: number;
  /** On-chain-proven lifetime count of SPL tokens burned for this wallet. */
  tokens_burned: number;
  largest_recovery: number;
  avg_recovered: number;
  successful_cleanups: number;
  failed_cleanups: number;
  total_network_fees: number;
  /** Always 0 - fees are inert scaffolding. */
  total_bp_fees: number;
  total_net: number;
}

export interface RecoveryHistoryResponse {
  wallet: string;
  events: RecoveryHistoryEvent[];
  lifetime: RecoveryHistoryLifetime;
}

/** One stage of the (disabled) future recovery-fee pipeline. */
export interface RecoveryFeeStage {
  key: "recovery_fee" | "treasury" | "buybacks" | "burns";
  label: string;
  enabled: boolean;
  description: string;
}

/**
 * Disabled future-fee architecture status (Phase G). The fee system is inert:
 * `active` is always false today and users keep 100% of recovered SOL.
 */
export interface RecoveryFeeStatus {
  active: boolean;
  feeBps: number;
  feePercent: number;
  treasuryConfigured: boolean;
  buybacksEnabled: boolean;
  burnsEnabled: boolean;
  pipeline: RecoveryFeeStage[];
  summary: string;
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
  /** Disabled fee-architecture status. Optional for backward compatibility. */
  feeStatus?: RecoveryFeeStatus;
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

// ---- Paper perps (leverage) trading ----
export type LeverageCloseReason =
  | "manual"
  | "take_profit"
  | "stop_loss"
  | "liquidated"
  | "system_correction";

export type LeverageDirection = "long" | "short";

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
  // Active take-profit / stop-loss orders (present on the positions endpoint).
  exitOrders?: LeverageExitOrder[];
}

export interface LeverageFill {
  positionId: number;
  tokenMint: string;
  tokenSymbol: string | null;
  reason: LeverageCloseReason;
  exitPriceSol: number | null;
  exitMarketCap: number | null;
  realizedPnlSol: number | null;
  /** Trade row id - used to dedupe fill toasts across polls. */
  tradeId?: number;
  executedAt?: number;
}

export type LeverageExitKind = "take_profit" | "stop_loss";

export interface LeverageExitOrder {
  id: number;
  position_id: number;
  wallet: string;
  token_mint: string;
  kind: LeverageExitKind;
  trigger_mc: number;
  percent: number;
  status: string;
  created_at: number;
  updated_at: number;
  last_checked_at: number | null;
  filled_at: number | null;
  fill_market_cap: number | null;
  fill_price: number | null;
  fill_reason: string | null;
}

export interface LeverageExitOrderResult {
  ok: boolean;
  error?: string;
  order?: LeverageExitOrder;
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
  /** Why this slice closed; null on opens + legacy rows. */
  close_reason: LeverageCloseReason | null;
  /** Trigger level (USD MC) that fired this close; null for manual closes. */
  trigger_mc: number | null;
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

// ---- Real Trading Analysis (read-only on-chain intelligence) ----

export interface RealTradingMetrics {
  totalTrades: number;
  buyCount: number;
  sellCount: number;
  closedRoundTrips: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  totalPnlSol: number;
  winRate: number;
  lossRate: number;
  avgGainSol: number;
  avgLossSol: number;
  largestGainSol: number;
  largestLossSol: number;
  avgHoldDurationSec: number;
  medianHoldDurationSec: number;
  avgPositionSizeSol: number;
  tradingFrequencyPerWeek: number;
  uniqueTokensTraded: number;
  holdingConcentration: number;
  diversificationScore: number;
  avgMarketCapPurchasedUsd: number | null;
  walletAgeDays: number;
  firstTradeAt: number | null;
  lastTradeAt: number | null;
}

/** One registry signal (0–100) with a ~30-day delta for progression display. */
export interface RealTradingSignal {
  key: string;
  value: number;
  confidence: number;
  evidence: string[];
  previousValue: number | null;
  delta30d: number | null;
}

export interface RealTraderDna {
  vector: Record<string, number>;
  primaryArchetype: string;
  primaryLabel: string;
  primaryDescription: string;
  secondaryArchetype: string | null;
  secondaryLabel: string | null;
  confidence: number;
  evolvedTraits: string[];
  archetypeChanged: boolean;
  version: number;
}

export interface RealTradingPersonality {
  personality: string;
  description: string;
  traits: string[];
}

export interface RealTimelineEvent {
  id: number;
  eventType: string;
  title: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  createdAt: number;
}

export interface RealWalletHealth {
  score: number;
  deadPositions: number;
  dustPositions: number;
  concentrationRisk: number;
  diversification: number;
  portfolioCleanliness: number;
  notes: string[];
}

export interface RealTradingInsight {
  key: string;
  category: string;
  title: string;
  description: string;
  severity: "info" | "positive" | "warning";
  confidence: number;
}

export interface RealOpenPosition {
  tokenMint: string;
  symbol: string | null;
  name: string | null;
  logo: string | null;
  tokenAmount: number;
  costBasisSol: number;
  avgEntryPriceSol: number;
  firstAcquiredAt: number;
  currentPriceSol: number | null;
  currentValueSol: number | null;
  unrealizedPnlSol: number | null;
  marketCapUsd: number | null;
}

export interface RealPnlPoint {
  t: number;
  cumRealizedPnlSol: number;
}

export interface RealActivityBucket {
  month: string;
  buys: number;
  sells: number;
  volumeSol: number;
}

export interface RealHoldBucket {
  label: string;
  count: number;
}

export interface RealTokenPerformance {
  tokenMint: string;
  symbol: string | null;
  name: string | null;
  logo: string | null;
  realizedPnlSol: number;
  costBasisSol: number;
  roiPercent: number;
  roundTrips: number;
}

export interface RealPerformanceReport {
  pnlSeries: RealPnlPoint[];
  monthlyActivity: RealActivityBucket[];
  holdBuckets: RealHoldBucket[];
  topWinners: RealTokenPerformance[];
  topLosers: RealTokenPerformance[];
  totalRealizedPnlSol: number;
}

export interface RealAnalysisSummary {
  wallet: string;
  computedAt: number;
  syncStatus: string;
  lastSyncedAt: number | null;
  tradeCount: number;
  dataSources: string;
  metrics: RealTradingMetrics;
  signals: RealTradingSignal[];
  dna: RealTraderDna | null;
  personality: RealTradingPersonality;
  walletHealth: RealWalletHealth;
  openPositions: RealOpenPosition[];
  /** Open positions were reconciled against live on-chain balances. */
  holdingsVerified: boolean;
  /** Trade-history tokens no longer actually held (excluded from positions). */
  droppedGhostMints: number;
  insights: RealTradingInsight[];
  empty?: boolean;
  message?: string;
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
  history: (wallet: string, mint?: string) =>
    request<{ trades: Trade[] }>(
      `/trade/history/${wallet}${mint ? `?mint=${encodeURIComponent(mint)}` : ""}`,
    ),

  candles: (mint: string, resolution: CandleResolution) =>
    request<CandlesResponse>(
      `/markets/${encodeURIComponent(mint)}/candles?resolution=${resolution}`,
    ),

  candlesRange: (
    mint: string,
    resolution: CandleResolution,
    opts?: { before?: number; countBack?: number; marketCap?: boolean },
  ) => {
    const qs = new URLSearchParams({ resolution });
    if (opts?.before) qs.set("before", String(Math.floor(opts.before)));
    if (opts?.countBack) qs.set("countBack", String(Math.floor(opts.countBack)));
    if (opts?.marketCap) qs.set("marketCap", "1");
    return request<CandleRangeResponse>(
      `/markets/${encodeURIComponent(mint)}/candles/range?${qs.toString()}`,
    );
  },

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
  // Batched sparkline history for token cards. Sends every visible mint in one
  // request; returns a short chronological close-price series per mint (or null
  // when no usable history exists). Window defaults to 24h server-side.
  sparklines: (mints: string[], window: SparklineWindow = "24h") =>
    request<SparklineResponse>(
      `/markets/sparklines?mints=${encodeURIComponent(mints.join(","))}&window=${window}`,
    ),
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

  // Current SOL/USD rate - lets any page render USD even with no positions.
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

  // Top Rising Traders: ranked by recent momentum (last 30d), not lifetime.
  leaderboardRising: () =>
    request<{ entries: ReputationEntry[] }>(`/leaderboard/rising`),

  // Highest Trust Score: reputation board ranked by the shared Trust Score.
  leaderboardTrust: () =>
    request<{ entries: ReputationEntry[] }>(`/leaderboard/trust`),

  // Self-service "start a new season" for a depleted account.
  newSeason: (wallet: string) =>
    request<{ ok: boolean; error?: string; balance?: number; season?: number; account?: Account }>(
      "/account/new-season",
      { method: "POST", body: JSON.stringify({ wallet }) },
    ),

  // Public feature flags (read-only) consumed by the trading UI.
  featureFlags: () => request<{ flags: FeatureFlags }>("/feature-flags"),

  // Resolve a token's TradingView symbol page from its mint. Returns
  // { url: null } when TradingView doesn't list the token.
  resolveTradingView: (mint: string, symbol?: string | null) =>
    request<{ url: string | null }>(
      `/tradingview/resolve?mint=${encodeURIComponent(mint)}${
        symbol ? `&sym=${encodeURIComponent(symbol)}` : ""
      }`,
    ),

  // Real Trading Analysis - read-only on-chain intelligence (gated by feature flag).
  realAnalysis: {
    get: (wallet: string, refresh?: boolean) =>
      request<{ analysis: RealAnalysisSummary }>(
        `/real-analysis/${wallet}${refresh ? "?refresh=true" : ""}`,
      ),
    sync: (wallet: string) =>
      request<{ sync: { ok: boolean; newTrades: number; totalTrades: number; error?: string }; analysis: RealAnalysisSummary }>(
        `/real-analysis/${wallet}/sync`,
        { method: "POST" },
      ),
    insights: (wallet: string) =>
      request<{ insights: RealTradingInsight[] }>(
        `/real-analysis/${wallet}/insights`,
      ),
    timeline: (wallet: string, limit?: number) =>
      request<{ events: RealTimelineEvent[] }>(
        `/real-analysis/${wallet}/timeline${limit ? `?limit=${limit}` : ""}`,
      ),
    performance: (wallet: string) =>
      request<{ performance: RealPerformanceReport }>(
        `/real-analysis/${wallet}/performance`,
      ),
  },

  // Paper leverage trading (gated behind the `leverage` feature flag).
  leverage: {
    open: (body: {
      wallet: string;
      mint: string;
      symbol?: string | null;
      name?: string | null;
      logo?: string | null;
      marginSol: number;
      marginUsd?: number | null;
      leverage: number;
      direction?: LeverageDirection;
      tpTriggerMc?: number | null;
      slTriggerMc?: number | null;
    }) =>
      request<LeverageOpenResult>("/leverage/open", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    // `percent` (1..100) closes that share of the remaining notional; omitted
    // defaults to a full 100% close.
    close: (wallet: string, id: number, percent?: number) =>
      request<LeverageCloseResult>("/leverage/close", {
        method: "POST",
        body: JSON.stringify(
          percent != null ? { wallet, id, percent } : { wallet, id },
        ),
      }),
    positions: (wallet: string) =>
      request<{
        positions: LeveragePosition[];
        solUsd: number;
        fills?: LeverageFill[];
      }>(`/leverage/positions/${wallet}`),
    history: (wallet: string) =>
      request<{ trades: LeverageTrade[] }>(`/leverage/history/${wallet}`),
    closed: (wallet: string) =>
      request<{ positions: LeveragePosition[] }>(`/leverage/closed/${wallet}`),
    createOrder: (body: {
      wallet: string;
      positionId: number;
      kind: LeverageExitKind;
      triggerMc: number;
      percent: number;
    }) =>
      request<LeverageExitOrderResult>("/leverage/orders", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateOrder: (body: {
      wallet: string;
      orderId: number;
      triggerMc?: number;
      percent?: number;
    }) =>
      request<LeverageExitOrderResult>("/leverage/orders/update", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    cancelOrder: (wallet: string, orderId: number) =>
      request<LeverageExitOrderResult>("/leverage/orders/cancel", {
        method: "POST",
        body: JSON.stringify({ wallet, orderId }),
      }),
  },

  // SOL Recovery usage tracking (public - recovery works for guests too).
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
    tokenIntel: (mints: string[]) =>
      request<{ intel: Record<string, TokenIntel> }>("/recovery/token-intel", {
        method: "POST",
        body: JSON.stringify({ mints }),
      }),
    history: (wallet: string) =>
      request<RecoveryHistoryResponse>(
        `/recovery/history/${encodeURIComponent(wallet)}`,
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
    // Owner-only socials update (session-scoped). Pass "" for any field to clear
    // it. Server validates + normalizes each value.
    setSocials: (socials: {
      website?: string;
      telegram?: string;
      discord?: string;
    }) =>
      request<{
        ok: boolean;
        socials?: ProfileSocials;
        error?: string;
      }>(`/profiles/me/socials`, {
        method: "PUT",
        body: JSON.stringify(socials),
      }),
    badges: (id: string | number) =>
      request<{ badges: BadgeEntry[]; earnedCount: number }>(
        `/profiles/${encodeURIComponent(String(id))}/badges`,
      ),
    // Period-filtered call performance (30d / 90d / all-time), graded live.
    performance: (id: string | number) =>
      request<{ performance: PerformanceResponse }>(
        `/profiles/${encodeURIComponent(String(id))}/performance`,
      ),
    // Trader discovery: filter/sort the reputation board.
    search: (params: TraderSearchParams = {}) => {
      const qs = new URLSearchParams();
      if (params.q) qs.set("q", params.q);
      if (params.tier) qs.set("tier", params.tier);
      if (params.minTrust != null) qs.set("minTrust", String(params.minTrust));
      if (params.minFollowers != null)
        qs.set("minFollowers", String(params.minFollowers));
      if (params.sort) qs.set("sort", params.sort);
      if (params.limit != null) qs.set("limit", String(params.limit));
      const s = qs.toString();
      return request<{ entries: ReputationEntry[] }>(
        `/profiles/search${s ? `?${s}` : ""}`,
      );
    },
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

  // Community Campaigns - escrow-backed goal campaigns (feature-flag gated).
  campaigns: {
    list: (state?: string) =>
      request<{ campaigns: CampaignSummary[]; escrowReady: boolean }>(
        `/campaigns${state && state !== "all" ? `?state=${state}` : ""}`,
      ),
    config: () =>
      request<{
        types: CampaignTypeDef[];
        solPriceUsd: number;
        escrowReady: boolean;
      }>("/campaigns/config"),
    validateToken: (mint: string) =>
      request<{ token: CampaignTokenValidation }>(
        `/campaigns/validate-token/${mint}`,
      ),
    get: (publicId: string) =>
      request<{ campaign: CampaignSummary }>(`/campaigns/${publicId}`),
    ledger: (publicId: string) =>
      request<{ ledger: CampaignLedgerEntry[] }>(
        `/campaigns/${publicId}/ledger`,
      ),
    create: (body: {
      typeKey: string;
      title: string;
      brief: string;
      goalUsd?: number | null;
      goalSol?: number | null;
      durationHours: number;
      tokenMint?: string | null;
      imageUrl?: string | null;
      bannerUrl?: string | null;
      linkUrl?: string | null;
    }) =>
      request<{ campaign: CampaignSummary }>("/campaigns", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    refresh: (publicId: string) =>
      request<{ campaign: CampaignSummary }>(
        `/campaigns/${publicId}/refresh`,
        { method: "POST" },
      ),
    settle: (
      publicId: string,
      body: {
        payoutDestination: string;
        fulfillmentNote: string;
        fulfillmentUrl?: string | null;
      },
    ) =>
      request<{ ok: boolean; error?: string }>(
        `/campaigns/${publicId}/settle`,
        { method: "POST", body: JSON.stringify(body) },
      ),
  },

  // Social: activity feed + reactions.
  feed: {
    global: (opts?: { kinds?: string[]; limit?: number }) =>
      request<{ items: FeedActivityItem[] }>(
        `/feed/global${feedQuery(opts)}`,
      ),
    following: (opts?: { kinds?: string[]; limit?: number }) =>
      request<{ items: FeedActivityItem[] }>(
        `/feed/following${feedQuery(opts)}`,
      ),
    mine: (opts?: { kinds?: string[]; limit?: number }) =>
      request<{ items: FeedActivityItem[] }>(`/feed/mine${feedQuery(opts)}`),
    react: (eventId: string, reaction: FeedReactionKey | null) =>
      request<{ ok: boolean }>(`/feed/react`, {
        method: "POST",
        body: JSON.stringify({ eventId, reaction }),
      }),
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

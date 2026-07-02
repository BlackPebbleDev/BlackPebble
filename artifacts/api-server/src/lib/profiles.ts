import { dbAll, dbGet, dbRun } from "./database.js";
import {
  getAccount,
  getClosedTradeStats,
  getLeaderboard,
  getPortfolio,
  STARTING_BALANCE,
} from "./trading.js";
import { getLeveragePortfolio } from "./leverage.js";

/**
 * Social profiles + follow graph (Phase 1 groundwork).
 *
 * The social layer is X-authenticated ONLY: a user has a public profile and can
 * follow / be followed only if they have a `provider = 'x'` identity. Wallet-only
 * and guest users can still trade, but `resolveUser` returns null for them, so
 * they have no profile and the routes reject any follow action.
 *
 * The follow table is created idempotently at runtime (CREATE TABLE IF NOT
 * EXISTS), mirroring the analytics_events pattern — drizzle-kit push needs a TTY
 * that isn't available here. The schema is mirrored in lib/db for type-safety.
 */

export interface ResolvedUser {
  user_id: number;
  x_id: string;
  x_username: string;
  x_display_name: string | null;
  x_avatar_url: string | null;
}

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

/**
 * X reputation snapshot surfaced on a profile. Every field is nullable: it's
 * null when X didn't return the field, or when the user last authenticated
 * before we started capturing these. The UI renders placeholders for nulls.
 */
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

/**
 * Owner-editable off-platform links, surfaced as compact icon pills on the
 * profile. Each is nullable (unset). Stored normalized: `website` is a full
 * http(s) URL; `telegram` is a bare handle (UI builds t.me/<handle>); `discord`
 * is a bare invite code (UI builds discord.gg/<code>).
 */
export interface ProfileSocials {
  website: string | null;
  telegram: string | null;
  discord: string | null;
}

export interface ProfileResponse extends ResolvedUser {
  /** All-time leaderboard rank, or null when unranked (below min trades). */
  rank: number | null;
  graduationTier: string;
  followers: number;
  following: number;
  /** True when the requesting (X) user already follows this profile. */
  isFollowing: boolean;
  /** True when the requesting user is viewing their own profile. */
  isSelf: boolean;
  /** Owner-editable plain-text bio (≤250 chars), or null when unset. */
  bio: string | null;
  /** X profile banner (header) image URL, or null when unavailable. */
  x_banner_url: string | null;
  /** X account reputation (account age, verified, follower/following counts). */
  xReputation: XReputation;
  /** Owner-editable off-platform links (website / telegram / discord). */
  socials: ProfileSocials;
  stats: ProfileStats;
  /** Computed trust score (0–100). Augmented by the route handler. */
  trustScore?: TrustScore;
}

export interface FollowUser {
  user_id: number;
  x_username: string;
  x_display_name: string | null;
  x_avatar_url: string | null;
}

let ensured = false;
export async function ensureFollowsTable(): Promise<void> {
  if (ensured) return;
  await dbRun(
    `CREATE TABLE IF NOT EXISTS user_follows (
       id SERIAL PRIMARY KEY,
       follower_user_id INTEGER NOT NULL,
       following_user_id INTEGER NOT NULL,
       created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
     )`,
  );
  await dbRun(
    `CREATE UNIQUE INDEX IF NOT EXISTS user_follows_unique
       ON user_follows (follower_user_id, following_user_id)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_user_follows_following
       ON user_follows (following_user_id)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_user_follows_follower
       ON user_follows (follower_user_id)`,
  );
  ensured = true;
}

let profileSchemaEnsured = false;
/**
 * Idempotently add the profile bio + X-reputation columns to `users` and create
 * the append-only callout tables. Mirrors the runtime-DDL pattern used for
 * user_follows / analytics_events (drizzle-kit push needs an unavailable TTY).
 * Memoized, so the ALTER/CREATE statements run at most once per process.
 *
 * NOTE: the callouts tables are created here as architecture-only groundwork —
 * there is intentionally NO update/delete code path for `callouts` anywhere in
 * the codebase (immutability is a hard design rule); follow-ups append to
 * `callout_updates` only. See lib/db schema for the full rationale.
 */
export async function ensureProfileSchema(): Promise<void> {
  if (profileSchemaEnsured) return;
  await dbRun(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`);
  await dbRun(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS x_followers_count INTEGER`,
  );
  await dbRun(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS x_following_count INTEGER`,
  );
  await dbRun(`ALTER TABLE users ADD COLUMN IF NOT EXISTS x_verified BOOLEAN`);
  await dbRun(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS x_account_created_at BIGINT`,
  );
  await dbRun(`ALTER TABLE users ADD COLUMN IF NOT EXISTS website_url TEXT`);
  await dbRun(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_handle TEXT`,
  );
  await dbRun(`ALTER TABLE users ADD COLUMN IF NOT EXISTS x_banner_url TEXT`);
  await dbRun(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_invite TEXT`,
  );
  await dbRun(
    `CREATE TABLE IF NOT EXISTS callouts (
       id SERIAL PRIMARY KEY,
       user_id INTEGER NOT NULL REFERENCES users(id),
       token_mint TEXT NOT NULL,
       token_symbol TEXT,
       token_name TEXT,
       token_logo TEXT,
       call_price_sol DOUBLE PRECISION,
       call_price_usd DOUBLE PRECISION,
       call_market_cap DOUBLE PRECISION,
       liquidity_usd DOUBLE PRECISION,
       holder_count INTEGER,
       thesis TEXT,
       conviction TEXT,
       created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
     )`,
  );
  // Admin-only moderation columns (Social Control Center). is_test tags
  // admin/test content for filtering+purging; is_hidden_by_admin soft-hides a
  // call from every public read. Neither is writable by normal users, so the
  // caller-track-record immutability guarantee is preserved for them.
  await dbRun(
    `ALTER TABLE callouts ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await dbRun(
    `ALTER TABLE callouts ADD COLUMN IF NOT EXISTS is_hidden_by_admin BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_callouts_user ON callouts (user_id)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_callouts_mint ON callouts (token_mint)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_callouts_created ON callouts (created_at)`,
  );
  await dbRun(
    `CREATE TABLE IF NOT EXISTS callout_updates (
       id SERIAL PRIMARY KEY,
       callout_id INTEGER NOT NULL REFERENCES callouts(id),
       user_id INTEGER NOT NULL REFERENCES users(id),
       content TEXT NOT NULL,
       created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
     )`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_callout_updates_callout
       ON callout_updates (callout_id)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_callout_updates_user
       ON callout_updates (user_id)`,
  );
  profileSchemaEnsured = true;
}

/**
 * Resolve a profile target by either a numeric internal user id or an X handle
 * (case-insensitive, leading @ tolerated). Returns null for anything that is not
 * an X-authenticated user, which is what gates the whole social layer.
 */
export async function resolveUser(
  idOrHandle: string,
): Promise<ResolvedUser | null> {
  const raw = String(idOrHandle || "").trim();
  if (!raw) return null;
  const numeric = /^\d+$/.test(raw);
  const handle = raw.replace(/^@+/, "");
  const row = await dbGet<{
    user_id: number;
    x_id: string;
    x_username: string;
    x_display_name: string | null;
    x_avatar_url: string | null;
  }>(
    `SELECT u.id AS user_id,
            xi.provider_user_id AS x_id,
            xi.x_username AS x_username,
            u.display_name AS x_display_name,
            u.avatar_url AS x_avatar_url
       FROM user_identities xi
       JOIN users u ON u.id = xi.user_id
      WHERE xi.provider = 'x'
        AND ${numeric ? "u.id = $1" : "lower(xi.x_username) = lower($1)"}
      LIMIT 1`,
    [numeric ? Number(raw) : handle],
  );
  if (!row || !row.x_username) return null;
  return {
    user_id: row.user_id,
    x_id: row.x_id,
    x_username: row.x_username,
    x_display_name: row.x_display_name,
    x_avatar_url: row.x_avatar_url,
  };
}

const EMPTY_STATS: ProfileStats = {
  roiPercent: 0,
  totalPnlSol: 0,
  realizedPnlSol: 0,
  winRate: 0,
  totalExecutions: 0,
  closedTrades: 0,
  bestTrade: null,
  graduationTier: "Unranked",
};

/**
 * Trader stats for a profile, reusing the SAME primitives as the
 * /portfolio/stats endpoint so the numbers always match. This is strictly
 * read-only: it must NOT alter any trading/portfolio/leverage accounting.
 *
 * Because getPortfolio() (and ensureAccount) would lazily INSERT an accounts
 * row, we first fetch the account read-only. An X user who has never traded has
 * no account yet — we return zeroed defaults instead of materializing one, so a
 * profile GET never creates trading state. When the account already exists,
 * getPortfolio's INSERT ... ON CONFLICT DO NOTHING is a no-op.
 */
export async function getProfileStats(wallet: string): Promise<ProfileStats> {
  const account = await getAccount(wallet);
  if (!account) return { ...EMPTY_STATS };

  const [portfolio, cs, levPortfolio, levCounts] = await Promise.all([
    getPortfolio(wallet),
    getClosedTradeStats(wallet),
    getLeveragePortfolio(wallet),
    dbGet<{ total: number; closed: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(CASE WHEN action != 'open' THEN 1 END)::int AS closed
         FROM paper_leverage_trades WHERE wallet = $1`,
      [wallet],
    ),
  ]);

  const openLeverageEquitySol = levPortfolio.positions.reduce(
    (s, p) => s + Math.max(0, p.positionEquitySol ?? p.margin_sol),
    0,
  );
  const totalEquitySol = portfolio.equitySol + openLeverageEquitySol;
  const totalPnlSol = totalEquitySol - STARTING_BALANCE;
  const roiPercent = (totalPnlSol / STARTING_BALANCE) * 100;
  const totalExecutions = cs.executions + (levCounts?.total ?? 0);
  const closedTrades = cs.closedTrades + (levCounts?.closed ?? 0);

  return {
    roiPercent,
    totalPnlSol,
    realizedPnlSol: cs.realizedPnl,
    winRate: cs.winRate,
    totalExecutions,
    closedTrades,
    bestTrade: cs.bestTrade,
    graduationTier: account.graduation_tier,
  };
}

export async function getProfile(
  idOrHandle: string,
  viewerUserId?: number | null,
): Promise<ProfileResponse | null> {
  await Promise.all([ensureFollowsTable(), ensureProfileSchema()]);
  const u = await resolveUser(idOrHandle);
  if (!u) return null;

  const accountKey = `x:${u.x_id}`;
  const [stats, board, counts, follows, extras] = await Promise.all([
    getProfileStats(accountKey),
    getLeaderboard("all"),
    dbGet<{ followers: number; following: number }>(
      `SELECT
         (SELECT COUNT(*) FROM user_follows WHERE following_user_id = $1)::int AS followers,
         (SELECT COUNT(*) FROM user_follows WHERE follower_user_id = $1)::int AS following`,
      [u.user_id],
    ),
    viewerUserId
      ? dbGet<{ ok: number }>(
          `SELECT 1 AS ok FROM user_follows
            WHERE follower_user_id = $1 AND following_user_id = $2`,
          [viewerUserId, u.user_id],
        )
      : Promise.resolve(null),
    dbGet<{
      bio: string | null;
      x_followers_count: number | null;
      x_following_count: number | null;
      x_verified: boolean | null;
      x_account_created_at: number | null;
      website_url: string | null;
      telegram_handle: string | null;
      discord_invite: string | null;
      x_banner_url: string | null;
    }>(
      `SELECT bio, x_followers_count, x_following_count, x_verified,
              x_account_created_at, website_url, telegram_handle, discord_invite,
              x_banner_url
         FROM users WHERE id = $1`,
      [u.user_id],
    ),
  ]);

  const entry = board.find((e) => e.wallet === accountKey);

  return {
    ...u,
    rank: entry?.rank ?? null,
    graduationTier: stats.graduationTier,
    followers: counts?.followers ?? 0,
    following: counts?.following ?? 0,
    isFollowing: !!follows,
    isSelf: viewerUserId != null && viewerUserId === u.user_id,
    bio: extras?.bio ?? null,
    x_banner_url: extras?.x_banner_url ?? null,
    xReputation: {
      accountCreatedAt: extras?.x_account_created_at ?? null,
      verified: extras?.x_verified ?? null,
      followers: extras?.x_followers_count ?? null,
      following: extras?.x_following_count ?? null,
    },
    socials: {
      website: extras?.website_url ?? null,
      telegram: extras?.telegram_handle ?? null,
      discord: extras?.discord_invite ?? null,
    },
    stats,
  };
}

// ── Bio (owner-editable, plain text only) ───────────────────────────────────
export const BIO_MAX_LENGTH = 250;

export type BioValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Validate + normalize a user-supplied bio. Plain text only: we reject anything
 * that looks like HTML or markdown rather than silently stripping it, so the
 * stored value is always exactly what the user sees. Empty/whitespace clears it.
 */
export function validateBio(raw: unknown): BioValidation {
  if (typeof raw !== "string") {
    return { ok: false, error: "Bio must be text" };
  }
  // Normalize line endings and collapse 3+ blank lines; trim outer whitespace.
  const value = raw.replace(/\r\n?/g, "\n").trim();
  if (value.length > BIO_MAX_LENGTH) {
    return {
      ok: false,
      error: `Bio must be ${BIO_MAX_LENGTH} characters or fewer`,
    };
  }
  // Reject HTML: any angle-bracket tag-like construct or entities.
  if (/[<>]/.test(value)) {
    return { ok: false, error: "Bio cannot contain HTML" };
  }
  // Reject the most identifiable markdown so the bio stays plain text.
  const markdownPatterns: RegExp[] = [
    /\[[^\]]*\]\([^)]*\)/, // [text](url) links
    /!\[/, // ![ image
    /`/, // backticks / code
    /\*\*|__|~~/, // bold / strikethrough emphasis
    /^\s{0,3}#{1,6}\s/m, // # headers
    /^\s{0,3}>\s/m, // > blockquotes
  ];
  if (markdownPatterns.some((re) => re.test(value))) {
    return { ok: false, error: "Bio cannot contain markdown formatting" };
  }
  return { ok: true, value };
}

export type SetBioResult =
  | { ok: true; bio: string | null }
  | { ok: false; status: number; error: string };

/**
 * Set (or clear) the bio for the authenticated owner. `viewerUserId` is the
 * session's internal user id; there is no path to edit another user's bio.
 */
export async function setBio(
  viewerUserId: number,
  raw: unknown,
): Promise<SetBioResult> {
  const v = validateBio(raw);
  if (!v.ok) return { ok: false, status: 400, error: v.error };
  await ensureProfileSchema();
  const bio = v.value.length > 0 ? v.value : null;
  await dbRun(`UPDATE users SET bio = $1 WHERE id = $2`, [bio, viewerUserId]);
  return { ok: true, bio };
}

// ── Socials (owner-editable off-platform links) ─────────────────────────────
const SOCIAL_MAX_LENGTH = 200;

type SocialField =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/** Normalize a website to a full http(s) URL, or null when blank. */
function normalizeWebsite(raw: unknown): SocialField {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "Website must be text" };
  let v = raw.trim();
  if (!v) return { ok: true, value: null };
  if (/[<>\s]/.test(v)) {
    return { ok: false, error: "Website cannot contain spaces or HTML" };
  }
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    return { ok: false, error: "Enter a valid website URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Website must be an http or https link" };
  }
  if (!parsed.hostname.includes(".")) {
    return { ok: false, error: "Enter a valid website URL" };
  }
  const out = parsed.toString();
  if (out.length > SOCIAL_MAX_LENGTH) {
    return { ok: false, error: "Website link is too long" };
  }
  return { ok: true, value: out };
}

/** Normalize a Telegram input to a bare handle, or null when blank. */
function normalizeTelegram(raw: unknown): SocialField {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "string") {
    return { ok: false, error: "Telegram must be text" };
  }
  let v = raw.trim();
  if (!v) return { ok: true, value: null };
  v = v
    .replace(/^https?:\/\//i, "")
    .replace(/^(t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "");
  if (!/^[a-zA-Z0-9_]{4,32}$/.test(v)) {
    return {
      ok: false,
      error: "Enter a valid Telegram username (4–32 letters, numbers, _)",
    };
  }
  return { ok: true, value: v };
}

/** Normalize a Discord input to a bare invite code, or null when blank. */
function normalizeDiscord(raw: unknown): SocialField {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "string") {
    return { ok: false, error: "Discord must be text" };
  }
  let v = raw.trim();
  if (!v) return { ok: true, value: null };
  v = v
    .replace(/^https?:\/\//i, "")
    .replace(/^(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\//i, "");
  if (!/^[a-zA-Z0-9-]{2,32}$/.test(v)) {
    return {
      ok: false,
      error: "Enter a valid Discord invite (e.g. discord.gg/yourcode)",
    };
  }
  return { ok: true, value: v };
}

export type SetSocialsResult =
  | { ok: true; socials: ProfileSocials }
  | { ok: false; status: number; error: string };

/**
 * Set (or clear) the owner's off-platform links. Each field is validated +
 * normalized independently; an empty/blank value clears that link. Keyed to the
 * authenticated user's id — there is no path to edit another user's socials.
 */
export async function setSocials(
  viewerUserId: number,
  body: { website?: unknown; telegram?: unknown; discord?: unknown },
): Promise<SetSocialsResult> {
  const website = normalizeWebsite(body?.website);
  if (!website.ok) return { ok: false, status: 400, error: website.error };
  const telegram = normalizeTelegram(body?.telegram);
  if (!telegram.ok) return { ok: false, status: 400, error: telegram.error };
  const discord = normalizeDiscord(body?.discord);
  if (!discord.ok) return { ok: false, status: 400, error: discord.error };

  await ensureProfileSchema();
  await dbRun(
    `UPDATE users
        SET website_url = $1, telegram_handle = $2, discord_invite = $3
      WHERE id = $4`,
    [website.value, telegram.value, discord.value, viewerUserId],
  );
  return {
    ok: true,
    socials: {
      website: website.value,
      telegram: telegram.value,
      discord: discord.value,
    },
  };
}

export type FollowResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function followUser(
  viewerUserId: number,
  idOrHandle: string,
): Promise<FollowResult> {
  await ensureFollowsTable();
  const target = await resolveUser(idOrHandle);
  if (!target) return { ok: false, status: 404, error: "Profile not found" };
  if (target.user_id === viewerUserId) {
    return { ok: false, status: 400, error: "You cannot follow yourself" };
  }
  await dbRun(
    `INSERT INTO user_follows (follower_user_id, following_user_id)
     VALUES ($1, $2)
     ON CONFLICT (follower_user_id, following_user_id) DO NOTHING`,
    [viewerUserId, target.user_id],
  );
  return { ok: true };
}

export async function unfollowUser(
  viewerUserId: number,
  idOrHandle: string,
): Promise<FollowResult> {
  await ensureFollowsTable();
  const target = await resolveUser(idOrHandle);
  if (!target) return { ok: false, status: 404, error: "Profile not found" };
  await dbRun(
    `DELETE FROM user_follows
      WHERE follower_user_id = $1 AND following_user_id = $2`,
    [viewerUserId, target.user_id],
  );
  return { ok: true };
}

async function listRelations(
  idOrHandle: string,
  direction: "followers" | "following",
): Promise<FollowUser[] | null> {
  await ensureFollowsTable();
  const target = await resolveUser(idOrHandle);
  if (!target) return null;
  // followers: people who follow target → join on follower_user_id
  // following: people target follows → join on following_user_id
  const joinCol =
    direction === "followers" ? "f.follower_user_id" : "f.following_user_id";
  const whereCol =
    direction === "followers" ? "f.following_user_id" : "f.follower_user_id";
  const rows = await dbAll<{
    user_id: number;
    x_username: string;
    x_display_name: string | null;
    x_avatar_url: string | null;
  }>(
    `SELECT u.id AS user_id,
            xi.x_username AS x_username,
            u.display_name AS x_display_name,
            u.avatar_url AS x_avatar_url
       FROM user_follows f
       JOIN users u ON u.id = ${joinCol}
       JOIN user_identities xi ON xi.user_id = u.id AND xi.provider = 'x'
      WHERE ${whereCol} = $1
      ORDER BY f.created_at DESC
      LIMIT 200`,
    [target.user_id],
  );
  return rows.map((r) => ({
    user_id: r.user_id,
    x_username: r.x_username,
    x_display_name: r.x_display_name,
    x_avatar_url: r.x_avatar_url,
  }));
}

export function listFollowers(idOrHandle: string): Promise<FollowUser[] | null> {
  return listRelations(idOrHandle, "followers");
}

export function listFollowing(idOrHandle: string): Promise<FollowUser[] | null> {
  return listRelations(idOrHandle, "following");
}

export async function getFollowedUserIds(
  viewerUserId: number,
): Promise<number[]> {
  await ensureFollowsTable();
  const rows = await dbAll<{ following_user_id: number }>(
    `SELECT following_user_id FROM user_follows WHERE follower_user_id = $1`,
    [viewerUserId],
  );
  return rows.map((r) => r.following_user_id);
}

// ── Callouts (append-only data layer; no posting UI is wired up yet) ─────────
// These helpers are the ONLY way callout data is written, and by design they are
// append-only:
//   - createCallout INSERTs a new immutable call.
//   - addCalloutUpdate INSERTs a follow-up note onto an existing call.
// There is deliberately NO updateCallout / deleteCallout / hideCallout — once a
// call is on the record it is permanent. Do not add a mutation/delete path here:
// the immutability of a caller's track record is a core product guarantee.

export type Conviction = "low" | "medium" | "high";

export interface CalloutInput {
  userId: number;
  tokenMint: string;
  tokenSymbol?: string | null;
  tokenName?: string | null;
  tokenLogo?: string | null;
  callPriceSol?: number | null;
  callPriceUsd?: number | null;
  callMarketCap?: number | null;
  liquidityUsd?: number | null;
  holderCount?: number | null;
  thesis?: string | null;
  conviction?: Conviction | null;
}

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

export interface CalloutUpdate {
  id: number;
  callout_id: number;
  user_id: number;
  content: string;
  created_at: number;
}

/** Append a new, immutable callout. */
export async function createCallout(input: CalloutInput): Promise<Callout> {
  await ensureProfileSchema();
  const row = await dbGet<Callout>(
    `INSERT INTO callouts (
       user_id, token_mint, token_symbol, token_name, token_logo,
       call_price_sol, call_price_usd, call_market_cap, liquidity_usd,
       holder_count, thesis, conviction
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      input.userId,
      input.tokenMint,
      input.tokenSymbol ?? null,
      input.tokenName ?? null,
      input.tokenLogo ?? null,
      input.callPriceSol ?? null,
      input.callPriceUsd ?? null,
      input.callMarketCap ?? null,
      input.liquidityUsd ?? null,
      input.holderCount ?? null,
      input.thesis ?? null,
      input.conviction ?? null,
    ],
  );
  return row!;
}

/** Append a follow-up note to an existing callout (never mutates the callout). */
export async function addCalloutUpdate(
  calloutId: number,
  userId: number,
  content: string,
): Promise<CalloutUpdate> {
  await ensureProfileSchema();
  const row = await dbGet<CalloutUpdate>(
    `INSERT INTO callout_updates (callout_id, user_id, content)
     VALUES ($1, $2, $3) RETURNING *`,
    [calloutId, userId, content],
  );
  return row!;
}

/** Read a user's callouts, newest first (read-only). Admin-hidden calls are
 * excluded from this public read. */
export async function getUserCallouts(userId: number): Promise<Callout[]> {
  await ensureProfileSchema();
  return dbAll<Callout>(
    `SELECT * FROM callouts
      WHERE user_id = $1 AND is_hidden_by_admin = FALSE AND is_test = FALSE
      ORDER BY created_at DESC`,
    [userId],
  );
}

/** Read the append-only update trail for a callout, oldest first (read-only). */
export async function getCalloutUpdates(
  calloutId: number,
): Promise<CalloutUpdate[]> {
  await ensureProfileSchema();
  return dbAll<CalloutUpdate>(
    `SELECT * FROM callout_updates WHERE callout_id = $1 ORDER BY created_at ASC`,
    [calloutId],
  );
}

/** Fetch a single callout by id (read-only), or null. Used for ownership checks. */
export async function getCalloutById(id: number): Promise<Callout | null> {
  await ensureProfileSchema();
  const row = await dbGet<Callout>(`SELECT * FROM callouts WHERE id = $1`, [id]);
  return row ?? null;
}

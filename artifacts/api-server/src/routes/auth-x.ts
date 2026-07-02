import { Router } from "express";
import { createHash, randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { PublicKey } from "@solana/web3.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { dbGet, dbRun, withTx } from "../lib/database.js";
import { ensureProfileSchema } from "../lib/profiles.js";
import { mintBadgesAsync } from "../lib/badge-mint.js";
import { logger } from "../lib/logger.js";

const CLIENT_ID = process.env["X_CLIENT_ID"];
const CLIENT_SECRET = process.env["X_CLIENT_SECRET"];
const JWT_SECRET = process.env["JWT_SECRET"];
const COOKIE_NAME = "__x_session";
const FRONTEND_URL = process.env["FRONTEND_URL"] || "/";

const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const USER_URL =
  "https://api.x.com/2/users/me?user.fields=profile_image_url,profile_banner_url,public_metrics,created_at,verified";

// X OAuth 2.0 scopes needed for basic profile + username
const SCOPES = ["users.read", "tweet.read"].join(" ");

// Challenge lifetime for wallet ownership proof (5 minutes)
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_PREFIX = "Link wallet to BlackPebble: ";

const encoder = new TextEncoder();

interface XUser {
  id: string;
  username: string;
  name?: string;
  profile_image_url?: string;
  // Header/banner image (when X returns it — not all accounts have one set).
  profile_banner_url?: string;
  // Reputation fields (when X returns them). created_at is an ISO timestamp.
  created_at?: string;
  verified?: boolean;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
    listed_count?: number;
  };
}

interface XSessionPayload {
  sub: string; // user_id (internal users.id)
  x_id: string;
  x_username: string;
  x_display_name?: string;
  x_avatar_url?: string;
  wallet?: string;
}

function getSecretKey() {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return encoder.encode(JWT_SECRET);
}

async function signSession(payload: XSessionPayload): Promise<string> {
  const secret = getSecretKey();
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

async function verifySession(token: string): Promise<XSessionPayload | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret, { clockTolerance: 60 });
    return payload as unknown as XSessionPayload;
  } catch {
    return null;
  }
}

function base64URLEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  // 32 random bytes -> 43-char base64url string (RFC 7636 compliant)
  return base64URLEncode(randomBytes(32));
}

function generateCodeChallenge(verifier: string): string {
  // BASE64URL(SHA256(ASCII(code_verifier))) — encode the raw digest bytes directly
  const hash = createHash("sha256").update(verifier).digest();
  return base64URLEncode(hash);
}

function generateState(): string {
  return randomBytes(16).toString("hex");
}

function generateNonce(): string {
  return randomBytes(32).toString("base64url");
}

// ── Wallet signature helpers ───────────────────────────────────────────────
// Solana wallets sign UTF-8 bytes. The message is: "Link wallet to BlackPebble: <nonce>"
// The signature is a standard Ed25519 signature (64 bytes).

async function verifySolanaSignature(wallet: string, message: string, signature: string): Promise<boolean> {
  try {
    const nacl = await import("tweetnacl");
    const pubkey = new PublicKey(wallet).toBytes();
    const sig = Uint8Array.from(Buffer.from(signature, "base64"));
    const msg = Uint8Array.from(Buffer.from(message, "utf-8"));
    return nacl.default.sign.detached.verify(msg, sig, pubkey);
  } catch (err) {
    logger.warn({ err, wallet }, "Wallet signature verification failed");
    return false;
  }
}

async function createWalletChallenge(wallet: string): Promise<string> {
  const nonce = generateNonce();
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    `INSERT INTO wallet_challenges (wallet, nonce, created_at) VALUES ($1, $2, $3)`,
    [wallet, nonce, now],
  );
  return nonce;
}

async function getWalletChallenge(wallet: string): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - Math.floor(CHALLENGE_TTL_MS / 1000);
  const row = await dbGet<{ nonce: string }>(
    `SELECT nonce FROM wallet_challenges WHERE wallet = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 1`,
    [wallet, cutoff],
  );
  return row?.nonce ?? null;
}

async function consumeWalletChallenge(wallet: string): Promise<void> {
  await dbRun(
    `DELETE FROM wallet_challenges WHERE wallet = $1`,
    [wallet],
  );
}

// ── Fetch X user profile with the access token ──────────────────────────────
async function fetchXUser(accessToken: string): Promise<XUser | null> {
  try {
    const res = await fetch(USER_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "BlackPebble/1.0",
      },
    });
    if (!res.ok) {
      const text = await res.text();
      logger.warn({ status: res.status, body: text }, "X user fetch failed");
      return null;
    }
    const data = (await res.json()) as { data?: XUser };
    return data.data ?? null;
  } catch (err) {
    logger.warn({ err }, "X user fetch exception");
    return null;
  }
}

// ── Exchange authorization code for access token ──────────────────────────────
async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{ access_token: string } | null> {
  try {
    const params = new URLSearchParams();
    params.set("code", code);
    params.set("grant_type", "authorization_code");
    params.set("client_id", CLIENT_ID || "");
    params.set("redirect_uri", redirectUri);
    params.set("code_verifier", codeVerifier);

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.warn({ status: res.status, body: text }, "X token exchange failed");
      return null;
    }

    const data = (await res.json()) as { access_token?: string };
    return data.access_token ? (data as { access_token: string }) : null;
  } catch (err) {
    logger.warn({ err }, "X token exchange exception");
    return null;
  }
}

// ── Upsert user + identity from X profile ───────────────────────────────────
async function upsertXUser(user: XUser): Promise<XSessionPayload> {
  const now = Math.floor(Date.now() / 1000);

  // X reputation snapshot (null when X didn't return the field).
  const followers = user.public_metrics?.followers_count ?? null;
  const following = user.public_metrics?.following_count ?? null;
  const verified = typeof user.verified === "boolean" ? user.verified : null;
  const xCreatedAt = user.created_at
    ? Math.floor(new Date(user.created_at).getTime() / 1000)
    : null;
  const xCreatedAtValid =
    xCreatedAt != null && Number.isFinite(xCreatedAt) ? xCreatedAt : null;

  // Make sure the bio + x_* reputation columns exist before we write to them.
  await ensureProfileSchema();

  const payload = await withTx(async (c) => {
    // Check if this X user already exists
    const existing = await dbGet<{ user_id: number; wallet_address: string | null }>(
      `SELECT ui.user_id, ui.wallet_address
       FROM user_identities ui
       WHERE ui.provider = 'x' AND ui.provider_user_id = $1`,
      [user.id],
      c,
    );

    let userId: number;
    let wallet: string | null = null;

    if (existing) {
      userId = existing.user_id;
      wallet = existing.wallet_address;
      // Update user profile + refresh the X reputation snapshot. COALESCE keeps
      // any previously-captured value when X omits a field on a later login.
      await dbRun(
        `UPDATE users SET
           display_name = $1,
           avatar_url = $2,
           last_active = $3,
           x_followers_count = COALESCE($5, x_followers_count),
           x_following_count = COALESCE($6, x_following_count),
           x_verified = COALESCE($7, x_verified),
           x_account_created_at = COALESCE($8, x_account_created_at),
           x_banner_url = COALESCE($9, x_banner_url)
         WHERE id = $4`,
        [
          user.name || user.username,
          user.profile_image_url || null,
          now,
          userId,
          followers,
          following,
          verified,
          xCreatedAtValid,
          user.profile_banner_url || null,
        ],
        c,
      );
      // Update identity username
      await dbRun(
        `UPDATE user_identities SET x_username = $1 WHERE provider = 'x' AND provider_user_id = $2`,
        [user.username, user.id],
        c,
      );
    } else {
      // Create new user
      const newUser = await dbGet<{ id: number }>(
        `INSERT INTO users (
           display_name, avatar_url, created_at, last_active,
           x_followers_count, x_following_count, x_verified, x_account_created_at,
           x_banner_url
         )
         VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          user.name || user.username,
          user.profile_image_url || null,
          now,
          followers,
          following,
          verified,
          xCreatedAtValid,
          user.profile_banner_url || null,
        ],
        c,
      );
      userId = newUser!.id;

      // Create X identity
      await dbRun(
        `INSERT INTO user_identities (user_id, provider, provider_user_id, x_username)
         VALUES ($1, 'x', $2, $3)`,
        [userId, user.id, user.username],
        c,
      );
    }

    return {
      sub: String(userId),
      x_id: user.id,
      x_username: user.username,
      x_display_name: user.name || user.username,
      x_avatar_url: user.profile_image_url || undefined,
      wallet: wallet || undefined,
    };
  });

  // After commit, mint any newly-qualifying badges (e.g. profile_complete once
  // avatar + bio are present). Fire-and-forget so login is never blocked.
  mintBadgesAsync(Number(payload.sub));

  return payload;
}

// ── Build the redirect URI ──────────────────────────────────────────────────
function getRedirectUri(req: any): string {
  // In production, use the public domain. In dev, use the request origin.
  const host = req.headers["x-forwarded-host"] || req.headers.host || "blackpebble.fun";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}/api/auth/x/callback`;
}

// ── Router ──────────────────────────────────────────────────────────────────
const router = Router();

/**
 * GET /api/auth/x/login
 *
 * Initiates X OAuth 2.0 PKCE flow.
 * Sets state + code_verifier in signed cookies, redirects to X authorize URL.
 */
router.get(
  "/auth/x/login",
  asyncHandler(async (req, res) => {
    if (!CLIENT_ID || !CLIENT_SECRET || !JWT_SECRET) {
      logger.warn("X OAuth not configured: missing CLIENT_ID, CLIENT_SECRET, or JWT_SECRET");
      return res.status(500).json({ error: "X OAuth not configured" });
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();
    const redirectUri = getRedirectUri(req);

    // Store PKCE + state in a short-lived cookie (5 minutes)
    // NOTE: We do NOT store wallet here. Wallet linking must use the
    // nonce-challenge-signature POST /api/auth/x/link-wallet endpoint to
    // prevent an attacker from binding a victim wallet during the OAuth flow.
    const pkceCookie = JSON.stringify({ codeVerifier, state });
    res.cookie("__x_pkce", pkceCookie, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 5 * 60 * 1000,
      path: "/api/auth/x",
    });

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return res.redirect(url.toString());
  }),
);

/**
 * GET /api/auth/x/callback
 *
 * Exchanges the authorization code for an access token, fetches the X user
 * profile, upserts the user in the database, issues a JWT session cookie,
 * and redirects back to the frontend.
 */
router.get(
  "/auth/x/callback",
  asyncHandler(async (req, res) => {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const error = String(req.query.error || "");

    if (error) {
      logger.warn({ error }, "X OAuth error in callback");
      return res.redirect(`${FRONTEND_URL}?x_error=${encodeURIComponent(error)}`);
    }

    const pkceRaw = req.cookies["__x_pkce"];
    if (!pkceRaw) {
      return res.redirect(`${FRONTEND_URL}?x_error=missing_pkce_cookie`);
    }

    let pkce: { codeVerifier: string; state: string };
    try {
      pkce = JSON.parse(pkceRaw);
    } catch {
      return res.redirect(`${FRONTEND_URL}?x_error=invalid_pkce_cookie`);
    }

    if (pkce.state !== state) {
      return res.redirect(`${FRONTEND_URL}?x_error=state_mismatch`);
    }

    const redirectUri = getRedirectUri(req);
    const tokenResult = await exchangeCode(code, pkce.codeVerifier, redirectUri);
    if (!tokenResult) {
      return res.redirect(`${FRONTEND_URL}?x_error=token_exchange_failed`);
    }

    const xUser = await fetchXUser(tokenResult.access_token);
    if (!xUser) {
      return res.redirect(`${FRONTEND_URL}?x_error=profile_fetch_failed`);
    }

    const sessionPayload = await upsertXUser(xUser);

    const token = await signSession(sessionPayload);

    // Clear PKCE cookie, set session cookie
    res.clearCookie("__x_pkce", { path: "/api/auth/x" });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: "/",
    });

    return res.redirect(`${FRONTEND_URL}?x_login=success`);
  }),
);

/**
 * POST /api/auth/x/logout
 *
 * Clears the X session cookie.
 */
router.post(
  "/auth/x/logout",
  asyncHandler(async (_req, res) => {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    return res.json({ ok: true });
  }),
);

/**
 * GET /api/auth/x/me
 *
 * Returns the currently logged-in X user's profile.
 */
router.get(
  "/auth/x/me",
  asyncHandler(async (req, res) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.json({ loggedIn: false });

    const payload = await verifySession(token);
    if (!payload) {
      res.clearCookie(COOKIE_NAME, { path: "/" });
      return res.json({ loggedIn: false });
    }

    return res.json({
      loggedIn: true,
      user: {
        id: payload.sub,
        x_id: payload.x_id,
        x_username: payload.x_username,
        x_display_name: payload.x_display_name,
        x_avatar_url: payload.x_avatar_url,
        wallet: payload.wallet,
      },
    });
  }),
);

/**
 * GET /api/auth/x/link-wallet-challenge
 *
 * Returns a nonce for the wallet to sign. The wallet must sign the message:
 *   "Link wallet to BlackPebble: <nonce>"
 * The nonce is stored in the DB and valid for 5 minutes.
 */
router.get(
  "/auth/x/link-wallet-challenge",
  asyncHandler(async (req, res) => {
    const wallet = String(req.query.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    const nonce = await createWalletChallenge(wallet);
    return res.json({ nonce, message: `${CHALLENGE_PREFIX}${nonce}` });
  }),
);

/**
 * POST /api/auth/x/link-wallet
 *
 * Links the currently logged-in X user to a wallet address.
 * Requires a cryptographic proof of wallet ownership:
 *   Body: { wallet: string, signature: string }
 * The signature is a base64-encoded Ed25519 signature of the challenge message.
 */
router.post(
  "/auth/x/link-wallet",
  asyncHandler(async (req, res) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "Not logged in" });

    const payload = await verifySession(token);
    if (!payload) {
      res.clearCookie(COOKIE_NAME, { path: "/" });
      return res.status(401).json({ error: "Session expired" });
    }

    const wallet = String(req.body?.wallet || "").trim();
    const signature = String(req.body?.signature || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet is required" });
    if (!signature) return res.status(400).json({ error: "signature is required" });

    const nonce = await getWalletChallenge(wallet);
    if (!nonce) {
      return res.status(400).json({ error: "Challenge expired or missing. Request a new challenge first." });
    }
    const message = `${CHALLENGE_PREFIX}${nonce}`;
    const valid = await verifySolanaSignature(wallet, message, signature);
    if (!valid) {
      return res.status(403).json({ error: "Invalid signature. Wallet ownership could not be verified." });
    }
    await consumeWalletChallenge(wallet);

    const linkResult = await linkWalletToUser(payload.sub, wallet);
    if (!linkResult.ok) {
      return res.status(409).json({ error: linkResult.error });
    }

    // Refresh the JWT with the new wallet
    const newToken = await signSession({
      ...payload,
      wallet,
    });
    res.cookie(COOKIE_NAME, newToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    return res.json({ ok: true, wallet });
  }),
);

/**
 * Helper: link a wallet to a user. Returns an error if the wallet is already
 * linked to a different user. Cross-user reassignment is disallowed to prevent
 * account hijacking.
 */
async function linkWalletToUser(userId: string, wallet: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return await withTx(async (c) => {
    // Check if wallet already linked to a user
    const existing = await dbGet<{ user_id: number }>(
      `SELECT user_id FROM user_identities WHERE provider = 'wallet' AND provider_user_id = $1`,
      [wallet],
      c,
    );

    if (existing) {
      if (existing.user_id !== Number(userId)) {
        return { ok: false, error: "Wallet already linked to another user" };
      }
      // Already linked to this user, nothing to do
      return { ok: true };
    }

    await dbRun(
      `INSERT INTO user_identities (user_id, provider, provider_user_id, wallet_address)
       VALUES ($1, 'wallet', $2, $2)
       ON CONFLICT (provider, provider_user_id) DO NOTHING`,
      [Number(userId), wallet],
      c,
    );

    // Also update the X identity row to have wallet_address
    await dbRun(
      `UPDATE user_identities SET wallet_address = $1
       WHERE user_id = $2 AND provider = 'x'`,
      [wallet, Number(userId)],
      c,
    );

    return { ok: true };
  });
}

export default router;

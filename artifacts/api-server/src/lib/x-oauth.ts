import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { logger } from "./logger.js";
import { dbGet, dbRun } from "./database.js";

const TOKEN_URL = "https://api.x.com/2/oauth2/token";

let schemaEnsured = false;

/** AES-256-GCM encryption keyed from JWT_SECRET (never stored in DB plaintext). */
function encryptionKey(): Buffer {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET is required for token encryption");
  return createHash("sha256").update(secret).digest();
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

function decrypt(blob: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = blob.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

export interface StoredXOAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
}

export async function ensureXOAuthTokenSchema(): Promise<void> {
  if (schemaEnsured) return;
  await dbRun(
    `CREATE TABLE IF NOT EXISTS x_oauth_tokens (
       user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
       access_token_enc TEXT NOT NULL,
       refresh_token_enc TEXT,
       expires_at BIGINT,
       scopes TEXT,
       updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::bigint
     )`,
  );
  schemaEnsured = true;
}

export async function saveXOAuthTokens(
  userId: number,
  tokens: {
    accessToken: string;
    refreshToken?: string | null;
    expiresIn?: number | null;
    scope?: string | null;
  },
): Promise<void> {
  await ensureXOAuthTokenSchema();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt =
    tokens.expiresIn != null && tokens.expiresIn > 0
      ? now + tokens.expiresIn
      : null;
  await dbRun(
    `INSERT INTO x_oauth_tokens (user_id, access_token_enc, refresh_token_enc, expires_at, scopes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token_enc = EXCLUDED.access_token_enc,
       refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, x_oauth_tokens.refresh_token_enc),
       expires_at = EXCLUDED.expires_at,
       scopes = EXCLUDED.scopes,
       updated_at = EXCLUDED.updated_at`,
    [
      userId,
      encrypt(tokens.accessToken),
      tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      expiresAt,
      tokens.scope ?? null,
      now,
    ],
  );
}

export async function loadXOAuthTokens(
  userId: number,
): Promise<StoredXOAuthTokens | null> {
  await ensureXOAuthTokenSchema();
  const row = await dbGet<{
    access_token_enc: string;
    refresh_token_enc: string | null;
    expires_at: number | null;
  }>(
    `SELECT access_token_enc, refresh_token_enc, expires_at
       FROM x_oauth_tokens WHERE user_id = $1`,
    [userId],
  );
  if (!row) return null;
  const accessToken = decrypt(row.access_token_enc);
  if (!accessToken) return null;
  const refreshToken = row.refresh_token_enc
    ? decrypt(row.refresh_token_enc)
    : null;
  return {
    accessToken,
    refreshToken,
    expiresAt: row.expires_at,
  };
}

export async function refreshXOAuthTokens(
  userId: number,
): Promise<StoredXOAuthTokens | null> {
  const stored = await loadXOAuthTokens(userId);
  if (!stored?.refreshToken) return stored;

  const clientId = process.env["X_CLIENT_ID"];
  const clientSecret = process.env["X_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return stored;

  try {
    const params = new URLSearchParams();
    params.set("grant_type", "refresh_token");
    params.set("refresh_token", stored.refreshToken);
    params.set("client_id", clientId);

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.warn({ status: res.status, body: text, userId }, "X token refresh failed");
      return stored;
    }

    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    if (!data.access_token) return stored;

    await saveXOAuthTokens(userId, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? stored.refreshToken,
      expiresIn: data.expires_in ?? null,
      scope: data.scope ?? null,
    });

    return loadXOAuthTokens(userId);
  } catch (err) {
    logger.warn({ err, userId }, "X token refresh exception");
    return stored;
  }
}

/** Refresh the access token when it expires within `bufferSec` (default 5 min). */
export async function ensureFreshXAccessToken(
  userId: number,
  bufferSec = 300,
): Promise<string | null> {
  let stored = await loadXOAuthTokens(userId);
  if (!stored) return null;

  const now = Math.floor(Date.now() / 1000);
  const needsRefresh =
    stored.expiresAt != null && stored.expiresAt - bufferSec <= now;

  if (needsRefresh && stored.refreshToken) {
    stored = (await refreshXOAuthTokens(userId)) ?? stored;
  }

  return stored.accessToken;
}

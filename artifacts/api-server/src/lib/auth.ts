import { Request, Response, NextFunction } from "express";
import { jwtVerify } from "jose";
import { dbGet } from "./database.js";

const JWT_SECRET = process.env["JWT_SECRET"];
const COOKIE_NAME = "__x_session";
const encoder = new TextEncoder();

export interface XSessionPayload {
  sub: string;
  x_id: string;
  x_username: string;
  x_display_name?: string;
  x_avatar_url?: string;
  wallet?: string;
}

export async function verifySession(token: string): Promise<XSessionPayload | null> {
  try {
    if (!JWT_SECRET) return null;
    const secret = encoder.encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { clockTolerance: 60 });
    return payload as unknown as XSessionPayload;
  } catch {
    return null;
  }
}

export async function isLinkedWallet(wallet: string): Promise<boolean> {
  if (wallet.startsWith("x:")) return true;
  const identity = await dbGet<{ id: number }>(
    `SELECT id FROM user_identities WHERE provider = 'wallet' AND provider_user_id = $1`,
    [wallet],
  );
  return !!identity;
}

export async function ownsWallet(session: XSessionPayload, wallet: string): Promise<boolean> {
  if (wallet.startsWith("x:")) {
    return session.x_id === wallet.slice(2);
  }
  const identity = await dbGet<{ id: number }>(
    `SELECT id FROM user_identities WHERE provider = 'wallet' AND provider_user_id = $1 AND user_id = $2`,
    [wallet, Number(session.sub)],
  );
  return !!identity;
}

/**
 * Ownership guard for mutations. Linked accounts (X accounts and wallets that
 * have been linked to a user) require a valid session that owns the wallet.
 * Unlinked / guest wallets are left untouched so guest trading keeps working
 * exactly as before.
 */
/**
 * Admin gate. Approved admins are listed in the ADMIN_X_USER_IDS env var as a
 * comma-separated list of X user IDs (the `provider_user_id` from X OAuth,
 * carried on the session as `x_id`). When the var is unset/empty NO ONE is an
 * admin, so the dashboard fails closed.
 */
function adminIds(): Set<string> {
  const raw = process.env["ADMIN_X_USER_IDS"] ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isAdmin(session: XSessionPayload | null): boolean {
  if (!session?.x_id) return false;
  return adminIds().has(String(session.x_id));
}

/** Resolve the current X session from the request cookie, or null. */
export async function sessionFromRequest(
  req: Request,
): Promise<XSessionPayload | null> {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  return verifySession(token);
}

/**
 * Middleware that allows the request through only for an approved admin X
 * session. On success the resolved session is attached as `req.adminSession`.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  (async () => {
    const session = await sessionFromRequest(req);
    if (!isAdmin(session)) {
      res.status(session ? 403 : 401).json({ error: "Unauthorized" });
      return;
    }
    (req as Request & { adminSession?: XSessionPayload }).adminSession = session!;
    next();
  })().catch(next);
}

export function requireOwnership(walletExtractor: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction) => {
    (async () => {
      const wallet = walletExtractor(req);
      if (!wallet) {
        return res.status(400).json({ error: "wallet is required" });
      }

      const linked = await isLinkedWallet(wallet);
      if (!linked) return next(); // unlinked / guest wallet - unrestricted, as before

      const token = req.cookies[COOKIE_NAME];
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const session = await verifySession(token);
      if (!session) {
        res.clearCookie(COOKIE_NAME, { path: "/" });
        return res.status(401).json({ error: "Session expired" });
      }
      const owned = await ownsWallet(session, wallet);
      if (!owned) {
        return res.status(403).json({ error: "Forbidden" });
      }
      next();
    })().catch(next);
  };
}

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
export function requireOwnership(walletExtractor: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction) => {
    (async () => {
      const wallet = walletExtractor(req);
      if (!wallet) {
        return res.status(400).json({ error: "wallet is required" });
      }

      const linked = await isLinkedWallet(wallet);
      if (!linked) return next(); // unlinked / guest wallet — unrestricted, as before

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

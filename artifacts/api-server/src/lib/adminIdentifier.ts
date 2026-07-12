/**
 * Pure, dependency-free classification of an admin user identifier.
 *
 * Kept separate from adminUsers.ts (which imports the DB layer) so it can be
 * unit-tested in isolation and reused anywhere without side effects.
 */

export type IdentifierKind = "empty" | "x-key" | "wallet" | "numeric" | "handle";

export interface ClassifiedIdentifier {
  kind: IdentifierKind;
  /** Normalised value for the kind (prefix stripped, lowercased handle, ...). */
  value: string;
}

// Solana addresses are base58 (no 0 O I l), 32-44 chars. X ids and handles are
// far shorter, so this never collides with a numeric id or a <=15 char handle.
const BASE58_WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Classify a raw admin identifier WITHOUT touching the database. Pure + fully
 * unit-tested so the branch chosen for each identifier shape is verifiable.
 */
export function classifyIdentifier(raw: string): ClassifiedIdentifier {
  const q = String(raw ?? "").trim();
  if (!q) return { kind: "empty", value: "" };
  if (q.slice(0, 2).toLowerCase() === "x:") {
    return { kind: "x-key", value: q.slice(2).trim() };
  }
  if (BASE58_WALLET.test(q)) return { kind: "wallet", value: q };
  const handle = q.replace(/^@+/, "").trim();
  if (/^\d+$/.test(handle)) return { kind: "numeric", value: handle };
  return { kind: "handle", value: handle.toLowerCase() };
}

import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

/**
 * A token account that is SAFE to close. An account only ever reaches this list
 * when it holds a zero token balance, so closing it can never move an NFT or any
 * valuable token — there is nothing in it but the locked rent.
 *
 * This type is the single source of truth shared by the SOL Recovery dashboard
 * hook (`use-wallet-cleaner`) and the lightweight discovery scan used by the
 * Portfolio card and the post-connect notification.
 */
export interface CloseableAccount {
  /** The token account address (this is what gets closed). */
  pubkey: string;
  /** The token mint the (now empty) account was created for. */
  mint: string;
  /** Actual lamports locked as rent in this account — read from chain, never assumed. */
  lamports: number;
  /** Recoverable SOL derived from the real lamports value. */
  sol: number;
  /** Token decimals, used only for display. */
  decimals: number;
  /** Owning token program (classic SPL or Token-2022) — needed to build the close ix. */
  programId: string;
}

/**
 * Solana caps a transaction at 1232 bytes. Each close instruction is small, but
 * we batch conservatively so large wallets never produce an oversized tx.
 */
export const MAX_CLOSES_PER_TX = 10;

/**
 * Solana's base fee is 5000 lamports per signature. Each close transaction we
 * build has exactly one signer (the fee payer), so this is the per-transaction
 * fee estimate. Total estimated fee = number of transactions × this value.
 */
export const FEE_LAMPORTS_PER_TX = 5000;
export const FEE_SOL_PER_TX = FEE_LAMPORTS_PER_TX / LAMPORTS_PER_SOL;

/** Format a recoverable-rent SOL amount with enough precision for ~0.002 values. */
export function formatRentSol(sol: number | null | undefined): string {
  if (sol == null || !Number.isFinite(sol)) return "—";
  return sol.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
}

/**
 * Scan a wallet for token accounts that are SAFE to close (zero balance, no
 * foreign close authority, non-zero rent). Reads directly from chain across both
 * the classic SPL and Token-2022 programs. Throws only if *neither* program
 * query succeeds, so a partial RPC outage still returns usable results.
 *
 * Returns accounts sorted largest-recoverable-first.
 */
export async function scanCloseableAccounts(
  connection: Connection,
  owner: PublicKey,
): Promise<CloseableAccount[]> {
  const ownerStr = owner.toBase58();
  const programs = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
  const found: CloseableAccount[] = [];
  let anySuccess = false;

  for (const programId of programs) {
    try {
      const resp = await connection.getParsedTokenAccountsByOwner(owner, {
        programId,
      });
      anySuccess = true;

      for (const { pubkey, account } of resp.value) {
        const info = (account.data as { parsed?: { info?: any } })?.parsed?.info;
        // SAFETY: anything we cannot confidently parse is skipped entirely.
        if (!info) continue;

        const tokenAmount = info.tokenAmount;
        if (!tokenAmount || typeof tokenAmount.amount !== "string") continue;

        // SAFETY: only ever consider accounts with a zero balance. An empty
        // account holds no token or NFT, so closing it cannot move anything.
        if (tokenAmount.amount !== "0") continue;

        // SAFETY: if a custom close authority is set and it is not us, the
        // account is controlled by someone else — skip it.
        const closeAuth = info.closeAuthority as string | undefined;
        if (closeAuth && closeAuth !== ownerStr) continue;

        const lamports = account.lamports ?? 0;
        // Nothing to recover — skip rather than show a misleading 0.
        if (lamports <= 0) continue;

        found.push({
          pubkey: pubkey.toBase58(),
          mint: typeof info.mint === "string" ? info.mint : "unknown",
          lamports,
          sol: lamports / LAMPORTS_PER_SOL,
          decimals:
            typeof tokenAmount.decimals === "number" ? tokenAmount.decimals : 0,
          programId: programId.toBase58(),
        });
      }
    } catch (e) {
      // Some RPCs do not support Token-2022 lookups; keep classic results.
      console.warn(
        `SOL Recovery: scan failed for program ${programId.toBase58()}`,
        e,
      );
    }
  }

  if (!anySuccess) {
    throw new Error(
      "Could not read token accounts from the network. Please try again.",
    );
  }

  // Largest recoverable first so the most impactful accounts surface on top.
  found.sort((a, b) => b.lamports - a.lamports);
  return found;
}

/**
 * Wallet Health is a 0–100 cleanup score derived ONLY from real on-chain data:
 * the number of empty (closeable) token accounts found. A wallet with nothing to
 * clean scores 100; each cleanup opportunity lowers the score on a fixed curve.
 * This is a transparent heuristic over a real count — never a fabricated figure.
 */
export function computeWalletHealth(emptyAccountCount: number): number {
  if (emptyAccountCount <= 0) return 100;
  const score = 100 - emptyAccountCount * 3;
  return Math.max(55, Math.round(score));
}

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
 * Any SPL / Token-2022 token account a wallet holds — empty or not. This is the
 * superset the full wallet-cleanup scan works from. The zero-balance
 * `CloseableAccount` list is derived as a strict subset of these, so rent
 * recovery behaviour is unchanged.
 */
export interface WalletAsset {
  /** The token account address. */
  pubkey: string;
  /** The token mint this account holds. */
  mint: string;
  /** Owning token program (classic SPL or Token-2022). */
  programId: string;
  /** Token decimals (from chain). */
  decimals: number;
  /** Raw on-chain amount as a base-unit string (never lossy). */
  rawAmount: string;
  /** Human-readable balance (rawAmount ÷ 10^decimals). */
  uiAmount: number;
  /** Lamports locked as rent in this account (from chain). */
  lamports: number;
  /** Recoverable SOL derived from the real lamports value. */
  sol: number;
  /** True when the account holds a zero balance (closeable for rent). */
  isEmpty: boolean;
  /** True when a foreign close authority controls this account. */
  closeAuthorityForeign: boolean;
}

/**
 * Solana caps a transaction at 1232 bytes. Each close instruction is small, but
 * we batch conservatively so large wallets never produce an oversized tx.
 */
export const MAX_CLOSES_PER_TX = 10;

/**
 * Each burned token needs a burn instruction AND a close instruction (the now
 * empty account is closed to also reclaim its rent), so a burn tx carries twice
 * the instructions of a close tx. Batch more conservatively to stay well under
 * the 1232-byte transaction cap.
 */
export const MAX_BURNS_PER_TX = 5;

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

/**
 * Scan a wallet for EVERY token account it holds — empty or not — across the
 * classic SPL and Token-2022 programs. Reads balances, decimals and rent
 * directly from chain. Throws only if *neither* program query succeeds, so a
 * partial RPC outage still returns usable results.
 *
 * This is the superset the full wallet-cleanup suite works from. The
 * zero-balance closeable subset is derived from these (see
 * `closeableFromAssets`) so the existing rent-recovery flow is unchanged.
 *
 * Returns assets sorted largest-balance-first, then largest-rent-first.
 */
export async function scanAllAssets(
  connection: Connection,
  owner: PublicKey,
): Promise<WalletAsset[]> {
  const ownerStr = owner.toBase58();
  const programs = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
  const found: WalletAsset[] = [];
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

        const rawAmount = tokenAmount.amount;
        const decimals =
          typeof tokenAmount.decimals === "number" ? tokenAmount.decimals : 0;
        const uiAmount =
          typeof tokenAmount.uiAmount === "number"
            ? tokenAmount.uiAmount
            : Number(rawAmount) / 10 ** decimals;

        const closeAuth = info.closeAuthority as string | undefined;
        const closeAuthorityForeign = !!closeAuth && closeAuth !== ownerStr;
        const lamports = account.lamports ?? 0;

        found.push({
          pubkey: pubkey.toBase58(),
          mint: typeof info.mint === "string" ? info.mint : "unknown",
          programId: programId.toBase58(),
          decimals,
          rawAmount,
          uiAmount: Number.isFinite(uiAmount) ? uiAmount : 0,
          lamports,
          sol: lamports / LAMPORTS_PER_SOL,
          isEmpty: rawAmount === "0",
          closeAuthorityForeign,
        });
      }
    } catch (e) {
      console.warn(
        `Wallet cleanup: scan failed for program ${programId.toBase58()}`,
        e,
      );
    }
  }

  if (!anySuccess) {
    throw new Error(
      "Could not read token accounts from the network. Please try again.",
    );
  }

  found.sort(
    (a, b) => b.uiAmount - a.uiAmount || b.lamports - a.lamports,
  );
  return found;
}

/**
 * Derive the strict zero-balance "closeable" subset from a full asset scan,
 * matching `scanCloseableAccounts` exactly: empty balance, no foreign close
 * authority, non-zero rent. Keeping this as a pure projection guarantees the
 * rent-recovery flow can never regress relative to the full scan.
 */
export function closeableFromAssets(assets: WalletAsset[]): CloseableAccount[] {
  return assets
    .filter((a) => a.isEmpty && !a.closeAuthorityForeign && a.lamports > 0)
    .map((a) => ({
      pubkey: a.pubkey,
      mint: a.mint,
      lamports: a.lamports,
      sol: a.sol,
      decimals: a.decimals,
      programId: a.programId,
    }))
    .sort((a, b) => b.lamports - a.lamports);
}

/** Real counts that drive the upgraded wallet-health score. */
export interface HealthInputs {
  /** Empty token accounts with reclaimable rent. */
  emptyAccounts: number;
  /** Tokens classified spam / high-risk by the risk engine. */
  spamTokens: number;
  /** Held tokens whose signals could not be resolved (UNKNOWN). */
  unknownTokens: number;
  /** Held tokens whose displayed value is unlikely to be realizable. */
  fakeValueTokens: number;
}

/**
 * Upgraded 0–100 wallet-health score derived ONLY from real counts: empty
 * accounts, spam/high-risk tokens, unknown tokens and fake-value tokens. Each
 * category lowers the score on a fixed, transparent curve; a wallet with
 * nothing flagged scores 100. Never a fabricated figure.
 */
export function computeWalletHealthV2(inputs: HealthInputs): number {
  const penalty =
    inputs.emptyAccounts * 2 +
    inputs.spamTokens * 4 +
    inputs.unknownTokens * 2 +
    inputs.fakeValueTokens * 3;
  if (penalty <= 0) return 100;
  return Math.max(30, Math.round(100 - penalty));
}

/** Human-readable, count-driven explanation for a health score. */
export function explainWalletHealth(inputs: HealthInputs): string {
  const parts: string[] = [];
  const plur = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  if (inputs.emptyAccounts > 0)
    parts.push(plur(inputs.emptyAccounts, "empty account", "empty accounts"));
  if (inputs.spamTokens > 0)
    parts.push(plur(inputs.spamTokens, "spam token", "spam tokens"));
  if (inputs.unknownTokens > 0)
    parts.push(plur(inputs.unknownTokens, "unknown token", "unknown tokens"));
  if (inputs.fakeValueTokens > 0)
    parts.push(
      plur(inputs.fakeValueTokens, "fake-value token", "fake-value tokens"),
    );

  if (parts.length === 0) {
    return "Nothing flagged — your wallet is clean.";
  }
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${list} detected.`;
}

/** Map a 0–100 score to a human band label. */
export function healthBandLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Needs cleanup";
}

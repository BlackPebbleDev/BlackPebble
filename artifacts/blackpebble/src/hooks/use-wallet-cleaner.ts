import { useCallback, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createCloseAccountInstruction,
} from "@solana/spl-token";

/**
 * A token account that is SAFE to close. An account only ever reaches this list
 * when it holds a zero token balance, so closing it can never move an NFT or any
 * valuable token — there is nothing in it but the locked rent.
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

export type CleanerStatus =
  | "idle"
  | "scanning"
  | "scanned"
  | "closing"
  | "done"
  | "error";

/**
 * Solana caps a transaction at 1232 bytes. Each close instruction is small, but
 * we batch conservatively so large wallets never produce an oversized tx.
 */
const MAX_CLOSES_PER_TX = 10;

/**
 * Solana's base fee is 5000 lamports per signature. Each close transaction we
 * build has exactly one signer (the fee payer), so this is the per-transaction
 * fee estimate. Total estimated fee = number of transactions × this value.
 */
const FEE_LAMPORTS_PER_TX = 5000;
const FEE_SOL_PER_TX = FEE_LAMPORTS_PER_TX / LAMPORTS_PER_SOL;

/** Live progress while closing batches of accounts. */
export interface CloseProgress {
  /** 1-based index of the batch currently being signed. */
  batchIndex: number;
  /** Total number of batches/transactions for this run. */
  totalBatches: number;
  /** 1-based index of the first account in the current batch. */
  fromIndex: number;
  /** 1-based index of the last account in the current batch. */
  toIndex: number;
  /** Total number of accounts being closed in this run. */
  total: number;
}

/** Format a recoverable-rent SOL amount with enough precision for ~0.002 values. */
export function formatRentSol(sol: number | null | undefined): string {
  if (sol == null || !Number.isFinite(sol)) return "—";
  return sol.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
}

export interface UseWalletCleaner {
  status: CleanerStatus;
  error: string | null;
  accounts: CloseableAccount[];
  selected: Set<string>;
  selectedAccounts: CloseableAccount[];
  totalRecoverable: number;
  selectedRecoverable: number;
  estimatedFee: number;
  estimatedNet: number;
  closedCount: number;
  recoveredSol: number;
  txCount: number;
  progress: CloseProgress | null;
  scan: () => Promise<void>;
  closeSelected: () => Promise<boolean>;
  toggle: (pubkey: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  reset: () => void;
}

export function useWalletCleaner(): UseWalletCleaner {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [status, setStatus] = useState<CleanerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<CloseableAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [closedCount, setClosedCount] = useState(0);
  const [recoveredSol, setRecoveredSol] = useState(0);
  const [progress, setProgress] = useState<CloseProgress | null>(null);

  const scan = useCallback(async () => {
    if (!publicKey) return;
    setStatus("scanning");
    setError(null);
    setAccounts([]);
    setSelected(new Set());
    setClosedCount(0);
    setRecoveredSol(0);
    setProgress(null);

    try {
      const owner = publicKey.toBase58();
      const programs = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
      const found: CloseableAccount[] = [];
      let anySuccess = false;

      for (const programId of programs) {
        try {
          const resp = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { programId },
          );
          anySuccess = true;

          for (const { pubkey, account } of resp.value) {
            const info = (account.data as { parsed?: { info?: any } })?.parsed
              ?.info;
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
            if (closeAuth && closeAuth !== owner) continue;

            const lamports = account.lamports ?? 0;
            // Nothing to recover — skip rather than show a misleading 0.
            if (lamports <= 0) continue;

            found.push({
              pubkey: pubkey.toBase58(),
              mint: typeof info.mint === "string" ? info.mint : "unknown",
              lamports,
              sol: lamports / LAMPORTS_PER_SOL,
              decimals:
                typeof tokenAmount.decimals === "number"
                  ? tokenAmount.decimals
                  : 0,
              programId: programId.toBase58(),
            });
          }
        } catch (e) {
          // Some RPCs do not support Token-2022 lookups; keep classic results.
          console.warn(
            `Wallet cleaner: scan failed for program ${programId.toBase58()}`,
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
      setAccounts(found);
      setStatus("scanned");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed.");
      setStatus("error");
    }
  }, [connection, publicKey]);

  const closeSelected = useCallback(async (): Promise<boolean> => {
    if (!publicKey) return false;
    const toClose = accounts.filter((a) => selected.has(a.pubkey));
    if (toClose.length === 0) return false;

    setStatus("closing");
    setError(null);

    const totalBatches = Math.ceil(toClose.length / MAX_CLOSES_PER_TX);
    let closed = 0;
    let recovered = 0;
    const closedPubkeys = new Set<string>();

    try {
      for (let i = 0; i < toClose.length; i += MAX_CLOSES_PER_TX) {
        const batch = toClose.slice(i, i + MAX_CLOSES_PER_TX);
        setProgress({
          batchIndex: Math.floor(i / MAX_CLOSES_PER_TX) + 1,
          totalBatches,
          fromIndex: i + 1,
          toIndex: i + batch.length,
          total: toClose.length,
        });
        const tx = new Transaction();

        for (const acc of batch) {
          tx.add(
            createCloseAccountInstruction(
              new PublicKey(acc.pubkey), // account being closed
              publicKey, // rent destination — always the connected wallet
              publicKey, // authority — the connected wallet
              [],
              new PublicKey(acc.programId),
            ),
          );
        }

        // TODO: Optional platform fee — a future version may append a
        // SystemProgram.transfer of a small flat fee here. Not in MVP.

        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;

        const signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );

        closed += batch.length;
        recovered += batch.reduce((sum, a) => sum + a.sol, 0);
        for (const a of batch) closedPubkeys.add(a.pubkey);
      }

      setClosedCount(closed);
      setRecoveredSol(recovered);
      setAccounts((prev) => prev.filter((a) => !closedPubkeys.has(a.pubkey)));
      setSelected(new Set());
      setProgress(null);
      setStatus("done");
      return true;
    } catch (e) {
      // Drop any accounts that DID close so a retry only targets what remains.
      if (closedPubkeys.size > 0) {
        setAccounts((prev) => prev.filter((a) => !closedPubkeys.has(a.pubkey)));
        setSelected((prev) => {
          const next = new Set(prev);
          for (const pk of closedPubkeys) next.delete(pk);
          return next;
        });
        setClosedCount(closed);
        setRecoveredSol(recovered);
      }
      const prefix =
        closed > 0
          ? `Closed ${closed} account${closed === 1 ? "" : "s"} before stopping. `
          : "";
      setError(
        prefix +
          (e instanceof Error
            ? e.message
            : "Failed to close the selected accounts."),
      );
      setStatus("error");
      return false;
    }
  }, [accounts, selected, publicKey, connection, sendTransaction]);

  const toggle = useCallback((pubkey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pubkey)) next.delete(pubkey);
      else next.add(pubkey);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(accounts.map((a) => a.pubkey)));
  }, [accounts]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setAccounts([]);
    setSelected(new Set());
    setClosedCount(0);
    setRecoveredSol(0);
    setProgress(null);
  }, []);

  const selectedAccounts = useMemo(
    () => accounts.filter((a) => selected.has(a.pubkey)),
    [accounts, selected],
  );

  const totalRecoverable = useMemo(
    () => accounts.reduce((sum, a) => sum + a.sol, 0),
    [accounts],
  );

  const selectedRecoverable = useMemo(
    () => selectedAccounts.reduce((sum, a) => sum + a.sol, 0),
    [selectedAccounts],
  );

  const txCount = Math.ceil(selectedAccounts.length / MAX_CLOSES_PER_TX);

  // Fee is one base signature per transaction. Net is what actually lands in
  // the wallet after that fee, floored at 0 so it never reads negative.
  const estimatedFee = txCount * FEE_SOL_PER_TX;
  const estimatedNet = Math.max(0, selectedRecoverable - estimatedFee);

  return {
    status,
    error,
    accounts,
    selected,
    selectedAccounts,
    totalRecoverable,
    selectedRecoverable,
    estimatedFee,
    estimatedNet,
    closedCount,
    recoveredSol,
    txCount,
    progress,
    scan,
    closeSelected,
    toggle,
    selectAll,
    clearSelection,
    reset,
  };
}

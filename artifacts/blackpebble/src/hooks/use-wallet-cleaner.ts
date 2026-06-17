import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { createCloseAccountInstruction } from "@solana/spl-token";
import {
  scanCloseableAccounts,
  computeWalletHealth,
  formatRentSol,
  MAX_CLOSES_PER_TX,
  FEE_SOL_PER_TX,
  type CloseableAccount,
} from "@/lib/recovery-scan";

import { api, type RecoveryTrackBody } from "@/lib/api";

export { formatRentSol } from "@/lib/recovery-scan";
export type { CloseableAccount } from "@/lib/recovery-scan";

/**
 * Best-effort usage tracking for SOL Recovery analytics. Fire-and-forget: it
 * runs only AFTER the on-chain recovery logic and swallows every error, so it
 * can never affect scanning or account closing.
 */
function trackRecovery(body: RecoveryTrackBody): void {
  void api.recovery.track(body).catch(() => {});
}

export type CleanerStatus =
  | "idle"
  | "scanning"
  | "scanned"
  | "closing"
  | "done"
  | "error";

/**
 * Lifecycle of the live on-chain wallet balance fetch. "error" is surfaced as
 * "Unavailable" in the UI and never blocks scanning or closing.
 */
export type BalanceStatus = "idle" | "loading" | "ready" | "error";

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

export interface UseWalletCleaner {
  status: CleanerStatus;
  error: string | null;
  owner: string | null;
  walletBalance: number | null;
  balanceStatus: BalanceStatus;
  accounts: CloseableAccount[];
  selected: Set<string>;
  selectedAccounts: CloseableAccount[];
  totalRecoverable: number;
  selectedRecoverable: number;
  estimatedFee: number;
  estimatedNet: number;
  totalTxCount: number;
  totalFee: number;
  totalNet: number;
  walletHealth: number;
  closedCount: number;
  recoveredSol: number;
  /** Confirmed close-tx signatures from the most recent cleanup run. */
  signatures: string[];
  /** Network fee actually paid across the confirmed cleanup txs (SOL). */
  recoveredFee: number;
  /** Net SOL that landed in the wallet after the network fee (SOL). */
  recoveredNet: number;
  txCount: number;
  progress: CloseProgress | null;
  scan: () => Promise<void>;
  closeSelected: () => Promise<boolean>;
  refreshBalance: () => Promise<void>;
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
  const [signatures, setSignatures] = useState<string[]>([]);
  const [progress, setProgress] = useState<CloseProgress | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [balanceStatus, setBalanceStatus] = useState<BalanceStatus>("idle");
  // Monotonic id so only the most recent balance request can write state —
  // a slow earlier fetch can never overwrite a fresher one (no stale flicker).
  const balanceReqId = useRef(0);

  const owner = publicKey ? publicKey.toBase58() : null;

  /**
   * Read the connected wallet's live SOL balance from chain. Never throws —
   * a failure sets "error" (shown as "Unavailable") and leaves the rest of the
   * flow fully usable.
   */
  const refreshBalance = useCallback(async () => {
    if (!publicKey) {
      balanceReqId.current += 1;
      setWalletBalance(null);
      setBalanceStatus("idle");
      return;
    }
    const reqId = ++balanceReqId.current;
    setBalanceStatus("loading");
    try {
      const lamports = await connection.getBalance(publicKey);
      if (reqId !== balanceReqId.current) return;
      setWalletBalance(lamports / LAMPORTS_PER_SOL);
      setBalanceStatus("ready");
    } catch (e) {
      if (reqId !== balanceReqId.current) return;
      console.warn("Wallet cleaner: balance fetch failed", e);
      setWalletBalance(null);
      setBalanceStatus("error");
    }
  }, [connection, publicKey]);

  // Fetch the balance as soon as a wallet connects (and clear it on disconnect).
  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const scan = useCallback(async () => {
    if (!publicKey) return;
    setStatus("scanning");
    setError(null);
    setAccounts([]);
    setSelected(new Set());
    setClosedCount(0);
    setRecoveredSol(0);
    setSignatures([]);
    setProgress(null);

    try {
      const found = await scanCloseableAccounts(connection, publicKey);
      setAccounts(found);
      setStatus("scanned");
      trackRecovery({
        eventType: "scan",
        wallet: publicKey.toBase58(),
        accountsFound: found.length,
        recoverableSol: found.reduce((sum, a) => sum + a.sol, 0),
      });
      // A scan does not change the balance, but refresh so the status card is
      // always showing a current figure alongside the fresh results.
      void refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed.");
      setStatus("error");
    }
  }, [connection, publicKey, refreshBalance]);

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
    // Confirmed signatures collected as each batch lands — surfaced on the
    // success screen and persisted (public, already on-chain) for analytics.
    const sigs: string[] = [];

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

        sigs.push(signature);
        closed += batch.length;
        recovered += batch.reduce((sum, a) => sum + a.sol, 0);
        for (const a of batch) closedPubkeys.add(a.pubkey);
      }

      // Network fee = one base signature per confirmed tx. Net is what actually
      // landed after that fee, floored at 0 so it never reads negative.
      const networkFee = sigs.length * FEE_SOL_PER_TX;
      const net = Math.max(0, recovered - networkFee);

      setClosedCount(closed);
      setRecoveredSol(recovered);
      setSignatures(sigs);
      setAccounts((prev) => prev.filter((a) => !closedPubkeys.has(a.pubkey)));
      setSelected(new Set());
      setProgress(null);
      setStatus("done");
      trackRecovery({
        eventType: "cleanup",
        wallet: publicKey.toBase58(),
        status: "success",
        accountsFound: toClose.length,
        accountsClosed: closed,
        recoverableSol: toClose.reduce((sum, a) => sum + a.sol, 0),
        recoveredSol: recovered,
        txSignatures: sigs,
        networkFeeSol: networkFee,
        netSol: net,
      });
      // Recovered rent has landed in the wallet — pull the new balance.
      void refreshBalance();
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
        setSignatures(sigs);
      }
      const prefix =
        closed > 0
          ? `Closed ${closed} account${closed === 1 ? "" : "s"} before stopping. `
          : "";
      const message =
        e instanceof Error
          ? e.message
          : "Failed to close the selected accounts.";
      setError(prefix + message);
      setStatus("error");
      trackRecovery({
        eventType: "cleanup",
        wallet: publicKey.toBase58(),
        status: "failed",
        accountsFound: toClose.length,
        accountsClosed: closed,
        recoverableSol: toClose.reduce((sum, a) => sum + a.sol, 0),
        recoveredSol: recovered,
        txSignatures: sigs,
        networkFeeSol: sigs.length * FEE_SOL_PER_TX,
        netSol: Math.max(0, recovered - sigs.length * FEE_SOL_PER_TX),
        error: message,
      });
      return false;
    }
  }, [accounts, selected, publicKey, connection, sendTransaction, refreshBalance]);

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
    setSignatures([]);
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

  // Wallet-level totals for the status card: what closing EVERY found account
  // would cost and net, independent of the current selection.
  const totalTxCount = Math.ceil(accounts.length / MAX_CLOSES_PER_TX);
  const totalFee = totalTxCount * FEE_SOL_PER_TX;
  const totalNet = Math.max(0, totalRecoverable - totalFee);

  // Cleanup score derived purely from the real number of empty accounts found.
  const walletHealth = computeWalletHealth(accounts.length);

  // Realised fee/net from the confirmed cleanup run (one base fee per tx).
  const recoveredFee = signatures.length * FEE_SOL_PER_TX;
  const recoveredNet = Math.max(0, recoveredSol - recoveredFee);

  return {
    status,
    error,
    owner,
    walletBalance,
    balanceStatus,
    accounts,
    selected,
    selectedAccounts,
    totalRecoverable,
    selectedRecoverable,
    estimatedFee,
    estimatedNet,
    totalTxCount,
    totalFee,
    totalNet,
    walletHealth,
    closedCount,
    recoveredSol,
    signatures,
    recoveredFee,
    recoveredNet,
    txCount,
    progress,
    scan,
    closeSelected,
    refreshBalance,
    toggle,
    selectAll,
    clearSelection,
    reset,
  };
}

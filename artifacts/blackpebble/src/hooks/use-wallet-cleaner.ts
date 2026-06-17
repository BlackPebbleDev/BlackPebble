import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import {
  createCloseAccountInstruction,
  createBurnCheckedInstruction,
} from "@solana/spl-token";
import {
  scanAllAssets,
  closeableFromAssets,
  computeWalletHealthV2,
  explainWalletHealth,
  formatRentSol,
  MAX_CLOSES_PER_TX,
  MAX_BURNS_PER_TX,
  FEE_SOL_PER_TX,
  type CloseableAccount,
  type WalletAsset,
  type HealthInputs,
} from "@/lib/recovery-scan";
import {
  enrichToken,
  type EnrichedToken,
  type CleanupBucket,
} from "@/lib/recovery-classify";
import { api, type RecoveryTrackBody, type TokenIntel } from "@/lib/api";

export { formatRentSol } from "@/lib/recovery-scan";
export type { CloseableAccount } from "@/lib/recovery-scan";

/**
 * Best-effort usage tracking for SOL Recovery analytics. Fire-and-forget: it
 * runs only AFTER the on-chain recovery logic and swallows every error, so it
 * can never affect scanning, closing or burning.
 */
function trackRecovery(body: RecoveryTrackBody): void {
  void api.recovery.track(body).catch(() => {});
}

/**
 * localStorage keys for the per-wallet protection overrides. Two independent
 * lists: mints the user explicitly protected, and default-protected mints the
 * user explicitly un-protected (to make them eligible for cleanup).
 */
function userProtectKey(wallet: string): string {
  return `bp:cleanup:protected:${wallet}`;
}

function userUnprotectKey(wallet: string): string {
  return `bp:cleanup:unprotected:${wallet}`;
}

function loadMintSet(key: string | null): Set<string> {
  if (!key) return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function saveMintSet(key: string, mints: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...mints]));
  } catch {
    // Non-fatal — protection just won't persist across reloads.
  }
}

export type CleanerStatus =
  | "idle"
  | "scanning"
  | "scanned"
  | "closing"
  | "done"
  | "error";

/** Lifecycle of a real on-chain burn run. */
export type BurnStatus = "idle" | "burning" | "done" | "error";

/**
 * Lifecycle of the live on-chain wallet balance fetch. "error" is surfaced as
 * "Unavailable" in the UI and never blocks scanning or closing.
 */
export type BalanceStatus = "idle" | "loading" | "ready" | "error";

/** Live progress while closing/burning batches. */
export interface CloseProgress {
  batchIndex: number;
  totalBatches: number;
  fromIndex: number;
  toIndex: number;
  total: number;
}

export interface UseWalletCleaner {
  status: CleanerStatus;
  error: string | null;
  owner: string | null;
  walletBalance: number | null;
  balanceStatus: BalanceStatus;
  // ── Rent recovery (empty token accounts) ──
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
  closedCount: number;
  recoveredSol: number;
  signatures: string[];
  recoveredFee: number;
  recoveredNet: number;
  txCount: number;
  progress: CloseProgress | null;
  // ── Full wallet assets + intelligence ──
  assets: WalletAsset[];
  tokens: EnrichedToken[];
  intelLoading: boolean;
  allTokens: EnrichedToken[];
  dustTokens: EnrichedToken[];
  burnCandidates: EnrichedToken[];
  protectedTokens: EnrichedToken[];
  walletValueUsd: number;
  walletRealizableUsd: number;
  // ── Health (real-count driven) ──
  walletHealth: number;
  healthInputs: HealthInputs;
  healthExplanation: string;
  projectedHealthAfterClose: number;
  projectedHealthAfterBurn: number;
  // ── User protection ──
  userProtected: Set<string>;
  userUnprotected: Set<string>;
  protectToken: (mint: string) => void;
  unprotectToken: (mint: string) => void;
  // ── Burn flow ──
  burnStatus: BurnStatus;
  burnError: string | null;
  burnProgress: CloseProgress | null;
  burnSelected: Set<string>;
  burnSelectedTokens: EnrichedToken[];
  burnedCount: number;
  burnSignatures: string[];
  burnRecoveredSol: number;
  toggleBurn: (pubkey: string) => void;
  selectAllInBucket: (bucket: CleanupBucket) => void;
  clearBurnSelection: () => void;
  executeBurn: () => Promise<boolean>;
  // ── Actions ──
  scan: () => Promise<void>;
  closeSelected: () => Promise<boolean>;
  refreshBalance: () => Promise<void>;
  toggle: (pubkey: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  reset: () => void;
}

const INTEL_BATCH = 100;

export function useWalletCleaner(): UseWalletCleaner {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [status, setStatus] = useState<CleanerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<WalletAsset[]>([]);
  const [accounts, setAccounts] = useState<CloseableAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [closedCount, setClosedCount] = useState(0);
  const [recoveredSol, setRecoveredSol] = useState(0);
  const [signatures, setSignatures] = useState<string[]>([]);
  const [progress, setProgress] = useState<CloseProgress | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [balanceStatus, setBalanceStatus] = useState<BalanceStatus>("idle");

  // Token intelligence keyed by mint, accumulated as batches resolve.
  const [intelByMint, setIntelByMint] = useState<Record<string, TokenIntel>>({});
  const [intelLoading, setIntelLoading] = useState(false);

  // Per-wallet protection overrides (persisted to localStorage). Two lists:
  // explicit user protection, and explicit un-protection of default-protected
  // assets so they become eligible for cleanup.
  const [userProtected, setUserProtected] = useState<Set<string>>(new Set());
  const [userUnprotected, setUserUnprotected] = useState<Set<string>>(new Set());

  // Burn flow state (independent of the rent-close flow).
  const [burnStatus, setBurnStatus] = useState<BurnStatus>("idle");
  const [burnError, setBurnError] = useState<string | null>(null);
  const [burnProgress, setBurnProgress] = useState<CloseProgress | null>(null);
  const [burnSelected, setBurnSelected] = useState<Set<string>>(new Set());
  const [burnedCount, setBurnedCount] = useState(0);
  const [burnSignatures, setBurnSignatures] = useState<string[]>([]);
  const [burnRecoveredSol, setBurnRecoveredSol] = useState(0);

  const balanceReqId = useRef(0);
  const owner = publicKey ? publicKey.toBase58() : null;

  // Load the protection overrides whenever the connected wallet changes.
  useEffect(() => {
    setUserProtected(loadMintSet(owner ? userProtectKey(owner) : null));
    setUserUnprotected(loadMintSet(owner ? userUnprotectKey(owner) : null));
  }, [owner]);

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

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  /** Fetch position-independent intelligence for every held mint, in batches. */
  const fetchIntel = useCallback(async (mints: string[]) => {
    const unique = [...new Set(mints.filter(Boolean))];
    if (unique.length === 0) {
      setIntelByMint({});
      return;
    }
    setIntelLoading(true);
    try {
      for (let i = 0; i < unique.length; i += INTEL_BATCH) {
        const batch = unique.slice(i, i + INTEL_BATCH);
        const res = await api.recovery.tokenIntel(batch);
        const intel = res.intel ?? {};
        setIntelByMint((prev) => ({ ...prev, ...intel }));
      }
    } catch (e) {
      // Best-effort: tokens without intel render with conservative defaults.
      console.warn("Wallet cleaner: intel fetch failed", e);
    } finally {
      setIntelLoading(false);
    }
  }, []);

  const scan = useCallback(async () => {
    if (!publicKey) return;
    setStatus("scanning");
    setError(null);
    setAssets([]);
    setAccounts([]);
    setSelected(new Set());
    setClosedCount(0);
    setRecoveredSol(0);
    setSignatures([]);
    setProgress(null);
    setIntelByMint({});
    setBurnSelected(new Set());
    setBurnStatus("idle");
    setBurnError(null);
    setBurnedCount(0);
    setBurnSignatures([]);
    setBurnRecoveredSol(0);

    try {
      const allAssets = await scanAllAssets(connection, publicKey);
      const closeable = closeableFromAssets(allAssets);
      setAssets(allAssets);
      setAccounts(closeable);
      setStatus("scanned");
      trackRecovery({
        eventType: "scan",
        wallet: publicKey.toBase58(),
        accountsFound: closeable.length,
        recoverableSol: closeable.reduce((sum, a) => sum + a.sol, 0),
      });
      // Resolve intelligence for held (non-empty) tokens only.
      const heldMints = allAssets
        .filter((a) => !a.isEmpty)
        .map((a) => a.mint);
      void fetchIntel(heldMints);
      void refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed.");
      setStatus("error");
    }
  }, [connection, publicKey, refreshBalance, fetchIntel]);

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
              new PublicKey(acc.pubkey),
              publicKey,
              publicKey,
              [],
              new PublicKey(acc.programId),
            ),
          );
        }

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

      const networkFee = sigs.length * FEE_SOL_PER_TX;
      const net = Math.max(0, recovered - networkFee);

      setClosedCount(closed);
      setRecoveredSol(recovered);
      setSignatures(sigs);
      setAccounts((prev) => prev.filter((a) => !closedPubkeys.has(a.pubkey)));
      setAssets((prev) => prev.filter((a) => !closedPubkeys.has(a.pubkey)));
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
      void refreshBalance();
      return true;
    } catch (e) {
      if (closedPubkeys.size > 0) {
        setAccounts((prev) => prev.filter((a) => !closedPubkeys.has(a.pubkey)));
        setAssets((prev) => prev.filter((a) => !closedPubkeys.has(a.pubkey)));
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
        e instanceof Error ? e.message : "Failed to close the selected accounts.";
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

  // ── Enriched tokens + classification ──────────────────────────────────────
  const tokens = useMemo<EnrichedToken[]>(() => {
    return assets
      .filter((a) => !a.isEmpty)
      .map((a) =>
        enrichToken(
          a,
          intelByMint[a.mint] ?? null,
          userProtected.has(a.mint),
          userUnprotected.has(a.mint),
        ),
      );
  }, [assets, intelByMint, userProtected, userUnprotected]);

  const allTokens = tokens;
  const dustTokens = useMemo(
    () => tokens.filter((t) => t.bucket === "dust"),
    [tokens],
  );
  const burnCandidates = useMemo(
    () => tokens.filter((t) => t.bucket === "burn"),
    [tokens],
  );
  const protectedTokens = useMemo(
    () => tokens.filter((t) => t.bucket === "protected"),
    [tokens],
  );

  const walletValueUsd = useMemo(
    () => tokens.reduce((sum, t) => sum + (t.valueUsd ?? 0), 0),
    [tokens],
  );
  const walletRealizableUsd = useMemo(
    () => tokens.reduce((sum, t) => sum + t.realizableUsd, 0),
    [tokens],
  );

  // ── Health (real counts) ────────────────────────────────────────────────
  const healthInputs = useMemo<HealthInputs>(() => {
    let spam = 0;
    let unknown = 0;
    let fake = 0;
    for (const t of tokens) {
      if (t.isProtected) continue;
      if (t.intel?.risk === "spam" || t.intel?.risk === "high_risk") spam += 1;
      if (!t.intel || t.intel.risk === "unknown") unknown += 1;
      if (t.fakeValue) fake += 1;
    }
    return {
      emptyAccounts: accounts.length,
      spamTokens: spam,
      unknownTokens: unknown,
      fakeValueTokens: fake,
    };
  }, [tokens, accounts.length]);

  const walletHealth = useMemo(
    () => computeWalletHealthV2(healthInputs),
    [healthInputs],
  );
  const healthExplanation = useMemo(
    () => explainWalletHealth(healthInputs),
    [healthInputs],
  );

  // ── User protection ──────────────────────────────────────────────────────
  // Protect/unprotect are idempotent and order-independent: protecting clears
  // any un-protect override (and vice versa), so a mint is never in both lists.
  const protectToken = useCallback(
    (mint: string) => {
      setUserProtected((prev) => {
        const next = new Set(prev);
        next.add(mint);
        if (owner) saveMintSet(userProtectKey(owner), next);
        return next;
      });
      setUserUnprotected((prev) => {
        if (!prev.has(mint)) return prev;
        const next = new Set(prev);
        next.delete(mint);
        if (owner) saveMintSet(userUnprotectKey(owner), next);
        return next;
      });
      // Becoming protected must immediately drop any burn selection for the
      // mint so a protected asset can never be burned.
      setBurnSelected((prev) => {
        const next = new Set(prev);
        for (const t of tokens) {
          if (t.asset.mint === mint) next.delete(t.asset.pubkey);
        }
        return next;
      });
    },
    [owner, tokens],
  );

  const unprotectToken = useCallback(
    (mint: string) => {
      setUserUnprotected((prev) => {
        const next = new Set(prev);
        next.add(mint);
        if (owner) saveMintSet(userUnprotectKey(owner), next);
        return next;
      });
      setUserProtected((prev) => {
        if (!prev.has(mint)) return prev;
        const next = new Set(prev);
        next.delete(mint);
        if (owner) saveMintSet(userProtectKey(owner), next);
        return next;
      });
    },
    [owner],
  );

  // ── Burn selection ───────────────────────────────────────────────────────
  const toggleBurn = useCallback(
    (pubkey: string) => {
      const token = tokens.find((t) => t.asset.pubkey === pubkey);
      // SAFETY: a protected token can never be selected for a burn.
      if (token?.isProtected) return;
      setBurnSelected((prev) => {
        const next = new Set(prev);
        if (next.has(pubkey)) next.delete(pubkey);
        else next.add(pubkey);
        return next;
      });
    },
    [tokens],
  );

  const selectAllInBucket = useCallback(
    (bucket: CleanupBucket) => {
      const pubkeys = tokens
        .filter((t) => t.bucket === bucket && !t.isProtected)
        .map((t) => t.asset.pubkey);
      setBurnSelected((prev) => {
        const next = new Set(prev);
        const allSelected = pubkeys.every((p) => next.has(p));
        if (allSelected) {
          for (const p of pubkeys) next.delete(p);
        } else {
          for (const p of pubkeys) next.add(p);
        }
        return next;
      });
    },
    [tokens],
  );

  const clearBurnSelection = useCallback(() => setBurnSelected(new Set()), []);

  const burnSelectedTokens = useMemo(
    () => tokens.filter((t) => burnSelected.has(t.asset.pubkey) && !t.isProtected),
    [tokens, burnSelected],
  );

  const executeBurn = useCallback(async (): Promise<boolean> => {
    if (!publicKey) return false;
    const toBurn = burnSelectedTokens;
    if (toBurn.length === 0) return false;

    setBurnStatus("burning");
    setBurnError(null);

    const totalBatches = Math.ceil(toBurn.length / MAX_BURNS_PER_TX);
    let burned = 0;
    let recovered = 0;
    const burnedPubkeys = new Set<string>();
    const sigs: string[] = [];

    try {
      for (let i = 0; i < toBurn.length; i += MAX_BURNS_PER_TX) {
        const batch = toBurn.slice(i, i + MAX_BURNS_PER_TX);
        setBurnProgress({
          batchIndex: Math.floor(i / MAX_BURNS_PER_TX) + 1,
          totalBatches,
          fromIndex: i + 1,
          toIndex: i + batch.length,
          total: toBurn.length,
        });
        const tx = new Transaction();
        for (const t of batch) {
          const programId = new PublicKey(t.asset.programId);
          // Burn the FULL on-chain balance, then close the now-empty account to
          // also reclaim its locked rent. Burns are irreversible.
          tx.add(
            createBurnCheckedInstruction(
              new PublicKey(t.asset.pubkey),
              new PublicKey(t.asset.mint),
              publicKey,
              BigInt(t.asset.rawAmount),
              t.asset.decimals,
              [],
              programId,
            ),
          );
          tx.add(
            createCloseAccountInstruction(
              new PublicKey(t.asset.pubkey),
              publicKey,
              publicKey,
              [],
              programId,
            ),
          );
        }

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
        burned += batch.length;
        recovered += batch.reduce((sum, t) => sum + t.asset.sol, 0);
        for (const t of batch) burnedPubkeys.add(t.asset.pubkey);
      }

      const networkFee = sigs.length * FEE_SOL_PER_TX;
      const net = Math.max(0, recovered - networkFee);

      setBurnedCount(burned);
      setBurnRecoveredSol(recovered);
      setBurnSignatures(sigs);
      setAssets((prev) => prev.filter((a) => !burnedPubkeys.has(a.pubkey)));
      setBurnSelected(new Set());
      setBurnProgress(null);
      setBurnStatus("done");
      trackRecovery({
        eventType: "cleanup",
        wallet: publicKey.toBase58(),
        status: "success",
        accountsFound: toBurn.length,
        accountsClosed: burned,
        tokensBurned: burned,
        recoverableSol: toBurn.reduce((sum, t) => sum + t.asset.sol, 0),
        recoveredSol: recovered,
        txSignatures: sigs,
        networkFeeSol: networkFee,
        netSol: net,
      });
      void refreshBalance();
      return true;
    } catch (e) {
      if (burnedPubkeys.size > 0) {
        setAssets((prev) => prev.filter((a) => !burnedPubkeys.has(a.pubkey)));
        setBurnSelected((prev) => {
          const next = new Set(prev);
          for (const pk of burnedPubkeys) next.delete(pk);
          return next;
        });
        setBurnedCount(burned);
        setBurnRecoveredSol(recovered);
        setBurnSignatures(sigs);
      }
      const prefix =
        burned > 0
          ? `Burned ${burned} token${burned === 1 ? "" : "s"} before stopping. `
          : "";
      const message =
        e instanceof Error ? e.message : "Failed to burn the selected tokens.";
      setBurnError(prefix + message);
      setBurnStatus("error");
      trackRecovery({
        eventType: "cleanup",
        wallet: publicKey.toBase58(),
        status: "failed",
        accountsFound: toBurn.length,
        accountsClosed: burned,
        tokensBurned: burned,
        recoverableSol: toBurn.reduce((sum, t) => sum + t.asset.sol, 0),
        recoveredSol: recovered,
        txSignatures: sigs,
        networkFeeSol: sigs.length * FEE_SOL_PER_TX,
        netSol: Math.max(0, recovered - sigs.length * FEE_SOL_PER_TX),
        error: message,
      });
      return false;
    }
  }, [burnSelectedTokens, publicKey, connection, sendTransaction, refreshBalance]);

  // ── Projected health (before → after) for the previews ───────────────────
  const projectedHealthAfterClose = useMemo(() => {
    const remainingEmpty = accounts.filter((a) => !selected.has(a.pubkey)).length;
    return computeWalletHealthV2({ ...healthInputs, emptyAccounts: remainingEmpty });
  }, [accounts, selected, healthInputs]);

  const projectedHealthAfterBurn = useMemo(() => {
    let spam = healthInputs.spamTokens;
    let unknown = healthInputs.unknownTokens;
    let fake = healthInputs.fakeValueTokens;
    for (const t of burnSelectedTokens) {
      if (t.intel?.risk === "spam" || t.intel?.risk === "high_risk")
        spam = Math.max(0, spam - 1);
      if (!t.intel || t.intel.risk === "unknown") unknown = Math.max(0, unknown - 1);
      if (t.fakeValue) fake = Math.max(0, fake - 1);
    }
    return computeWalletHealthV2({
      ...healthInputs,
      spamTokens: spam,
      unknownTokens: unknown,
      fakeValueTokens: fake,
    });
  }, [burnSelectedTokens, healthInputs]);

  // ── Rent-recovery selection (unchanged behaviour) ────────────────────────
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
    setAssets([]);
    setAccounts([]);
    setSelected(new Set());
    setClosedCount(0);
    setRecoveredSol(0);
    setSignatures([]);
    setProgress(null);
    setIntelByMint({});
    setBurnStatus("idle");
    setBurnError(null);
    setBurnProgress(null);
    setBurnSelected(new Set());
    setBurnedCount(0);
    setBurnSignatures([]);
    setBurnRecoveredSol(0);
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
  const estimatedFee = txCount * FEE_SOL_PER_TX;
  const estimatedNet = Math.max(0, selectedRecoverable - estimatedFee);

  const totalTxCount = Math.ceil(accounts.length / MAX_CLOSES_PER_TX);
  const totalFee = totalTxCount * FEE_SOL_PER_TX;
  const totalNet = Math.max(0, totalRecoverable - totalFee);

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
    closedCount,
    recoveredSol,
    signatures,
    recoveredFee,
    recoveredNet,
    txCount,
    progress,
    assets,
    tokens,
    intelLoading,
    allTokens,
    dustTokens,
    burnCandidates,
    protectedTokens,
    walletValueUsd,
    walletRealizableUsd,
    walletHealth,
    healthInputs,
    healthExplanation,
    projectedHealthAfterClose,
    projectedHealthAfterBurn,
    userProtected,
    userUnprotected,
    protectToken,
    unprotectToken,
    burnStatus,
    burnError,
    burnProgress,
    burnSelected,
    burnSelectedTokens,
    burnedCount,
    burnSignatures,
    burnRecoveredSol,
    toggleBurn,
    selectAllInBucket,
    clearBurnSelection,
    executeBurn,
    scan,
    closeSelected,
    refreshBalance,
    toggle,
    selectAll,
    clearSelection,
    reset,
  };
}

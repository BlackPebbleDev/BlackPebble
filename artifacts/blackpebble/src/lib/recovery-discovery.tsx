import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  scanCloseableAccounts,
  computeWalletHealth,
  FEE_SOL_PER_TX,
  MAX_CLOSES_PER_TX,
} from "@/lib/recovery-scan";

/**
 * Lifecycle of the lightweight, app-wide recovery scan that powers passive
 * discovery surfaces - the Portfolio "SOL Recovery" card and the post-connect
 * notification. This is intentionally separate from the full SOL Recovery
 * dashboard hook (`use-wallet-cleaner`): it never closes anything, it only
 * reports whether there is recoverable SOL so the feature stays discoverable.
 */
export type DiscoveryStatus =
  | "no-wallet" // No wallet connected - the feature is shown as an invitation.
  | "scanning"
  | "ready"
  | "error";

interface RecoveryDiscoveryValue {
  status: DiscoveryStatus;
  /** Connected wallet address, or null when only an X session exists. */
  owner: string | null;
  /** Live wallet SOL balance (null while unknown). Never mixed into PnL. */
  walletBalance: number | null;
  /** Total recoverable SOL across all empty token accounts. */
  recoverableSol: number;
  /** Estimated net recovery after base network fees. */
  estimatedNet: number;
  /** Number of empty token accounts found. */
  accountCount: number;
  /** 0–100 cleanup score derived from the real empty-account count. */
  walletHealth: number;
  /** Re-run the discovery scan on demand. */
  rescan: () => Promise<void>;
  /** True once the user has dismissed the notification for this session. */
  notificationDismissed: boolean;
  /** Dismiss the post-connect notification for the rest of the session. */
  dismissNotification: () => void;
}

const RecoveryDiscoveryContext = createContext<RecoveryDiscoveryValue>({
  status: "no-wallet",
  owner: null,
  walletBalance: null,
  recoverableSol: 0,
  estimatedNet: 0,
  accountCount: 0,
  walletHealth: 100,
  rescan: async () => {},
  notificationDismissed: false,
  dismissNotification: () => {},
});

/** Session-storage key prefix so dismissal is remembered per wallet per session. */
const DISMISS_KEY = "bp-recovery-notif-dismissed";

export function RecoveryDiscoveryProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const owner = publicKey ? publicKey.toBase58() : null;

  const [status, setStatus] = useState<DiscoveryStatus>("no-wallet");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [recoverableSol, setRecoverableSol] = useState(0);
  const [accountCount, setAccountCount] = useState(0);
  const [notificationDismissed, setNotificationDismissed] = useState(false);

  // Only the most recent scan may write state - a slow earlier scan can never
  // overwrite a fresher result.
  const reqId = useRef(0);

  const rescan = useCallback(async () => {
    if (!publicKey) {
      reqId.current += 1;
      setStatus("no-wallet");
      setWalletBalance(null);
      setRecoverableSol(0);
      setAccountCount(0);
      return;
    }
    const id = ++reqId.current;
    setStatus("scanning");
    try {
      const [lamports, accounts] = await Promise.all([
        connection.getBalance(publicKey).catch(() => null),
        scanCloseableAccounts(connection, publicKey),
      ]);
      if (id !== reqId.current) return;
      setWalletBalance(lamports == null ? null : lamports / LAMPORTS_PER_SOL);
      setRecoverableSol(accounts.reduce((sum, a) => sum + a.sol, 0));
      setAccountCount(accounts.length);
      setStatus("ready");
    } catch (e) {
      if (id !== reqId.current) return;
      console.warn("SOL Recovery discovery scan failed", e);
      setStatus("error");
    }
  }, [connection, publicKey]);

  // Scan whenever a wallet connects/changes. Reset session dismissal per wallet
  // so a freshly connected wallet can surface its own notification once.
  useEffect(() => {
    if (!owner) {
      setNotificationDismissed(false);
      void rescan();
      return;
    }
    try {
      const dismissed =
        sessionStorage.getItem(`${DISMISS_KEY}:${owner}`) === "1";
      setNotificationDismissed(dismissed);
    } catch {
      setNotificationDismissed(false);
    }
    void rescan();
  }, [owner, rescan]);

  const dismissNotification = useCallback(() => {
    setNotificationDismissed(true);
    if (!owner) return;
    try {
      sessionStorage.setItem(`${DISMISS_KEY}:${owner}`, "1");
    } catch {
      /* sessionStorage may be unavailable; in-memory dismissal still applies. */
    }
  }, [owner]);

  const txCount = Math.ceil(accountCount / MAX_CLOSES_PER_TX);
  const estimatedNet = Math.max(0, recoverableSol - txCount * FEE_SOL_PER_TX);
  const walletHealth = computeWalletHealth(accountCount);

  return (
    <RecoveryDiscoveryContext.Provider
      value={{
        status,
        owner,
        walletBalance,
        recoverableSol,
        estimatedNet,
        accountCount,
        walletHealth,
        rescan,
        notificationDismissed,
        dismissNotification,
      }}
    >
      {children}
    </RecoveryDiscoveryContext.Provider>
  );
}

export function useRecoveryDiscovery() {
  return useContext(RecoveryDiscoveryContext);
}

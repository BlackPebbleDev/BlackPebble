import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { trackXConnect } from "@/lib/analytics";
import { getGuestState } from "@/lib/guest-store";

export interface XUser {
  id: string;
  x_id: string;
  x_username: string;
  x_display_name?: string;
  x_avatar_url?: string;
  wallet?: string;
}

interface XAuthContextValue {
  user: XUser | null;
  loggedIn: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  login: () => void;
  logout: () => Promise<void>;
  linkWallet: (wallet: string) => Promise<void>;
}

const XAuthContext = createContext<XAuthContextValue>({
  user: null,
  loggedIn: false,
  loading: false,
  refresh: async () => {},
  login: () => {},
  logout: async () => {},
  linkWallet: async () => {},
});

const API_BASE = "/api";

export function XAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<XUser | null>(null);
  const [loading, setLoading] = useState(true);
  const walletAdapter = useWallet();
  const wallet = walletAdapter.publicKey?.toBase58() ?? null;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/x/me`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        loggedIn: boolean;
        user?: XUser;
      };
      if (data.loggedIn && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Check for x_login=success or x_error in URL after redirect
  useEffect(() => {
    const url = new URL(window.location.href);
    const xLogin = url.searchParams.get("x_login");
    const xError = url.searchParams.get("x_error");

    if (xLogin === "success" || xError) {
      // Clean query params
      url.searchParams.delete("x_login");
      url.searchParams.delete("x_error");
      window.history.replaceState({}, "", url.toString());
      refresh();
      if (xLogin === "success") {
        trackXConnect(getGuestState().anon_id);
      }
      if (xError) {
        console.warn("X login error:", xError);
      }
    }
  }, [refresh]);

  // Auto-link wallet when X is logged in but wallet is not yet linked
  useEffect(() => {
    if (user && wallet && !user.wallet) {
      const link = async () => {
        try {
          await performLinkWallet(wallet, walletAdapter);
        } catch {
          // Silent fail — user can manually link later
        }
      };
      link();
    }
  }, [user, wallet]);

  const login = useCallback(() => {
    const url = new URL(`${API_BASE}/auth/x/login`, window.location.origin);
    window.location.href = url.toString();
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${API_BASE}/auth/x/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }, []);

  const linkWallet = useCallback(async (wallet: string) => {
    await performLinkWallet(wallet, walletAdapter);
  }, [walletAdapter]);

  return (
    <XAuthContext.Provider
      value={{
        user,
        loggedIn: !!user,
        loading,
        refresh,
        login,
        logout,
        linkWallet,
      }}
    >
      {children}
    </XAuthContext.Provider>
  );
}

/**
 * Wallet challenge signing flow used for X wallet linking
 * (POST /auth/x/link-wallet). The wallet signs a server-issued nonce to prove
 * ownership before it can be linked to the X account.
 */
async function signWalletChallenge(wallet: string, walletAdapter: WalletContextState): Promise<string> {
  // Step 1: get challenge from server
  const challengeRes = await fetch(
    `${API_BASE}/auth/x/link-wallet-challenge?wallet=${encodeURIComponent(wallet)}`,
    { credentials: "include" },
  );
  if (!challengeRes.ok) throw new Error("Failed to get challenge");
  const { message } = (await challengeRes.json()) as { message: string };

  // Step 2: sign the challenge with wallet
  const messageBytes = new TextEncoder().encode(message);
  let signature: Uint8Array;
  if (walletAdapter.signMessage) {
    signature = await walletAdapter.signMessage(messageBytes);
  } else {
    throw new Error("Wallet does not support message signing");
  }

  return btoa(String.fromCharCode(...signature));
}

async function performLinkWallet(wallet: string, walletAdapter: WalletContextState) {
  const signature = await signWalletChallenge(wallet, walletAdapter);

  // Step 3: send wallet + signature to server to link to X account
  const res = await fetch(`${API_BASE}/auth/x/link-wallet`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, signature }),
  });
  if (!res.ok) throw new Error("Failed to link wallet");
  const data = (await res.json()) as { ok: boolean; wallet: string };
  if (!data.ok) throw new Error("Failed to link wallet");
}

export function useXAuth() {
  return useContext(XAuthContext);
}

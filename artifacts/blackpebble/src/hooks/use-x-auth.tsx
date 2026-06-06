import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";

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
  login: (wallet?: string | null) => void;
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
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

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
          const res = await fetch(`${API_BASE}/auth/x/link-wallet`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wallet }),
          });
          if (res.ok) {
            const data = (await res.json()) as { ok: boolean; wallet: string };
            if (data.ok) {
              setUser((prev) => (prev ? { ...prev, wallet: data.wallet } : null));
            }
          }
        } catch {
          // Silent fail — user can manually link later
        }
      };
      link();
    }
  }, [user, wallet]);

  const login = useCallback((wallet?: string | null) => {
    const url = new URL(`${API_BASE}/auth/x/login`, window.location.origin);
    if (wallet) url.searchParams.set("wallet", wallet);
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
    const res = await fetch(`${API_BASE}/auth/x/link-wallet`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    if (!res.ok) throw new Error("Failed to link wallet");
    const data = (await res.json()) as { ok: boolean; wallet: string };
    if (data.ok) {
      setUser((prev) => (prev ? { ...prev, wallet: data.wallet } : null));
    }
  }, []);

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

export function useXAuth() {
  return useContext(XAuthContext);
}

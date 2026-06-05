import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { api, type Account } from "@/lib/api";

interface AccountContextValue {
  wallet: string | null;
  connected: boolean;
  /** True when no wallet is connected — the user is trading as a guest. */
  isGuest: boolean;
  account: Account | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue>({
  wallet: null,
  connected: false,
  isGuest: true,
  account: null,
  loading: false,
  refresh: async () => {},
});

export function AccountProvider({ children }: { children: ReactNode }) {
  const { publicKey, connected } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet) {
      setAccount(null);
      return;
    }
    try {
      const a = await api.getAccount(wallet);
      setAccount(a);
    } catch {
      setAccount(null);
    }
  }, [wallet]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!wallet) {
        setAccount(null);
        return;
      }
      setLoading(true);
      try {
        const a = await api.createAccount(wallet);
        if (!cancelled) setAccount(a);
      } catch {
        if (!cancelled) setAccount(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  return (
    <AccountContext.Provider
      value={{ wallet, connected, isGuest: !wallet, account, loading, refresh }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  return useContext(AccountContext);
}

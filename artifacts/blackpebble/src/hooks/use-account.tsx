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
import { useXAuth } from "@/hooks/use-x-auth";

interface AccountContextValue {
  wallet: string | null;
  connected: boolean;
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
  const { user } = useXAuth();
  const solanaWallet = publicKey?.toBase58() ?? null;

  // An X session is the canonical identity: once signed in, the account follows
  // the X user regardless of which wallet is (auto-)connected. Falling back to
  // a wallet-only key preserves the original behaviour for users who never sign
  // in with X. Guest mode only applies when neither identity exists.
  const accountKey = user ? `x:${user.x_id}` : solanaWallet;

  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!accountKey) {
      setAccount(null);
      return;
    }
    try {
      const a = await api.getAccount(accountKey);
      setAccount(a);
    } catch {
      setAccount(null);
    }
  }, [accountKey]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!accountKey) {
        setAccount(null);
        return;
      }
      setLoading(true);
      try {
        const a = await api.createAccount(accountKey);
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
  }, [accountKey, user, solanaWallet]);

  return (
    <AccountContext.Provider
      value={{
        wallet: accountKey,
        connected,
        isGuest: !accountKey,
        account,
        loading,
        refresh,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  return useContext(AccountContext);
}

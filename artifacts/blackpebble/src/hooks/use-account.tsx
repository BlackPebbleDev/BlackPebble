import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { api, type Account } from "@/lib/api";
import { useXAuth } from "@/hooks/use-x-auth";
import { getGuestState } from "@/lib/guest-store";
import { trackGuestCreated } from "@/lib/analytics";

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
  const qc = useQueryClient();

  // The account is the single source of truth for the cash balance, shared by
  // the spot panel, leverage panel and Portfolio. It lives in a React Query so
  // every `invalidateQueries(["account"])` (after a trade, cancel, close, or a
  // server-side TP/SL/liquidation fill) actually refetches it, and so it
  // refreshes on window focus / remount. `getAccount` is upsert-safe server-side
  // (ensureAccount ON CONFLICT DO NOTHING), so refetching never resets a balance.
  const {
    data: account = null,
    isLoading,
  } = useQuery<Account | null>({
    queryKey: ["account", accountKey],
    enabled: !!accountKey,
    queryFn: () => api.getAccount(accountKey!),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const refresh = useCallback(async () => {
    if (!accountKey) return;
    await qc.invalidateQueries({ queryKey: ["account", accountKey] });
  }, [qc, accountKey]);

  // Funnel beacon: a device with no identity is a guest. Deduped per device by
  // the analytics helper, so this only counts once.
  useEffect(() => {
    if (!accountKey) trackGuestCreated(getGuestState().anon_id);
  }, [accountKey]);

  return (
    <AccountContext.Provider
      value={{
        wallet: accountKey,
        connected,
        isGuest: !accountKey,
        account,
        loading: isLoading,
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

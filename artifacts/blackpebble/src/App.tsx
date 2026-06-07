import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/app-shell";
import { AccountProvider } from "@/hooks/use-account";
import { XAuthProvider } from "@/hooks/use-x-auth";
import { PnlCurrencyProvider } from "@/lib/pnl-currency";
import { RecoveryDiscoveryProvider } from "@/lib/recovery-discovery";
import NotFound from "@/pages/not-found";
import TradingDesk from "@/pages/trading";
import Markets from "@/pages/markets";
import Portfolio from "@/pages/portfolio";
import PositionDetail from "@/pages/position-detail";
import Leaderboard from "@/pages/leaderboard";
import Utilities from "@/pages/utilities";
import WalletCleaner from "@/pages/wallet-cleaner";
import TradePlanner from "@/pages/trade-planner";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={TradingDesk} />
        <Route path="/markets" component={Markets} />
        <Route path="/portfolio" component={Portfolio} />
        <Route path="/position/:mint" component={PositionDetail} />
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/utilities/sol-recovery" component={WalletCleaner} />
        <Route path="/utilities/wallet-cleaner" component={WalletCleaner} />
        <Route path="/utilities/trade-planner" component={TradePlanner} />
        <Route path="/utilities" component={Utilities} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function SolanaProviders({ children }: { children: React.ReactNode }) {
  const heliusKey = import.meta.env.VITE_HELIUS_API_KEY as string | undefined;
  const endpoint =
    (import.meta.env.VITE_HELIUS_RPC_URL as string | undefined) ||
    (heliusKey
      ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
      : clusterApiUrl("mainnet-beta"));
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SolanaProviders>
          <XAuthProvider>
            <AccountProvider>
              <RecoveryDiscoveryProvider>
                <PnlCurrencyProvider>
                  <WouterRouter
                    base={import.meta.env.BASE_URL.replace(/\/$/, "")}
                  >
                    <Router />
                  </WouterRouter>
                </PnlCurrencyProvider>
              </RecoveryDiscoveryProvider>
            </AccountProvider>
          </XAuthProvider>
        </SolanaProviders>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

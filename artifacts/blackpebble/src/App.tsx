import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useEffect } from "react";
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
import { ErrorBoundary } from "@/components/error-boundary";
import { AppShell } from "@/components/app-shell";
import { RouteMeta } from "@/components/route-meta";
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
import AdminPage from "@/pages/admin";
import About from "@/pages/about";
import Features from "@/pages/features";
import Roadmap from "@/pages/roadmap";
import FeedPage from "@/pages/feed";
import ProfilePage from "@/pages/profile";
import DiscoverPage from "@/pages/discover";
import TradingJournal from "@/pages/journal";
import TradingAnalysisPage from "@/pages/trading-analysis";
import CampaignsPage, { CampaignDetailPage } from "@/pages/campaigns";
import { api } from "@/lib/api";

// Sensible global cache defaults so navigating back to a page you just visited
// paints instantly from cache instead of blanking to a spinner and refetching.
// Queries that need fresher data (positions, quotes, live token) still opt in
// via their own refetchInterval / staleTime, which override these.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Warm the two feeds users hit first (Markets list + SOL price) as soon as the
// app boots, so the data is already cached the moment they open Markets. This
// also nudges the API awake, shrinking the first-paint wait after idle.
function prefetchCommonData() {
  void queryClient.prefetchQuery({
    queryKey: ["markets", "trending"],
    queryFn: () => api.trending(),
  });
  void queryClient.prefetchQuery({
    queryKey: ["sol-usd"],
    queryFn: () => api.solPrice(),
  });
}

/** Scrolls to the top of the page on every route change. */
function ScrollToTop() {
  const [path] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);
  return null;
}

function Router() {
  useEffect(() => {
    prefetchCommonData();
  }, []);
  return (
    <AppShell>
      <ScrollToTop />
      <RouteMeta />
      <Switch>
        <Route path="/" component={TradingDesk} />
        <Route path="/markets" component={Markets} />
        <Route path="/portfolio" component={Portfolio} />
        <Route path="/position/:mint" component={PositionDetail} />
        <Route path="/feed" component={FeedPage} />
        <Route path="/u/:handle" component={ProfilePage} />
        <Route path="/discover" component={DiscoverPage} />
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/utilities/sol-recovery" component={WalletCleaner} />
        <Route path="/utilities/wallet-cleaner" component={WalletCleaner} />
        <Route path="/utilities/trade-planner" component={TradePlanner} />
        <Route path="/utilities/journal" component={TradingJournal} />
        <Route path="/utilities/trading-analysis" component={TradingAnalysisPage} />
        <Route path="/campaigns" component={CampaignsPage} />
        <Route path="/campaigns/:id" component={CampaignDetailPage} />
        <Route path="/journal" component={TradingJournal} />
        <Route path="/utilities" component={Utilities} />
        <Route path="/about" component={About} />
        <Route path="/features" component={Features} />
        <Route path="/roadmap" component={Roadmap} />
        <Route path="/admin" component={AdminPage} />
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
    <ErrorBoundary
      fullScreen
      retryLabel="Reload"
      onReset={() => window.location.reload()}
      description="An unexpected error interrupted BlackPebble. Your funds and data are safe - nothing was changed. Reloading should fix it."
    >
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
    </ErrorBoundary>
  );
}

export default App;

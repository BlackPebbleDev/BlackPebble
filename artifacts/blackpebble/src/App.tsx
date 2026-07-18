import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useEffect, useRef, lazy, Suspense } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import {
  walletExplicitlyDisconnected,
  setWalletExplicitlyDisconnected,
} from "@/lib/wallet-connection";
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
import Safety from "@/pages/safety";
import { api } from "@/lib/api";

// Academy routes are lazy-loaded so lesson content and interactive modules stay
// out of the initial application bundle.
const LearnPage = lazy(() => import("@/pages/learn"));
const LearnInteractivePage = lazy(() => import("@/pages/learn-interactive"));
const LearnCategoryPage = lazy(() => import("@/pages/learn-category"));
const LearnLessonPage = lazy(() => import("@/pages/learn-lesson"));
const LearnPathPage = lazy(() => import("@/pages/learn-path"));

function AcademyRouteFallback() {
  // A lightweight layout skeleton (not a spinner) so the page feels like it is
  // already painting while the Academy chunk finishes loading. Purely
  // decorative; the pulse is disabled under reduced motion via Tailwind.
  return (
    <div
      className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:px-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-8"
      role="status"
      aria-label="Loading Academy"
    >
      <div className="hidden lg:block">
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-surface-2 motion-safe:animate-pulse" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-7 w-full rounded-lg bg-surface-2 motion-safe:animate-pulse" />
          ))}
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 lg:max-w-none">
        <div className="h-3 w-40 rounded bg-surface-2 motion-safe:animate-pulse" />
        <div className="h-8 w-3/4 rounded-lg bg-surface-2 motion-safe:animate-pulse" />
        <div className="h-4 w-full rounded bg-surface-2 motion-safe:animate-pulse" />
        <div className="h-4 w-5/6 rounded bg-surface-2 motion-safe:animate-pulse" />
        <div className="h-40 w-full rounded-2xl bg-surface-2 motion-safe:animate-pulse" />
        <div className="h-4 w-full rounded bg-surface-2 motion-safe:animate-pulse" />
        <div className="h-4 w-2/3 rounded bg-surface-2 motion-safe:animate-pulse" />
      </div>
      <span className="sr-only">Loading Academy…</span>
    </div>
  );
}

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
      <Suspense fallback={<AcademyRouteFallback />}>
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
        <Route path="/safety" component={Safety} />
        <Route path="/learn/path/:slug" component={LearnPathPage} />
        <Route path="/learn/interactive" component={LearnInteractivePage} />
        <Route path="/learn/:category/:lesson" component={LearnLessonPage} />
        <Route path="/learn/:category" component={LearnCategoryPage} />
        <Route path="/learn" component={LearnPage} />
        <Route path="/admin" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
      </Suspense>
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

  // Only eager-reconnect when the user has NOT explicitly disconnected. Read
  // once at mount so a refresh/new tab after an explicit disconnect stays
  // disconnected until the user deliberately presses Connect again.
  const autoConnect = useMemo(() => !walletExplicitlyDisconnected(), []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={autoConnect}>
        <WalletModalProvider>
          <WalletConnectionPolicy />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

/**
 * Single centralized wallet-connection policy. Observes connect/disconnect
 * transitions from ANY surface (header button, dropdown, wallet-side, custom
 * Disconnect) and records the user's intent:
 *  - connected -> disconnected  = explicit disconnect  -> persist, block auto-reconnect
 *  - -> connected               = deliberate reconnect -> clear, resume persistence
 * This never touches auth, portfolio, or analysis data.
 */
function WalletConnectionPolicy(): null {
  const { connected } = useWallet();
  const wasConnected = useRef(false);

  useEffect(() => {
    if (connected) {
      wasConnected.current = true;
      setWalletExplicitlyDisconnected(false);
    } else if (wasConnected.current) {
      wasConnected.current = false;
      setWalletExplicitlyDisconnected(true);
    }
  }, [connected]);

  return null;
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

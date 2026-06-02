import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import About from "@/pages/about";
import InvestmentStrategy from "@/pages/investment-strategy";
import Vault from "@/pages/vault";
import Insights from "@/pages/insights";
import Community from "@/pages/community";
import TradingDesk from "@/pages/trading";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/about" component={About} />
        <Route path="/investment-strategy" component={InvestmentStrategy} />
        <Route path="/vault" component={Vault} />
        <Route path="/insights" component={Insights} />
        <Route path="/trading" component={TradingDesk} />
        <Route path="/community" component={Community} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function SolanaProviders({ children }: { children: React.ReactNode }) {
  const endpoint = clusterApiUrl("mainnet-beta");
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
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
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </SolanaProviders>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

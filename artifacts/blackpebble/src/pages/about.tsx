import { useEffect } from "react";
import { Link } from "wouter";
import { Info, ArrowRight } from "lucide-react";

export default function About() {
  useEffect(() => {
    document.title = "About — BlackPebble";
  }, []);

  return (
    <div className="flex flex-col gap-8 px-4 py-6 sm:py-10 max-w-3xl mx-auto">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Info className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-semibold">About BlackPebble</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Practice trading live Solana tokens with paper money — no real funds,
          no risk.
        </p>
      </div>

      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          <span className="text-foreground font-medium">BlackPebble</span> is a
          free Solana paper-trading platform. You trade real, live tokens using
          virtual SOL, so you can learn how memecoin markets move, test
          strategies, and build a track record without ever putting real money
          on the line.
        </p>
        <p>
          Every price, market cap, and liquidity figure comes from live on-chain
          market data, but all balances and trades are simulated. BlackPebble
          never takes custody of real SOL and never executes real swaps — it is
          a sandbox for learning and competition.
        </p>
        <p>
          Connect a wallet or sign in with X to save your progress and climb the
          leaderboard, or jump straight in as a guest. Your guest activity stays
          on your device until you link an account.
        </p>
        <p className="text-xs text-muted-foreground/70">
          BlackPebble is for entertainment and education only. Nothing here is
          financial advice.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/features"
          data-testid="link-about-features"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-border text-foreground hover:border-accent hover:text-accent transition-colors"
        >
          Explore features <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/roadmap"
          data-testid="link-about-roadmap"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-border text-muted-foreground hover:border-accent hover:text-accent transition-colors"
        >
          See the roadmap
        </Link>
        <Link
          href="/"
          data-testid="link-about-start"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-accent text-accent bg-accent/10 hover:bg-accent/20 transition-colors"
        >
          Start trading
        </Link>
      </div>
    </div>
  );
}

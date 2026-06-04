import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LineChart,
  TrendingUp,
  Wallet,
  Trophy,
  Wrench,
} from "lucide-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import logoFlat from "@assets/D911D882-6C4D-49D9-8A77-DA7A52962ABA_1780370693314.png";
import { TokenSearch } from "@/components/token-search";
import { XLoginButton } from "@/components/x-login-button";
import { useAccount } from "@/hooks/use-account";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Trading Desk", icon: LineChart },
  { href: "/markets", label: "Markets", icon: TrendingUp },
  { href: "/portfolio", label: "Portfolio", icon: Wallet },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/utilities", label: "Utilities", icon: Wrench },
];

function isActive(location: string, href: string): boolean {
  if (href === "/") return location === "/";
  return location.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const { wallet } = useAccount();

  function handleSearchSelect(mint: string) {
    navigate(`/?token=${mint}`);
  }

  return (
    <div className="min-h-[100dvh] flex flex-col w-full bg-background text-foreground dark">
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="h-full flex items-center gap-4 px-4 md:pl-[76px]">
          <Link href="/" className="flex-shrink-0" data-testid="link-logo">
            <img
              src={logoFlat}
              alt="Blackpebble"
              className="h-6 md:h-7 w-auto object-contain"
            />
          </Link>

          <div className="flex-1 max-w-xl mx-auto hidden sm:block">
            <TokenSearch onSelect={handleSearchSelect} wallet={wallet} />
          </div>

          <div className="flex-shrink-0 ml-auto flex items-center gap-2">
            <XLoginButton className="hidden lg:inline-flex" />
            <WalletMultiButton />
          </div>
        </div>
      </header>

      {/* Mobile search row */}
      <div className="fixed top-16 left-0 right-0 z-30 sm:hidden bg-background/95 backdrop-blur-md border-b border-border px-4 py-2">
        <TokenSearch onSelect={handleSearchSelect} wallet={wallet} />
      </div>

      {/* Desktop sidebar */}
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={cn(
          "hidden md:flex fixed left-0 top-16 bottom-0 z-50 flex-col border-r border-border bg-card transition-all duration-200",
          expanded ? "w-[200px]" : "w-[60px]",
        )}
      >
        <nav className="flex flex-col gap-1 p-2 pt-4">
          {navItems.map((item) => {
            const active = isActive(location, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                className={cn(
                  "flex items-center gap-3 h-11 px-3 transition-colors overflow-hidden whitespace-nowrap",
                  active
                    ? "bg-accent/15 text-accent border-l-2 border-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary border-l-2 border-transparent",
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span
                  className={cn(
                    "text-sm tracking-wide transition-opacity duration-200",
                    expanded ? "opacity-100" : "opacity-0",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col pt-16 md:pl-[60px] pb-16 md:pb-0">
        <div className="sm:hidden h-14" aria-hidden />
        {children}
      </main>

      {/* Mobile bottom tabs */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 bg-card border-t border-border flex items-center justify-around">
        {navItems.map((item) => {
          const active = isActive(location, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`tab-${item.label.toLowerCase().replace(/\s/g, "-")}`}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 h-full",
                active ? "text-accent" : "text-muted-foreground",
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] tracking-wide">
                {item.label.split(" ")[0]}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

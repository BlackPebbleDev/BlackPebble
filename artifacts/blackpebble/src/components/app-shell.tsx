import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  LineChart,
  TrendingUp,
  Wallet,
  Trophy,
  Wrench,
  Shield,
  Rss,
  GraduationCap,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import logoFlat from "@/assets/bp-wordmark.png";
import { TokenSearch } from "@/components/token-search";
import { NotificationCenter } from "@/components/notification-center";
import { XLoginButton } from "@/components/x-login-button";
import { GuestMigrationPrompt } from "@/components/guest-migration-prompt";
import { RecoveryNotification } from "@/components/recovery-notification";
import { SeasonResetPrompt } from "@/components/season-reset-prompt";
import { useAccount } from "@/hooks/use-account";
import { useAdmin } from "@/hooks/use-admin";
import { useOrderFillToasts } from "@/hooks/use-order-fills";
import { useActivityToasts } from "@/hooks/use-activity-toasts";
import { useReactionRollups } from "@/hooks/use-reaction-rollups";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Trading Desk", icon: LineChart },
  { href: "/markets", label: "Markets", icon: TrendingUp },
  { href: "/portfolio", label: "Portfolio", icon: Wallet },
  { href: "/feed", label: "Feed", icon: Rss },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/utilities", label: "Utilities", icon: Wrench },
];

function isActive(location: string, href: string): boolean {
  if (href === "/") return location === "/";
  return location.startsWith(href);
}

function SiteFooter() {
  const iconLinkClass =
    "text-accent hover:text-accent/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <footer className="border-t border-border/50 px-4 py-5 mt-8">
      <div className="max-w-5xl mx-auto flex flex-col items-center gap-3">
        <div className="flex items-center justify-center gap-5">
          <div className="flex items-center gap-4">
            <a
              href="https://x.com/BlackPebbleFun"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://t.me/BlackPebbleFun"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
            </a>
          </div>
          <span className="h-4 w-px bg-border/70" aria-hidden />
          <div className="flex items-center gap-4">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  href="/learn"
                  aria-label="BlackPebble Academy"
                  className={iconLinkClass}
                  data-testid="link-footer-academy"
                >
                  <GraduationCap className="w-[18px] h-[18px]" aria-hidden />
                </Link>
              </TooltipTrigger>
              <TooltipContent>BlackPebble Academy</TooltipContent>
            </Tooltip>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  href="/safety"
                  aria-label="Wallet Safety"
                  className={iconLinkClass}
                  data-testid="link-footer-safety"
                >
                  <Shield className="w-4 h-4" aria-hidden />
                </Link>
              </TooltipTrigger>
              <TooltipContent>Wallet Safety</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/60 text-center">
          © {new Date().getFullYear()} BlackPebble · Paper trading for entertainment. Not financial advice.
        </p>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const { wallet, isGuest } = useAccount();
  const { isAdmin } = useAdmin();
  // Drive automatic TP/SL fill toasts for both signed-in and guest sessions.
  useOrderFillToasts();
  // ME-scoped milestone/liquidation toasts from the viewer's own timeline.
  useActivityToasts();
  // Aggregated reaction rollups on the viewer's own content (center + toast).
  useReactionRollups();

  // Admins get an extra nav entry to the dashboard; everyone else sees the
  // standard set unchanged.
  const items = useMemo(
    () =>
      isAdmin
        ? [...navItems, { href: "/admin", label: "Admin", icon: Shield }]
        : navItems,
    [isAdmin],
  );

  function handleSearchSelect(mint: string) {
    navigate(`/?token=${mint}`);
  }

  return (
    <div className="min-h-[100dvh] flex flex-col w-full bg-background text-foreground dark">
      {/* Top bar — compact trading-terminal chrome (Design System v2). */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 md:h-20 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="h-full flex items-center gap-3 sm:gap-4 px-4 md:pl-[76px]">
          <Link href="/" className="flex-shrink-0" data-testid="link-logo">
            <img
              src={logoFlat}
              alt="Blackpebble"
              className="w-[132px] md:w-[184px] lg:w-[196px] h-auto object-contain mix-blend-screen"
            />
          </Link>

          <div className="flex-1 max-w-xl mx-auto hidden sm:block">
            <TokenSearch onSelect={handleSearchSelect} wallet={wallet} />
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
            {isGuest && (
              <span
                data-testid="badge-guest-mode"
                className="hidden sm:inline-flex items-center text-[11px] font-semibold uppercase tracking-wider text-accent border border-accent/30 bg-accent/10 px-2.5 py-1 rounded-full"
              >
                Connect X to rank
              </span>
            )}
            <NotificationCenter />
            <div className="account-chip flex min-w-0 items-center gap-1 sm:gap-2">
              <XLoginButton />
              <WalletMultiButton />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile search row */}
      <div className="fixed top-16 left-0 right-0 z-30 sm:hidden bg-background/95 backdrop-blur-md border-b border-border px-4 py-1.5">
        <TokenSearch onSelect={handleSearchSelect} wallet={wallet} />
      </div>

      {/* Desktop sidebar */}
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={cn(
          "hidden md:flex fixed left-0 top-20 bottom-0 z-50 flex-col bg-background/60 backdrop-blur-sm transition-all duration-200",
          expanded ? "w-[208px]" : "w-[64px]",
        )}
      >
        <nav className="flex flex-col gap-1.5 p-2.5 pt-5">
          {items.map((item) => {
            const active = isActive(location, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                className={cn(
                  "group relative flex items-center gap-3 h-11 px-3 rounded-xl transition-all duration-150 overflow-hidden whitespace-nowrap",
                  active
                    ? "bg-accent/10 text-accent shadow-[inset_0_0_0_1px_hsl(var(--accent)/0.25)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-accent" />
                )}
                <Icon
                  className={cn(
                    "w-5 h-5 flex-shrink-0 transition-transform duration-150",
                    !active && "group-hover:scale-105",
                  )}
                />
                <span
                  className={cn(
                    "text-sm font-medium tracking-wide transition-opacity duration-200",
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
      <main className="flex-1 flex flex-col pt-16 md:pt-20 md:pl-[60px] pb-16 md:pb-0 min-w-0 overflow-x-hidden">
        {/* Clears the fixed mobile search row: top-16 (64px) header + py-1.5 (12px)
            + h-11 input (44px) = 56px. Spacer must match to avoid clipping the
            first card under the sticky search bar. */}
        <div className="sm:hidden h-14" aria-hidden />
        <div>{children}</div>
        <SiteFooter />
      </main>

      {/* Mobile bottom tabs */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 bg-card/95 backdrop-blur-md border-t border-border flex items-center justify-around px-1">
        {items.map((item) => {
          const active = isActive(location, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`tab-${item.label.toLowerCase().replace(/\s/g, "-")}`}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors",
                active ? "text-accent" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center h-8 w-12 rounded-full transition-colors",
                  active && "bg-accent/12",
                )}
              >
                <Icon className="w-5 h-5" />
              </span>
              <span
                className={cn(
                  "text-[10px] tracking-wide",
                  active ? "font-semibold" : "font-medium",
                )}
              >
                {item.label.split(" ")[0]}
              </span>
            </Link>
          );
        })}
      </nav>

      <GuestMigrationPrompt />
      <RecoveryNotification />
      <SeasonResetPrompt />
    </div>
  );
}

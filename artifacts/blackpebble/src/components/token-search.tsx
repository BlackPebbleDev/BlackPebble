import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Search,
  Loader2,
  Wrench,
  LineChart,
  BarChart3,
  Wallet,
  Rss,
  Trophy,
  Info,
  Sparkles,
  Map as MapIcon,
  LifeBuoy,
  Eraser,
  Calculator,
  type LucideIcon,
} from "lucide-react";
import { api, type SearchResult, type OfficialBadgeType } from "@/lib/api";
import { fmtMarketCap } from "@/lib/format";
import { trackWalletSearch } from "@/lib/analytics";
import { getGuestState } from "@/lib/guest-store";
import { useAccount } from "@/hooks/use-account";
import { UserIdentity } from "@/components/user-identity";
import { cn } from "@/lib/utils";

interface TokenSearchProps {
  onSelect: (mint: string) => void;
  wallet?: string | null;
  className?: string;
  placeholder?: string;
}

/** A page or utility destination that can be matched client-side. */
interface RouteEntry {
  label: string;
  path: string;
  icon: LucideIcon;
  keywords: string[];
}

const PAGES: RouteEntry[] = [
  { label: "Trading", path: "/", icon: LineChart, keywords: ["trade", "desk", "buy", "sell", "swap", "home"] },
  { label: "Markets", path: "/markets", icon: BarChart3, keywords: ["tokens", "trending", "movers", "market"] },
  { label: "Portfolio", path: "/portfolio", icon: Wallet, keywords: ["holdings", "positions", "balance", "pnl"] },
  { label: "Feed", path: "/feed", icon: Rss, keywords: ["social", "callouts", "posts", "activity"] },
  { label: "Leaderboard", path: "/leaderboard", icon: Trophy, keywords: ["rank", "ranking", "top", "traders", "leaders"] },
  { label: "Utilities", path: "/utilities", icon: Wrench, keywords: ["tools", "utility"] },
  { label: "About", path: "/about", icon: Info, keywords: ["info", "what is", "help"] },
  { label: "Features", path: "/features", icon: Sparkles, keywords: ["capabilities", "what can"] },
  { label: "Roadmap", path: "/roadmap", icon: MapIcon, keywords: ["plans", "upcoming", "future"] },
];

const UTILITIES: RouteEntry[] = [
  { label: "SOL Recovery", path: "/utilities/sol-recovery", icon: LifeBuoy, keywords: ["recover", "recovery", "rent", "reclaim", "locked", "unused"] },
  { label: "Wallet Cleaner", path: "/utilities/wallet-cleaner", icon: Eraser, keywords: ["clean", "cleaner", "dust", "close", "accounts"] },
  { label: "Trade Planner", path: "/utilities/trade-planner", icon: Calculator, keywords: ["plan", "planner", "calculator", "position size", "sizing"] },
];

function matchRoutes(entries: RouteEntry[], q: string): RouteEntry[] {
  const term = q.toLowerCase();
  return entries.filter(
    (e) =>
      e.label.toLowerCase().includes(term) ||
      e.keywords.some((k) => k.includes(term) || term.includes(k)),
  );
}

interface UserResult {
  handle: string;
  display: string | null;
  avatar: string | null;
  rank: number | null;
  tier: string | null;
  officialBadges?: OfficialBadgeType[];
}

/**
 * X handle rules. We only attempt an (exact) profile lookup for an explicit
 * "@handle" query — there is no fuzzy user-search endpoint yet, so firing a
 * lookup on every handle-shaped word would 404-spam the server/console.
 */
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

export function TokenSearch({
  onSelect,
  wallet,
  className,
  placeholder = "Search tokens, traders, tools...",
}: TokenSearchProps) {
  const { isGuest } = useAccount();
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [tokens, setTokens] = useState<SearchResult[]>([]);
  const [user, setUser] = useState<UserResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);

  const trimmed = query.trim();

  const pages = useMemo(
    () => (trimmed.length >= 2 ? matchRoutes(PAGES, trimmed) : []),
    [trimmed],
  );
  const utilities = useMemo(
    () => (trimmed.length >= 2 ? matchRoutes(UTILITIES, trimmed) : []),
    [trimmed],
  );

  useEffect(() => {
    if (trimmed.length < 2) {
      setTokens([]);
      setUser(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const cleanHandle = trimmed.replace(/^@/, "");
    const handleLookup = trimmed.startsWith("@") && HANDLE_RE.test(cleanHandle);
    const t = setTimeout(async () => {
      const [tokenRes, userRes] = await Promise.allSettled([
        api.search(trimmed, wallet ?? undefined),
        handleLookup ? api.profiles.get(cleanHandle) : Promise.reject(),
      ]);
      if (!active) return;
      if (tokenRes.status === "fulfilled") {
        if (isGuest) trackWalletSearch(getGuestState().anon_id);
        setTokens(tokenRes.value.results);
      } else {
        setTokens([]);
      }
      if (userRes.status === "fulfilled") {
        const p = userRes.value;
        setUser({
          handle: p.x_username,
          display: p.x_display_name,
          avatar: p.x_avatar_url,
          rank: p.rank,
          tier: p.graduationTier,
          officialBadges: p.officialBadges,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
      // Only (re)open if the user is still in the field — a debounced request
      // may resolve after they've already clicked away.
      if (focusedRef.current) setOpen(true);
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [trimmed, wallet, isGuest]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Flattened list of selectable actions (in render order) for keyboard nav.
  const flat = useMemo(() => {
    const actions: Array<() => void> = [];
    tokens.forEach((r) => actions.push(() => selectToken(r.mint)));
    if (user) actions.push(() => selectRoute(`/u/${user.handle}`));
    utilities.forEach((u) => actions.push(() => selectRoute(u.path)));
    pages.forEach((p) => actions.push(() => selectRoute(p.path)));
    return actions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, user, utilities, pages]);

  useEffect(() => {
    setActiveIdx(-1);
  }, [trimmed]);

  function reset() {
    setQuery("");
    setTokens([]);
    setUser(null);
    setOpen(false);
    setActiveIdx(-1);
  }

  function selectToken(mint: string) {
    onSelect(mint);
    reset();
  }

  function selectRoute(path: string) {
    navigate(path);
    reset();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? flat.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      flat[activeIdx]?.();
    }
  }

  const hasResults =
    tokens.length > 0 || user != null || utilities.length > 0 || pages.length > 0;

  // Running offset so each group's items map to the right flat index.
  let idx = 0;

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground group-focus-within:text-accent transition-colors pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            focusedRef.current = true;
            if (hasResults) setOpen(true);
          }}
          onBlur={() => {
            focusedRef.current = false;
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          data-testid="input-token-search"
          className="w-full h-12 rounded-2xl bg-surface-2 border border-border pl-11 pr-10 text-sm text-foreground placeholder:text-muted-foreground shadow-card focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-ring/30 focus:bg-surface-3 transition-all"
        />
        {loading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {open && hasResults && (
        <div className="absolute z-50 mt-2 w-full max-h-[70vh] sm:max-h-96 overflow-y-auto rounded-2xl bg-popover border border-popover-border p-1.5 shadow-elevated">
          {tokens.length > 0 && (
            <SearchGroup label="Tokens">
              {tokens.map((r) => {
                const i = idx++;
                return (
                  <button
                    key={r.mint}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => selectToken(r.mint)}
                    data-testid={`search-result-${r.mint}`}
                    className={rowCls(i === activeIdx)}
                  >
                    {r.logo ? (
                      <img
                        src={r.logo}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0">
                        {r.symbol?.slice(0, 2) ?? "?"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-foreground truncate">
                        {r.symbol ?? "Unknown"}
                        <span className="text-muted-foreground ml-2 text-xs">
                          {r.name}
                        </span>
                      </div>
                    </div>
                    {r.marketCapUsd != null && (
                      <div className="text-xs text-muted-foreground font-mono flex-shrink-0">
                        {fmtMarketCap(r.marketCapUsd)}
                      </div>
                    )}
                  </button>
                );
              })}
            </SearchGroup>
          )}

          {user && (
            <SearchGroup label="Users">
              {(() => {
                const i = idx++;
                return (
                  <button
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => selectRoute(`/u/${user.handle}`)}
                    data-testid={`search-user-${user.handle}`}
                    className={rowCls(i === activeIdx)}
                  >
                    <UserIdentity
                      size="sm"
                      className="flex-1"
                      avatarUrl={user.avatar}
                      displayName={user.display}
                      handle={user.handle}
                      officialBadges={user.officialBadges}
                      accountStatus="member"
                      tier={user.tier}
                    />
                    {user.rank != null && (
                      <div className="text-xs text-muted-foreground font-mono flex-shrink-0">
                        #{user.rank}
                      </div>
                    )}
                  </button>
                );
              })()}
            </SearchGroup>
          )}

          {utilities.length > 0 && (
            <SearchGroup label="Utilities">
              {utilities.map((u) => {
                const i = idx++;
                const Icon = u.icon;
                return (
                  <button
                    key={u.path}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => selectRoute(u.path)}
                    data-testid={`search-utility-${u.path}`}
                    className={rowCls(i === activeIdx)}
                  >
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-accent flex-shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="text-sm text-foreground flex-1 truncate">
                      {u.label}
                    </div>
                  </button>
                );
              })}
            </SearchGroup>
          )}

          {pages.length > 0 && (
            <SearchGroup label="Pages">
              {pages.map((p) => {
                const i = idx++;
                const Icon = p.icon;
                return (
                  <button
                    key={p.path}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => selectRoute(p.path)}
                    data-testid={`search-page-${p.path}`}
                    className={rowCls(i === activeIdx)}
                  >
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground flex-shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="text-sm text-foreground flex-1 truncate">
                      {p.label}
                    </div>
                  </button>
                );
              })}
            </SearchGroup>
          )}
        </div>
      )}
    </div>
  );
}

function rowCls(active: boolean) {
  return cn(
    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left",
    active ? "bg-accent/10" : "hover:bg-accent/10",
  );
}

function SearchGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1 last:mb-0">
      <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </div>
      {children}
    </div>
  );
}

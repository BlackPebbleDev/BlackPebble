import { useState, useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { api, type SearchResult } from "@/lib/api";
import { fmtMarketCap } from "@/lib/format";
import { trackWalletSearch } from "@/lib/analytics";
import { getGuestState } from "@/lib/guest-store";
import { useAccount } from "@/hooks/use-account";
import { cn } from "@/lib/utils";

interface TokenSearchProps {
  onSelect: (mint: string) => void;
  wallet?: string | null;
  className?: string;
  placeholder?: string;
}

export function TokenSearch({
  onSelect,
  wallet,
  className,
  placeholder = "Search token by name, symbol, or address",
}: TokenSearchProps) {
  const { isGuest } = useAccount();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { results } = await api.search(query.trim(), wallet ?? undefined);
        if (active) {
          if (isGuest) trackWalletSearch(getGuestState().anon_id);
          setResults(results);
          setOpen(true);
        }
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, wallet]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function handleSelect(mint: string) {
    onSelect(mint);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground group-focus-within:text-accent transition-colors pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          data-testid="input-token-search"
          className="w-full h-12 rounded-2xl bg-surface-2 border border-border pl-11 pr-10 text-sm text-foreground placeholder:text-muted-foreground shadow-card focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-ring/30 focus:bg-surface-3 transition-all"
        />
        {loading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-2 w-full max-h-80 overflow-y-auto rounded-2xl bg-popover border border-popover-border p-1.5 shadow-elevated">
          {results.map((r) => (
            <button
              key={r.mint}
              onClick={() => handleSelect(r.mint)}
              data-testid={`search-result-${r.mint}`}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/10 transition-colors text-left"
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
          ))}
        </div>
      )}
    </div>
  );
}

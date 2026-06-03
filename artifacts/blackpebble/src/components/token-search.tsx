import { useState, useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { api, type SearchResult } from "@/lib/api";
import { fmtMarketCap } from "@/lib/format";
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
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          data-testid="input-token-search"
          className="w-full h-10 bg-card border border-border pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto bg-popover border border-border shadow-xl">
          {results.map((r) => (
            <button
              key={r.mint}
              onClick={() => handleSelect(r.mint)}
              data-testid={`search-result-${r.mint}`}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/10 transition-colors text-left border-b border-border/50 last:border-0"
            >
              {r.logo ? (
                <img
                  src={r.logo}
                  alt=""
                  className="w-7 h-7 object-cover flex-shrink-0"
                  onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                />
              ) : (
                <div className="w-7 h-7 bg-secondary flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0">
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

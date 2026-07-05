import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Users } from "lucide-react";
import { api, type TraderSort } from "@/lib/api";
import { ReputationCard } from "@/components/reputation-card";
import { FilterPills } from "@/components/filter-pills";
import { trackLeaderboardView } from "@/lib/analytics";

const sortTabs: { id: TraderSort; label: string }[] = [
  { id: "trust", label: "Trust" },
  { id: "rising", label: "Rising" },
  { id: "followers", label: "Followers" },
  { id: "calls", label: "Calls" },
];

// Progression tiers. The `id` is the stored graduation_tier key (the server
// filters on an exact, case-insensitive match against that column); the label
// is the display-only progression name from lib/tiers.ts. No membership words
// ("Premium"/"Verified") appear here - progression has its own vocabulary.
const tierTabs: { id: string; label: string }[] = [
  { id: "", label: "Any tier" },
  { id: "bronze", label: "Bronze" },
  { id: "silver", label: "Silver" },
  { id: "gold", label: "Gold" },
  { id: "diamond", label: "Elite" },
  { id: "legend", label: "Black Label" },
];

/** Debounce a fast-changing value so search doesn't fire on every keystroke. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TraderSort>("trust");
  const [tier, setTier] = useState("");
  const [minTrust, setMinTrust] = useState(false);

  useEffect(() => {
    trackLeaderboardView();
  }, []);

  const debouncedQuery = useDebounced(query.trim(), 300);

  const params = useMemo(
    () => ({
      q: debouncedQuery || undefined,
      tier: tier || undefined,
      minTrust: minTrust ? 40 : undefined,
      sort,
      limit: 50,
    }),
    [debouncedQuery, tier, minTrust, sort],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["discover", params],
    queryFn: () => api.profiles.search(params),
    refetchInterval: 60_000,
  });

  const entries = data?.entries ?? [];

  return (
    <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center gap-3 mb-1">
        <Search className="w-7 h-7 text-accent" />
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Discover Traders
        </h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Find traders by name or handle, then filter by tier, Trust Score and
        momentum.
      </p>

      {/* Search input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or @handle…"
          data-testid="input-discover-search"
          className="w-full rounded-xl bg-card shadow-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        />
      </div>

      {/* Sort */}
      <FilterPills
        options={sortTabs}
        value={sort}
        onChange={(id) => setSort(id)}
        size="sm"
        ariaLabel="Sort traders"
        testIdPrefix="sort"
        className="mb-3"
      />

      {/* Tier + trust filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <FilterPills
          options={tierTabs}
          value={tier}
          onChange={setTier}
          size="sm"
          ariaLabel="Filter by tier"
          testIdPrefix="tier"
        />
        <button
          type="button"
          onClick={() => setMinTrust((v) => !v)}
          aria-pressed={minTrust}
          data-testid="filter-min-trust"
          className={
            "font-medium rounded-full border transition-colors whitespace-nowrap px-3.5 py-1.5 text-sm " +
            (minTrust
              ? "border-accent text-accent bg-accent/10"
              : "border-border text-muted-foreground hover:text-foreground hover:border-accent/40")
          }
        >
          Trust 40+
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div
          data-testid="discover-empty"
          className="rounded-2xl border border-dashed border-border bg-card/40 text-center py-16 px-6"
        >
          <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-foreground font-medium mb-1">No traders found</p>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            {debouncedQuery
              ? "Try a different name or handle, or loosen your filters."
              : "Adjust your filters to surface traders across the reputation network."}
          </p>
        </div>
      ) : (
        <div
          className="space-y-2"
          data-testid="list-discover"
          aria-busy={isFetching}
        >
          {entries.map((e) => (
            <ReputationCard
              key={e.user_id}
              entry={e}
              highlight={sort === "rising" ? "rising" : "trust"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

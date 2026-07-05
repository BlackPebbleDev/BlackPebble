import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Rss } from "lucide-react";
import type { FeedActivityItem } from "@/lib/api";
import { api } from "@/lib/api";
import { useXAuth } from "@/hooks/use-x-auth";
import { useSolUsd } from "@/hooks/use-sol-usd";
import { TradeActivityCard } from "@/components/feed-card";
import { FilterPills } from "@/components/filter-pills";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { trackFeedView, trackFeedTabChanged } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * The BlackPebble Feed — the Activity Intelligence timeline. Tabs are
 * server-filtered (each requests only its kinds), so low-volume categories
 * never get starved by trade volume. "All" keeps the Following/Global source
 * toggle; "My Activity" is the signed-in user's own timeline including
 * private milestones.
 */

type FeedFilter =
  | "all"
  | "trading"
  | "calls"
  | "achievements"
  | "campaigns"
  | "recovery"
  | "mine";
type FeedSource = "following" | "global";

const filterTabs: { id: FeedFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "trading", label: "Trading" },
  { id: "calls", label: "Calls & Theses" },
  { id: "achievements", label: "Achievements" },
  { id: "campaigns", label: "Campaigns" },
  { id: "recovery", label: "Recovery" },
  { id: "mine", label: "My Activity" },
];

/** Server-side kind filter per tab (undefined = everything). */
const TAB_KINDS: Partial<Record<FeedFilter, string[]>> = {
  trading: ["spot", "leverage"],
  calls: ["callout", "thesis"],
  achievements: ["achievement", "milestone"],
  campaigns: ["campaign"],
  recovery: ["recovery"],
};

function FeedList({
  items,
  isLoading,
  empty,
}: {
  items: FeedActivityItem[];
  isLoading: boolean;
  empty: { title: string; body: string; action?: React.ReactNode };
}) {
  const solUsd = useSolUsd();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (items.length === 0) {
    return <EmptyState title={empty.title} body={empty.body} action={empty.action} />;
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <TradeActivityCard key={item.id} item={item} solUsd={solUsd} />
      ))}
    </div>
  );
}

/** A server-filtered slice of the global feed (Trading, Calls, Campaigns…). */
function FilteredGlobalFeed({
  tab,
  empty,
}: {
  tab: FeedFilter;
  empty: { title: string; body: string };
}) {
  const kinds = TAB_KINDS[tab];
  const { data, isLoading } = useQuery({
    queryKey: ["feed", "global", tab],
    queryFn: () => api.feed.global({ kinds }),
    refetchInterval: 30_000,
  });
  return (
    <FeedList items={data?.items ?? []} isLoading={isLoading} empty={empty} />
  );
}

function GlobalFeed() {
  const { data, isLoading } = useQuery({
    queryKey: ["feed", "global", "all"],
    queryFn: () => api.feed.global(),
    refetchInterval: 30_000,
  });
  return (
    <FeedList
      items={data?.items ?? []}
      isLoading={isLoading}
      empty={{
        title: "The intelligence feed is quiet",
        body: "Public activity will appear here as the BlackPebble community trades, calls, and builds.",
      }}
    />
  );
}

function FollowingFeed() {
  const { loggedIn, login } = useXAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["feed", "following"],
    queryFn: () => api.feed.following(),
    enabled: loggedIn,
    refetchInterval: 30_000,
  });

  if (!loggedIn) {
    return (
      <EmptyState
        title="Sign in with X to follow traders"
        body="Connect X to unlock BlackPebble social features and build your personalized feed."
        action={
          <button
            type="button"
            onClick={login}
            data-testid="button-feed-connect-x"
            className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
          >
            Connect X
          </button>
        }
      />
    );
  }
  return (
    <FeedList
      items={data?.items ?? []}
      isLoading={isLoading}
      empty={{
        title: "Your intelligence feed is quiet",
        body: "Follow traders to see their trades, calls, and milestones here.",
      }}
    />
  );
}

/** My Activity: the signed-in user's own timeline (private milestones too). */
function MyActivityFeed() {
  const { loggedIn, login } = useXAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["feed", "mine"],
    queryFn: () => api.feed.mine(),
    enabled: loggedIn,
    refetchInterval: 30_000,
  });

  if (!loggedIn) {
    return (
      <EmptyState
        title="Sign in with X to see your timeline"
        body="Your trades, calls, achievements, and milestones will build your BlackPebble story here."
        action={
          <button
            type="button"
            onClick={login}
            data-testid="button-feed-connect-x-mine"
            className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
          >
            Connect X
          </button>
        }
      />
    );
  }
  return (
    <FeedList
      items={data?.items ?? []}
      isLoading={isLoading}
      empty={{
        title: "Your timeline is just getting started",
        body: "Place paper trades, publish calls, or clean up a wallet to start building your activity history.",
      }}
    />
  );
}

/** The live activity feed (filter = "all"), with a Following / Global source. */
function ActivityFeed() {
  const [source, setSource] = useState<FeedSource>("global");

  function selectSource(id: FeedSource) {
    if (id !== source) {
      setSource(id);
      trackFeedTabChanged();
    }
  }

  return (
    <div>
      <div className="inline-flex items-center gap-1 mb-4 rounded-full bg-surface-2 p-1 shadow-card">
        {(["following", "global"] as FeedSource[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => selectSource(id)}
            data-testid={`source-${id}`}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
              source === id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {id === "following" ? "Following" : "Global"}
          </button>
        ))}
      </div>
      {source === "following" ? <FollowingFeed /> : <GlobalFeed />}
    </div>
  );
}

const TAB_EMPTY: Record<string, { title: string; body: string }> = {
  trading: {
    title: "No trades yet",
    body: "Aggregated spot activity and perps positions from the community will show up here.",
  },
  calls: {
    title: "No calls or theses yet",
    body: "When traders put calls on the record or publish research, it lands here with live performance.",
  },
  achievements: {
    title: "No achievements yet",
    body: "Badge unlocks, tier promotions, and community milestones will show up here.",
  },
  campaigns: {
    title: "No campaign activity yet",
    body: "Campaign launches, fundings, and completions from the community will appear here.",
  },
  recovery: {
    title: "No recoveries yet",
    body: "When traders clean up their wallets and recover SOL rent, it'll show up here.",
  },
};

export default function FeedPage() {
  const [filter, setFilter] = useState<FeedFilter>("all");

  useEffect(() => {
    trackFeedView();
  }, []);

  function selectFilter(id: FeedFilter) {
    if (id !== filter) {
      setFilter(id);
      trackFeedTabChanged();
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-6">
      <PageHeader
        icon={Rss}
        title="Feed"
        subtitle="What's happening across BlackPebble — trades, calls, milestones, and campaigns."
      />

      {/* Content-type filter - shared pills, wraps cleanly, no horizontal scroll */}
      <FilterPills
        options={filterTabs}
        value={filter}
        onChange={selectFilter}
        ariaLabel="Feed content type"
        testIdPrefix="filter"
        className="mb-5"
      />

      {filter === "all" && <ActivityFeed />}
      {filter === "mine" && <MyActivityFeed />}
      {filter !== "all" && filter !== "mine" && (
        <FilteredGlobalFeed tab={filter} empty={TAB_EMPTY[filter]} />
      )}
    </div>
  );
}

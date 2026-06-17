import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Megaphone, Rss, ScrollText } from "lucide-react";
import type { FeedActivityItem } from "@/lib/api";
import { api } from "@/lib/api";
import { useXAuth } from "@/hooks/use-x-auth";
import { useSolUsd } from "@/hooks/use-sol-usd";
import { TradeActivityCard } from "@/components/feed-card";
import { FilterPills } from "@/components/filter-pills";
import { trackFeedView, trackFeedTabChanged } from "@/lib/analytics";
import { cn } from "@/lib/utils";

// Content-type filter bar. Only "all" is wired to the live activity feed; the
// rest are forward-looking placeholders until their engines exist.
type FeedFilter = "all" | "trades" | "callouts" | "theses" | "achievements";
type FeedSource = "following" | "global";

const filterTabs: { id: FeedFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "trades", label: "Trades" },
  { id: "callouts", label: "Callouts" },
  { id: "theses", label: "Theses" },
  { id: "achievements", label: "Achievements" },
];

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card shadow-card text-center py-16 px-6">
      <Rss className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
      <p className="text-foreground font-medium mb-1">{title}</p>
      <p className="text-muted-foreground text-sm max-w-sm mx-auto">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function GlobalFeed() {
  const solUsd = useSolUsd();
  const { data, isLoading } = useQuery({
    queryKey: ["feed", "global"],
    queryFn: () => api.feed.global(),
    refetchInterval: 30_000,
  });
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No public activity yet"
        body="Public activity will appear here as the BlackPebble community grows."
      />
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <TradeActivityCard key={item.id} item={item} solUsd={solUsd} />
      ))}
    </div>
  );
}

function FollowingFeed() {
  const { loggedIn, login } = useXAuth();
  const solUsd = useSolUsd();
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
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        title="Your feed is empty"
        body="Follow traders to build your personalized feed."
      />
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <TradeActivityCard key={item.id} item={item} solUsd={solUsd} />
      ))}
    </div>
  );
}

/** Trades-only feed: spot and leverage items from the global activity feed. */
function TradesFeed() {
  const solUsd = useSolUsd();
  const { data, isLoading } = useQuery({
    queryKey: ["feed", "global"],
    queryFn: () => api.feed.global(),
    refetchInterval: 30_000,
  });
  const items = (data?.items ?? []).filter(
    (item: FeedActivityItem) =>
      item.kind === "spot" || item.kind === "leverage",
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No trades yet"
        body="Spot and leverage paper trades from the community will show up here."
      />
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <TradeActivityCard key={item.id} item={item} solUsd={solUsd} />
      ))}
    </div>
  );
}

function CalloutFeed() {
  const solUsd = useSolUsd();
  const { data, isLoading } = useQuery({
    queryKey: ["feed", "global"],
    queryFn: () => api.feed.global(),
    refetchInterval: 30_000,
  });
  const items = (data?.items ?? []).filter(
    (item: FeedActivityItem) => item.kind === "callout",
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No callouts yet"
        body="When traders put a token call on the record, it'll show up here with their thesis and conviction."
      />
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <TradeActivityCard key={item.id} item={item} solUsd={solUsd} />
      ))}
    </div>
  );
}

/** Theses-only feed: the global activity feed narrowed to thesis items. */
function ThesisFeed() {
  const solUsd = useSolUsd();
  const { data, isLoading } = useQuery({
    queryKey: ["feed", "global"],
    queryFn: () => api.feed.global(),
    refetchInterval: 30_000,
  });
  const items = (data?.items ?? []).filter(
    (item: FeedActivityItem) => item.kind === "thesis",
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No theses yet"
        body="When traders publish research theses on tokens, they'll show up here — separate from on-the-record calls."
      />
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <TradeActivityCard key={item.id} item={item} solUsd={solUsd} />
      ))}
    </div>
  );
}

/** Achievements-only feed: badge/milestone earn events from the global feed. */
function AchievementsFeed() {
  const solUsd = useSolUsd();
  const { data, isLoading } = useQuery({
    queryKey: ["feed", "global"],
    queryFn: () => api.feed.global(),
    refetchInterval: 30_000,
  });
  const items = (data?.items ?? []).filter(
    (item: FeedActivityItem) => item.kind === "achievement",
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No achievements yet"
        body="When traders earn badges and milestones, they'll show up here."
      />
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <TradeActivityCard key={item.id} item={item} solUsd={solUsd} />
      ))}
    </div>
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
      <div className="flex items-center gap-3 mb-1">
        <Rss className="w-7 h-7 text-accent" />
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Feed</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Live trading activity from the BlackPebble community.
      </p>

      {/* Content-type filter — shared pills, wraps cleanly, no horizontal scroll */}
      <FilterPills
        options={filterTabs}
        value={filter}
        onChange={selectFilter}
        ariaLabel="Feed content type"
        testIdPrefix="filter"
        className="mb-5"
      />

      {filter === "all" && <ActivityFeed />}
      {filter === "trades" && <TradesFeed />}
      {filter === "callouts" && <CalloutFeed />}
      {filter === "theses" && <ThesisFeed />}
      {filter === "achievements" && <AchievementsFeed />}
    </div>
  );
}

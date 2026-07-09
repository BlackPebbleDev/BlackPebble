import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Rss } from "lucide-react";
import type { FeedActivityItem } from "@/lib/api";
import { api } from "@/lib/api";
import { useXAuth } from "@/hooks/use-x-auth";
import { useSolUsd } from "@/hooks/use-sol-usd";
import { TradeActivityCard } from "@/components/feed-card";
import { FeedSidebar } from "@/components/feed-sidebar";
import { FilterPills } from "@/components/filter-pills";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { trackFeedView, trackFeedTabChanged } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * The BlackPebble Feed — the Activity Intelligence timeline, laid out as a
 * premium two-column dashboard: a wide activity column plus a sticky context
 * rail (Hot Tokens, Active Campaigns). Tabs are server-filtered (each requests
 * only its kinds) so low-volume categories never get starved by trade volume.
 * A persistent Following / Global source toggle applies across every content
 * tab; "My Activity" is the signed-in user's own timeline (private milestones
 * included) and ignores the source toggle.
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

/** Shared "Connect X" gate for the follow-scoped and personal timelines. */
function ConnectXState({
  title,
  body,
  testId,
}: {
  title: string;
  body: string;
  testId: string;
}) {
  const { login } = useXAuth();
  return (
    <EmptyState
      title={title}
      body={body}
      action={
        <button
          type="button"
          onClick={login}
          data-testid={testId}
          className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
        >
          Connect X
        </button>
      }
    />
  );
}

const DEFAULT_GLOBAL_EMPTY = {
  title: "The intelligence feed is quiet",
  body: "Public activity will appear here as the BlackPebble community trades, calls, and builds.",
};

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

const FOLLOWING_EMPTY = {
  title: "Nothing from people you follow yet",
  body: "Follow traders to see their trades, calls, and milestones here.",
};

/**
 * A content filter (All, Trading, …) resolved against the chosen source. Global
 * is public; Following is follow-scoped and requires an X session.
 */
function SourceFeed({
  filter,
  source,
}: {
  filter: FeedFilter;
  source: FeedSource;
}) {
  const { loggedIn } = useXAuth();
  const kinds = TAB_KINDS[filter];
  const following = source === "following";

  const { data, isLoading } = useQuery({
    queryKey: ["feed", source, filter],
    queryFn: () =>
      following ? api.feed.following({ kinds }) : api.feed.global({ kinds }),
    enabled: following ? loggedIn : true,
    refetchInterval: 30_000,
  });

  if (following && !loggedIn) {
    return (
      <ConnectXState
        title="Sign in with X to follow traders"
        body="Connect X to unlock BlackPebble social features and build your personalized feed."
        testId="button-feed-connect-x"
      />
    );
  }

  const empty = following
    ? FOLLOWING_EMPTY
    : (TAB_EMPTY[filter] ?? DEFAULT_GLOBAL_EMPTY);

  return (
    <FeedList items={data?.items ?? []} isLoading={isLoading} empty={empty} />
  );
}

/** My Activity: the signed-in user's own timeline (private milestones too). */
function MyActivityFeed() {
  const { loggedIn } = useXAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["feed", "mine"],
    queryFn: () => api.feed.mine(),
    enabled: loggedIn,
    refetchInterval: 30_000,
  });

  if (!loggedIn) {
    return (
      <ConnectXState
        title="Sign in with X to see your timeline"
        body="Your trades, calls, achievements, and milestones will build your BlackPebble story here."
        testId="button-feed-connect-x-mine"
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

/** Persistent Following / Global source toggle (all tabs except My Activity). */
function SourceToggle({
  value,
  onChange,
}: {
  value: FeedSource;
  onChange: (id: FeedSource) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-surface-2 p-1 shadow-card">
      {(["following", "global"] as FeedSource[]).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          data-testid={`source-${id}`}
          className={cn(
            "rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
            value === id
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {id === "following" ? "Following" : "Global"}
        </button>
      ))}
    </div>
  );
}

export default function FeedPage() {
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [source, setSource] = useState<FeedSource>("global");

  useEffect(() => {
    trackFeedView();
  }, []);

  function selectFilter(id: FeedFilter) {
    if (id !== filter) {
      setFilter(id);
      trackFeedTabChanged();
    }
  }

  function selectSource(id: FeedSource) {
    if (id !== source) {
      setSource(id);
      trackFeedTabChanged();
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-6">
      <PageHeader
        icon={Rss}
        title="Feed"
        subtitle="What's happening across BlackPebble — trades, calls, milestones, and campaigns."
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:items-start">
        <div className="min-w-0">
          {/* Content-type filter - shared pills, wraps cleanly, no h-scroll */}
          <FilterPills
            options={filterTabs}
            value={filter}
            onChange={selectFilter}
            ariaLabel="Feed content type"
            testIdPrefix="filter"
            className="mb-3"
          />

          {filter !== "mine" && (
            <div className="mb-4">
              <SourceToggle value={source} onChange={selectSource} />
            </div>
          )}

          {filter === "mine" ? (
            <MyActivityFeed />
          ) : (
            <SourceFeed filter={filter} source={source} />
          )}
        </div>

        <FeedSidebar />
      </div>
    </div>
  );
}

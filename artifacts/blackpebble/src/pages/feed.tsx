import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Rss } from "lucide-react";
import { api } from "@/lib/api";
import { useXAuth } from "@/hooks/use-x-auth";
import { useSolUsd } from "@/hooks/use-sol-usd";
import { TradeActivityCard, PlaceholderCard } from "@/components/feed-card";
import { trackFeedView, trackFeedTabChanged } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type FeedTab = "following" | "global" | "callouts";

const tabs: { id: FeedTab; label: string }[] = [
  { id: "following", label: "Following" },
  { id: "global", label: "Global" },
  { id: "callouts", label: "Callouts" },
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
    <div className="border border-border bg-card text-center py-16 px-6">
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
        body="When traders signed in with X start trading, their moves show up here."
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
            className="inline-flex items-center px-4 py-2 text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
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
        title="Nothing here yet"
        body="Follow traders to see their activity, or no followed trader has traded recently."
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

function CalloutsFeed() {
  return (
    <div className="space-y-2">
      <PlaceholderCard
        kind="callout"
        title="Callouts are coming soon"
        body="Soon traders will be able to call their entries on-chain — bullish or bearish — and you'll see them tracked here with live performance."
      />
    </div>
  );
}

export default function FeedPage() {
  const [tab, setTab] = useState<FeedTab>("global");

  useEffect(() => {
    trackFeedView();
  }, []);

  function selectTab(id: FeedTab) {
    if (id !== tab) {
      setTab(id);
      trackFeedTabChanged();
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center gap-3 mb-1">
        <Rss className="w-6 h-6 text-accent" />
        <h1 className="text-2xl font-semibold">Feed</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Live trading activity from the BlackPebble community.
      </p>

      <div className="flex items-center gap-1 mb-5 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
            data-testid={`tab-${t.id}`}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "following" && <FollowingFeed />}
      {tab === "global" && <GlobalFeed />}
      {tab === "callouts" && <CalloutsFeed />}
    </div>
  );
}

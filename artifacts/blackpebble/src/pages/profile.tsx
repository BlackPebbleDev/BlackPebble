import { useEffect } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Loader2,
  ScrollText,
  Trophy,
  UserPlus,
  UserCheck,
  Megaphone,
} from "lucide-react";
import { api, type ProfileResponse } from "@/lib/api";
import { useXAuth } from "@/hooks/use-x-auth";
import { useSolUsd } from "@/hooks/use-sol-usd";
import {
  fmtPercent,
  pnlColor,
  xProfileUrl,
} from "@/lib/format";
import { PnlAmount } from "@/components/pnl-amount";
import { TierBadge } from "@/components/tier-badge";
import { PlaceholderCard } from "@/components/feed-card";
import {
  trackProfileView,
  trackFollowCreated,
  trackFollowRemoved,
  trackXProfileLinkClicked,
} from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function Avatar({ url, name }: { url: string | null; name: string }) {
  const initial = name.replace(/^@+/, "").slice(0, 2).toUpperCase() || "?";
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover flex-shrink-0"
        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      />
    );
  }
  return (
    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-secondary flex items-center justify-center text-lg text-muted-foreground flex-shrink-0 font-mono">
      {initial}
    </div>
  );
}

function StatTile({
  label,
  value,
  cls,
}: {
  label: string;
  value: React.ReactNode;
  cls?: string;
}) {
  return (
    <div className="border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 font-mono text-base text-foreground", cls)}>
        {value}
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-6">
      <Icon className="w-4 h-4 text-accent" />
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
        {title}
      </h2>
    </div>
  );
}

function FollowButton({ profile }: { profile: ProfileResponse }) {
  const { loggedIn, login } = useXAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      if (profile.isFollowing) {
        return api.profiles.unfollow(profile.x_username || profile.user_id);
      }
      return api.profiles.follow(profile.x_username || profile.user_id);
    },
    onSuccess: (_data, _vars) => {
      if (profile.isFollowing) {
        trackFollowRemoved();
      } else {
        trackFollowCreated();
      }
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["feed", "following"] });
    },
    onError: () => {
      toast({
        title: "Something went wrong",
        description: "Couldn't update your follow. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (profile.isSelf) return null;

  if (!loggedIn) {
    return (
      <button
        type="button"
        onClick={login}
        data-testid="button-profile-connect-x"
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
      >
        <UserPlus className="w-4 h-4" />
        Connect X to follow
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      data-testid="button-follow-toggle"
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60",
        profile.isFollowing
          ? "border border-border text-foreground hover:border-accent/60"
          : "bg-accent text-accent-foreground hover:bg-accent/90",
      )}
    >
      {mutation.isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : profile.isFollowing ? (
        <UserCheck className="w-4 h-4" />
      ) : (
        <UserPlus className="w-4 h-4" />
      )}
      {profile.isFollowing ? "Following" : "Follow"}
    </button>
  );
}

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const solUsd = useSolUsd();

  useEffect(() => {
    trackProfileView();
  }, [handle]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["profile", handle],
    queryFn: () => api.profiles.get(handle),
    enabled: !!handle,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-6">
        <div className="border border-border bg-card text-center py-16 px-6">
          <p className="text-foreground font-medium mb-1">Profile not found</p>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            This trader doesn't exist or hasn't signed in with X. Only traders
            connected with X have public profiles.
          </p>
        </div>
      </div>
    );
  }

  const profile = data;
  const displayName = profile.x_display_name?.trim() || `@${profile.x_username}`;
  const profileUrl = xProfileUrl(profile.x_username);
  const stats = profile.stats;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-6">
      {/* Header */}
      <div className="border border-border bg-card p-4 md:p-5">
        <div className="flex items-start gap-4">
          <Avatar url={profile.x_avatar_url} name={displayName} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1
                data-testid="text-profile-name"
                className="text-xl md:text-2xl font-semibold text-foreground truncate"
              >
                {displayName}
              </h1>
              <TierBadge tier={profile.graduationTier} size="sm" />
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              {profileUrl && (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackXProfileLinkClicked()}
                  data-testid="link-view-on-x"
                  className="flex items-center gap-1 hover:text-accent transition-colors"
                >
                  @{profile.x_username}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {profile.rank != null && (
                <span className="font-mono">Rank #{profile.rank}</span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <span data-testid="text-following-count">
                <span className="font-semibold text-foreground">
                  {profile.following}
                </span>{" "}
                <span className="text-muted-foreground">Following</span>
              </span>
              <span data-testid="text-followers-count">
                <span className="font-semibold text-foreground">
                  {profile.followers}
                </span>{" "}
                <span className="text-muted-foreground">Followers</span>
              </span>
            </div>
          </div>
          <div className="flex-shrink-0">
            <FollowButton profile={profile} />
          </div>
        </div>
      </div>

      {/* Trader stats (real) */}
      <SectionHeader icon={Trophy} title="Trader Stats" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatTile
          label="ROI"
          value={fmtPercent(stats.roiPercent)}
          cls={pnlColor(stats.roiPercent)}
        />
        <StatTile
          label="Total P&L"
          value={<PnlAmount sol={stats.totalPnlSol} solUsd={solUsd} unit={false} />}
          cls={pnlColor(stats.totalPnlSol)}
        />
        <StatTile
          label="Realized P&L"
          value={
            <PnlAmount sol={stats.realizedPnlSol} solUsd={solUsd} unit={false} />
          }
          cls={pnlColor(stats.realizedPnlSol)}
        />
        <StatTile label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} />
        <StatTile label="Closed Trades" value={String(stats.closedTrades)} />
        <StatTile label="Executions" value={String(stats.totalExecutions)} />
        <StatTile
          label="Best Trade"
          value={<PnlAmount sol={stats.bestTrade} solUsd={solUsd} unit={false} />}
          cls={pnlColor(stats.bestTrade)}
        />
        <StatTile label="Tier" value={stats.graduationTier} />
      </div>

      {/* Caller stats (placeholder) */}
      <SectionHeader icon={Megaphone} title="Caller Stats" />
      <PlaceholderCard
        kind="callout"
        title="Caller stats coming soon"
        body="Once callouts launch, this trader's call accuracy, hit rate, and average return will be tracked here."
      />

      {/* Token theses (placeholder) */}
      <SectionHeader icon={ScrollText} title="Token Theses" />
      <PlaceholderCard
        kind="thesis"
        title="No theses yet"
        body="Traders will be able to publish their conviction theses on tokens. They'll appear here."
      />

      {/* Achievements (placeholder) */}
      <SectionHeader icon={Trophy} title="Achievements" />
      <PlaceholderCard
        kind="achievement"
        title="Achievements coming soon"
        body="Milestones and badges this trader has earned will be showcased here."
      />

      {/* Recent activity (placeholder) */}
      <SectionHeader icon={ScrollText} title="Recent Activity" />
      <PlaceholderCard
        kind="thesis"
        title="Activity feed coming soon"
        body="This trader's recent public trades will appear here. For now, see the global Feed."
      />
    </div>
  );
}

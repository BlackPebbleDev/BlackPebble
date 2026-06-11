import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  ExternalLink,
  History,
  Loader2,
  Megaphone,
  Pencil,
  Pin,
  ScrollText,
  ShieldCheck,
  Star,
  Trophy,
  UserPlus,
  UserCheck,
  Users,
  X as CloseIcon,
} from "lucide-react";
import { api, BIO_MAX_LENGTH, type ProfileResponse } from "@/lib/api";
import { useXAuth } from "@/hooks/use-x-auth";
import { useSolUsd } from "@/hooks/use-sol-usd";
import { fmtNum, fmtPercent, pnlColor, xProfileUrl } from "@/lib/format";
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

/** Placeholder stat tile: shows the future metric label with a muted dash. */
function ComingSoonTile({ label }: { label: string }) {
  return (
    <div className="border border-dashed border-border bg-card/40 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-base text-muted-foreground/50">—</div>
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

/** "Apr 2011 · 14 yr" style label for an X account-creation epoch. */
function formatAccountAge(tsSeconds: number): string {
  const d = new Date(tsSeconds * 1000);
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = d.getFullYear();
  const years = Math.floor((Date.now() / 1000 - tsSeconds) / (365.25 * 86400));
  const age = years >= 1 ? `${years} yr` : "< 1 yr";
  return `${month} ${year} · ${age}`;
}

function BioSection({ profile }: { profile: ProfileResponse }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.bio ?? "");

  const mutation = useMutation({
    mutationFn: (bio: string) => api.profiles.setBio(bio),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setEditing(false);
    },
    onError: (err: unknown) => {
      toast({
        title: "Couldn't save bio",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (editing) {
    const remaining = BIO_MAX_LENGTH - draft.length;
    return (
      <div className="mt-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, BIO_MAX_LENGTH))}
          maxLength={BIO_MAX_LENGTH}
          rows={3}
          autoFocus
          data-testid="textarea-bio"
          placeholder="Add a short bio (plain text only)"
          className="w-full resize-none bg-secondary/40 border border-border p-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent/60"
        />
        <div className="flex items-center justify-between mt-1.5">
          <span
            className={cn(
              "text-[11px] font-mono",
              remaining < 0 ? "text-red-400" : "text-muted-foreground",
            )}
          >
            {remaining} left
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(profile.bio ?? "");
                setEditing(false);
              }}
              data-testid="button-bio-cancel"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-border text-foreground hover:border-accent/60 transition-colors"
            >
              <CloseIcon className="w-3 h-3" />
              Cancel
            </button>
            <button
              type="button"
              onClick={() => mutation.mutate(draft.trim())}
              disabled={mutation.isPending}
              data-testid="button-bio-save"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-60"
            >
              {mutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Pencil className="w-3 h-3" />
              )}
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (profile.bio) {
    return (
      <div className="mt-3 flex items-start gap-2">
        <p
          data-testid="text-profile-bio"
          className="text-sm text-foreground/90 whitespace-pre-wrap break-words flex-1"
        >
          {profile.bio}
        </p>
        {profile.isSelf && (
          <button
            type="button"
            onClick={() => {
              setDraft(profile.bio ?? "");
              setEditing(true);
            }}
            data-testid="button-bio-edit"
            className="flex-shrink-0 text-muted-foreground hover:text-accent transition-colors"
            aria-label="Edit bio"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  if (profile.isSelf) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        data-testid="button-bio-add"
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
        Add a bio
      </button>
    );
  }

  return null;
}

function XReputationSection({ profile }: { profile: ProfileResponse }) {
  const rep = profile.xReputation;
  return (
    <>
      <SectionHeader icon={BadgeCheck} title="X Reputation" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatTile
          label="X Account Age"
          value={
            rep.accountCreatedAt != null ? (
              formatAccountAge(rep.accountCreatedAt)
            ) : (
              <span className="text-muted-foreground/50">—</span>
            )
          }
        />
        <StatTile
          label="Verified"
          value={
            rep.verified == null ? (
              <span className="text-muted-foreground/50">—</span>
            ) : rep.verified ? (
              <span className="inline-flex items-center gap-1 text-accent">
                <BadgeCheck className="w-4 h-4" /> Yes
              </span>
            ) : (
              "No"
            )
          }
        />
        <StatTile
          label="Followers"
          value={
            rep.followers != null ? (
              fmtNum(rep.followers)
            ) : (
              <span className="text-muted-foreground/50">—</span>
            )
          }
        />
        <StatTile
          label="Following"
          value={
            rep.following != null ? (
              fmtNum(rep.following)
            ) : (
              <span className="text-muted-foreground/50">—</span>
            )
          }
        />
      </div>
    </>
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

        {/* Bio (functional: owner can edit inline) */}
        <BioSection profile={profile} />
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

      {/* X reputation (real, with placeholders for missing fields) */}
      <XReputationSection profile={profile} />

      {/* Top-Caller metrics (placeholder) */}
      <SectionHeader icon={Megaphone} title="Top-Caller Metrics" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <ComingSoonTile label="Calls Made" />
        <ComingSoonTile label="Hit Rate" />
        <ComingSoonTile label="Average Multiple" />
        <ComingSoonTile label="Best Call" />
        <ComingSoonTile label="Largest Winner" />
      </div>

      {/* Trust score (placeholder) */}
      <SectionHeader icon={ShieldCheck} title="Trust Score" />
      <PlaceholderCard
        kind="achievement"
        title="Trust Score coming soon"
        body="A reputation score blending call accuracy, trading performance, and X reputation will be shown here."
      />

      {/* Pinned thesis (placeholder) */}
      <SectionHeader icon={Pin} title="Pinned Thesis" />
      <PlaceholderCard
        kind="thesis"
        title="No pinned thesis yet"
        body="Traders will be able to pin their highest-conviction thesis to the top of their profile."
      />

      {/* Call history (placeholder) */}
      <SectionHeader icon={History} title="Call History" />
      <PlaceholderCard
        kind="callout"
        title="Call history coming soon"
        body="Every on-the-record callout this trader has made — permanent and immutable — will be listed here."
      />

      {/* Best calls (placeholder) */}
      <SectionHeader icon={Star} title="Best Calls" />
      <PlaceholderCard
        kind="callout"
        title="Best calls coming soon"
        body="This trader's highest-returning calls, ranked by realized multiple, will be highlighted here."
      />

      {/* Recent calls (placeholder) */}
      <SectionHeader icon={Megaphone} title="Recent Calls" />
      <PlaceholderCard
        kind="callout"
        title="Recent calls coming soon"
        body="The trader's latest calls and their follow-up updates will appear here once callouts launch."
      />

      {/* Token theses (placeholder) */}
      <SectionHeader icon={ScrollText} title="Token Theses" />
      <PlaceholderCard
        kind="thesis"
        title="No theses yet"
        body="Traders will be able to publish their conviction theses on tokens. They'll appear here."
      />
    </div>
  );
}

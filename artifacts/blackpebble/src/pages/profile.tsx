import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BadgeCheck,
  ExternalLink,
  History,
  Loader2,
  Pencil,
  Pin,
  ShieldCheck,
  Trophy,
  UserPlus,
  UserCheck,
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

/** "Mar 2019" — the month/year the X account was created. */
function formatJoinDate(tsSeconds: number): string {
  const d = new Date(tsSeconds * 1000);
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${month} ${d.getFullYear()}`;
}

/** "5 yr" / "< 1 yr" — elapsed time since the X account was created. */
function formatAge(tsSeconds: number): string {
  const years = Math.floor((Date.now() / 1000 - tsSeconds) / (365.25 * 86400));
  return years >= 1 ? `${years} yr` : "< 1 yr";
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

  // Empty state: show "No bio yet." for everyone; owners also get an inline
  // affordance to add one.
  return (
    <div className="mt-3 flex items-center gap-2">
      <p
        data-testid="text-profile-bio-empty"
        className="text-sm italic text-muted-foreground/70"
      >
        No bio yet.
      </p>
      {profile.isSelf && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            setEditing(true);
          }}
          data-testid="button-bio-add"
          className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
        >
          <Pencil className="w-3 h-3" />
          Add a bio
        </button>
      )}
    </div>
  );
}

/** Compact label/value row used inside the X Reputation card (no border). */
function RepField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-base text-foreground">{value}</div>
    </div>
  );
}

/** Muted em-dash shown when a real X value is missing. */
const RepDash = () => <span className="text-muted-foreground/50">—</span>;

/** "Coming soon" chip for metrics that aren't computed yet (no calc built). */
const RepSoon = () => (
  <span className="inline-flex items-center bg-secondary/50 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
    Coming soon
  </span>
);

/** Labelled group of reputation fields inside the card (Account / Social / etc). */
function RepGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

function XReputationSection({ profile }: { profile: ProfileResponse }) {
  const rep = profile.xReputation;
  return (
    <>
      <SectionHeader icon={ShieldCheck} title="Reputation" />
      <div
        data-testid="reputation-card"
        className="border border-border bg-card p-4 space-y-6"
      >
        <RepGroup title="Account">
          <RepField
            label="X Verified"
            value={
              rep.verified == null ? (
                <RepDash />
              ) : rep.verified ? (
                <span className="inline-flex items-center gap-1 text-accent">
                  <BadgeCheck className="w-4 h-4" /> Verified
                </span>
              ) : (
                "No"
              )
            }
          />
          <RepField
            label="Account Age"
            value={
              rep.accountCreatedAt != null ? (
                formatAge(rep.accountCreatedAt)
              ) : (
                <RepDash />
              )
            }
          />
          <RepField
            label="Join Date"
            value={
              rep.accountCreatedAt != null ? (
                formatJoinDate(rep.accountCreatedAt)
              ) : (
                <RepDash />
              )
            }
          />
        </RepGroup>

        <RepGroup title="Social">
          <RepField
            label="Followers"
            value={rep.followers != null ? fmtNum(rep.followers) : <RepDash />}
          />
          <RepField
            label="Following"
            value={rep.following != null ? fmtNum(rep.following) : <RepDash />}
          />
        </RepGroup>

        <RepGroup title="BlackPebble">
          <RepField label="Trust Score" value={<RepSoon />} />
          <RepField label="Call Accuracy" value={<RepSoon />} />
          <RepField
            label="Trading Rank"
            value={profile.rank != null ? `#${profile.rank}` : <RepSoon />}
          />
        </RepGroup>
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

/** Example badges shown in the Achievements placeholder (UI only). */
const EXAMPLE_BADGES = [
  "First Trade",
  "Diamond Hands",
  "10x Caller",
  "Top 100",
  "Season Veteran",
  "Sharpshooter",
];

/** Coming-soon card for achievements, with an example badge list. */
function AchievementsPlaceholder() {
  return (
    <div
      data-testid="placeholder-achievements"
      className="border border-dashed border-border bg-card/40 p-4"
    >
      <div className="flex items-start gap-3">
        <Award className="w-5 h-5 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-foreground font-medium">
            Achievements &amp; badges coming soon
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Earn badges for trading milestones, accurate calls, and community
            standing. Example badges you'll be able to unlock:
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLE_BADGES.map((b) => (
          <span
            key={b}
            className="inline-flex items-center gap-1 border border-dashed border-border bg-secondary/30 px-2 py-1 text-[11px] text-muted-foreground/70"
          >
            <Award className="w-3 h-3" />
            {b}
          </span>
        ))}
      </div>
    </div>
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
            {/* Identity: display name → @handle → bio */}
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

            {/* Bio: directly under avatar/name/handle (owner can edit inline) */}
            <BioSection profile={profile} />

            {/* Social: followers / following */}
            <div className="flex items-center gap-4 mt-3 text-sm">
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

            {/* Social action: follow button (hidden for self) */}
            {!profile.isSelf && (
              <div className="mt-3">
                <FollowButton profile={profile} />
              </div>
            )}
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

      {/* Reputation card: real X account data + BlackPebble metric placeholders */}
      <XReputationSection profile={profile} />

      {/* Pinned Thesis (placeholder) */}
      <SectionHeader icon={Pin} title="Pinned Thesis" />
      <PlaceholderCard
        kind="thesis"
        icon={Pin}
        title="No pinned thesis yet"
        body="Traders will be able to pin their highest-conviction token thesis to the top of their profile."
      />

      {/* Call History (placeholder) */}
      <SectionHeader icon={History} title="Call History" />
      <PlaceholderCard
        kind="callout"
        icon={History}
        title="Call history coming soon"
        body="Every on-the-record callout this trader makes will be listed here — permanent and immutable, with no edits or deletes."
      />

      {/* Achievements & Badges (placeholder) */}
      <SectionHeader icon={Award} title="Achievements & Badges" />
      <AchievementsPlaceholder />
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Award,
  Check,
  Coins,
  Copy,
  Gem,
  Globe,
  History,
  Loader2,
  Lock,
  Megaphone,
  MessagesSquare,
  Pencil,
  Plus,
  ScrollText,
  Send,
  Share2,
  ShieldCheck,
  Swords,
  Trophy,
  UserPlus,
  UserCheck,
  Wallet,
  X as CloseIcon,
} from "lucide-react";
import {
  api,
  BIO_MAX_LENGTH,
  CALLOUT_THESIS_MAX,
  CALLOUT_UPDATE_MAX,
  type BadgeEntry,
  type CalloutResult,
  type CalloutWithDetail,
  type Conviction,
  type PeriodPerformance,
  type ProfileResponse,
  type ThesisWithAuthor,
} from "@/lib/api";
import { UserIdentity } from "@/components/user-identity";
import { TrustBadge, trustLabelFromScore } from "@/components/reputation-card";
import { FilterPills } from "@/components/filter-pills";
import { useXAuth } from "@/hooks/use-x-auth";
import { useSolUsd } from "@/hooks/use-sol-usd";
import {
  fmtMarketCap,
  fmtMultiple,
  fmtPercent,
  fmtPrice,
  multipleTone,
  pnlColor,
  shortAddr,
  timeAgo,
  xProfileUrl,
} from "@/lib/format";
import { PnlAmount } from "@/components/pnl-amount";
import { tierMeta } from "@/lib/tiers";
import { TokenSearch } from "@/components/token-search";
import { PlaceholderCard } from "@/components/feed-card";
import {
  trackProfileView,
  trackFollowCreated,
  trackFollowRemoved,
  trackXProfileLinkClicked,
} from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
    <div className="rounded-xl bg-card shadow-card p-4">
      <div className="stat-label">{label}</div>
      <div className={cn("stat-value mt-1.5 text-lg md:text-xl text-foreground", cls)}>
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
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-border rounded-xl text-foreground hover:border-accent/60 transition-colors"
            >
              <CloseIcon className="w-3 h-3" />
              Cancel
            </button>
            <button
              type="button"
              onClick={() => mutation.mutate(draft.trim())}
              disabled={mutation.isPending}
              data-testid="button-bio-save"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-accent text-accent-foreground rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-60"
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

const SOCIAL_DEFS = [
  {
    key: "website",
    icon: Globe,
    label: "Website",
    placeholder: "yoursite.com",
    href: (v: string) => v,
  },
  {
    key: "telegram",
    icon: Send,
    label: "Telegram",
    placeholder: "username",
    href: (v: string) => `https://t.me/${v}`,
  },
  {
    key: "discord",
    icon: MessagesSquare,
    label: "Discord",
    placeholder: "discord.gg/yourcode",
    href: (v: string) => `https://discord.gg/${v}`,
  },
] as const;

/**
 * Off-platform links rendered as compact icon pills. Only links that are set
 * appear; the owner gets an inline editor (add/edit) that saves all three at
 * once. Values are validated + normalized server-side.
 */
function SocialLinks({ profile }: { profile: ProfileResponse }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const s = profile.socials;
  const [draft, setDraft] = useState({
    website: s.website ?? "",
    telegram: s.telegram ?? "",
    discord: s.discord ?? "",
  });

  const mutation = useMutation({
    mutationFn: (vals: {
      website: string;
      telegram: string;
      discord: string;
    }) => api.profiles.setSocials(vals),
    onSuccess: (res) => {
      if (res && res.ok === false) {
        toast({
          title: "Couldn't save links",
          description: res.error ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setEditing(false);
    },
    onError: (err: unknown) => {
      toast({
        title: "Couldn't save links",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const links = SOCIAL_DEFS.map((d) => ({
    ...d,
    value: s[d.key],
  })).filter((d) => !!d.value);

  if (editing) {
    return (
      <div className="mt-3 space-y-2">
        {SOCIAL_DEFS.map((d) => (
          <div key={d.key} className="flex items-center gap-2">
            <d.icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              value={draft[d.key]}
              onChange={(e) =>
                setDraft((p) => ({ ...p, [d.key]: e.target.value }))
              }
              placeholder={d.placeholder}
              data-testid={`input-social-${d.key}`}
              className="flex-1 min-w-0 bg-secondary/40 border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent/60"
            />
          </div>
        ))}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft({
                website: s.website ?? "",
                telegram: s.telegram ?? "",
                discord: s.discord ?? "",
              });
              setEditing(false);
            }}
            data-testid="button-socials-cancel"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-border rounded-xl text-foreground hover:border-accent/60 transition-colors"
          >
            <CloseIcon className="w-3 h-3" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate(draft)}
            disabled={mutation.isPending}
            data-testid="button-socials-save"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-accent text-accent-foreground rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-60"
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
    );
  }

  if (links.length === 0 && !profile.isSelf) return null;

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      {links.map((d) => (
        <a
          key={d.key}
          href={d.href(d.value as string)}
          target="_blank"
          rel="noopener noreferrer"
          title={d.label}
          data-testid={`link-social-${d.key}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/60 border border-border text-xs text-foreground/90 hover:border-accent/60 hover:text-accent transition-colors"
        >
          <d.icon className="w-3.5 h-3.5" />
          <span>{d.label}</span>
        </a>
      ))}
      {profile.isSelf && (
        <button
          type="button"
          onClick={() => {
            setDraft({
              website: s.website ?? "",
              telegram: s.telegram ?? "",
              discord: s.discord ?? "",
            });
            setEditing(true);
          }}
          data-testid="button-socials-edit"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:text-accent hover:border-accent/60 transition-colors"
        >
          <Pencil className="w-3 h-3" />
          {links.length ? "Edit links" : "Add links"}
        </button>
      )}
    </div>
  );
}

/** Trading Rank label derived from leaderboard position + trading history. */
function tradingRankLabel(profile: ProfileResponse): string {
  const { rank, stats } = profile;
  if (rank != null && rank <= 10) return "Top 10";
  if (rank != null && rank <= 100) return "Top 100";
  const { closedTrades, roiPercent } = stats;
  if (closedTrades >= 50) return "Veteran";
  if (closedTrades >= 25 && roiPercent > 0) return "Elite Trader";
  if (closedTrades >= 10) return "Advanced Trader";
  if (closedTrades >= 3) return "Trader";
  return "Recruit";
}

function XReputationSection({ profile }: { profile: ProfileResponse }) {
  const key = profile.x_username || String(profile.user_id);
  const { data } = useQuery({
    queryKey: ["caller-stats", key],
    queryFn: () =>
      api.callouts.callerStats(profile.x_username || profile.user_id),
    enabled: !!profile,
    retry: false,
    staleTime: 60_000,
  });
  const callerStats = data?.stats ?? null;

  const trustScore = profile.trustScore?.score ?? 0;
  const trustLabel =
    profile.trustScore?.label ?? trustLabelFromScore(trustScore);
  const rankLabel = tradingRankLabel(profile);
  const hasGradedCalls = callerStats != null && callerStats.gradedCalls > 0;
  const callAccuracy = hasGradedCalls
    ? `${(callerStats!.hitRate * 100).toFixed(0)}%`
    : null;

  return (
    <>
      <SectionHeader icon={ShieldCheck} title="Reputation" />
      <div
        data-testid="reputation-card"
        className="rounded-xl bg-card shadow-card overflow-hidden"
      >
        <div className="grid grid-cols-3 divide-x divide-border">
          <div className="flex flex-col items-center gap-1.5 py-5 px-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Trust Score
            </div>
            <div className="font-mono text-2xl font-bold text-foreground">
              {trustScore}
            </div>
            <TrustBadge
              score={trustScore}
              label={trustLabel}
              size="xs"
              showLabel
            />
          </div>
          <div className="flex flex-col items-center gap-1 py-5 px-3 text-center">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Trading Rank
            </div>
            <div className="font-mono text-sm font-semibold text-foreground leading-tight">
              {rankLabel}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 py-5 px-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Call Accuracy
            </div>
            <div
              className={cn(
                "font-mono font-semibold",
                callAccuracy
                  ? "text-2xl text-foreground"
                  : "text-xs text-muted-foreground",
              )}
            >
              {callAccuracy ?? "No Calls Yet"}
            </div>
          </div>
        </div>
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
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-xl hover:bg-accent/90 transition-colors"
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
        "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors disabled:opacity-60",
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

/** A single badge pill — gold-accented when earned, muted when locked. */
function BadgePill({ badge }: { badge: BadgeEntry }) {
  return (
    <span
      data-testid={`badge-${badge.key}`}
      title={badge.description}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
        badge.earned
          ? "border border-accent/50 bg-accent/10 text-accent"
          : "border border-border/40 bg-secondary/20 text-muted-foreground/50",
      )}
    >
      {badge.earned ? (
        <Award className="w-3 h-3 flex-shrink-0" />
      ) : (
        <Lock className="w-3 h-3 flex-shrink-0" />
      )}
      {badge.name}
    </span>
  );
}

/**
 * Achievements & badges section — lazily fetches the full badge list for this
 * profile and renders earned (gold) / locked (muted) pills in two groups.
 */
function BadgesSection({ profile }: { profile: ProfileResponse }) {
  const profileKey = profile.x_username || String(profile.user_id);
  const { data, isLoading } = useQuery({
    queryKey: ["badges", profileKey],
    queryFn: () =>
      api.profiles.badges(profile.x_username || profile.user_id),
    retry: false,
    staleTime: 60_000,
  });

  const earnedBadges = (data?.badges ?? []).filter((b) => b.earned);
  const lockedBadges = (data?.badges ?? []).filter((b) => !b.earned);

  return (
    <>
      <SectionHeader icon={Award} title="Achievements & Badges" />
      <div
        data-testid="achievements-card"
        className="rounded-xl bg-card shadow-card p-5"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {earnedBadges.length > 0 && (
              <div className="mb-5">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Earned · {earnedBadges.length}
                </div>
                <div className="flex flex-wrap gap-2">
                  {earnedBadges.map((b) => (
                    <BadgePill key={b.key} badge={b} />
                  ))}
                </div>
              </div>
            )}
            {lockedBadges.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Locked · {lockedBadges.length}
                </div>
                <div className="flex flex-wrap gap-2">
                  {lockedBadges.map((b) => (
                    <BadgePill key={b.key} badge={b} />
                  ))}
                </div>
              </div>
            )}
            {earnedBadges.length === 0 && lockedBadges.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No badges available.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

const CONVICTION_LABELS: Record<string, string> = {
  low: "Low conviction",
  medium: "Medium conviction",
  high: "High conviction",
};

function ConvictionBadge({ conviction }: { conviction: string | null }) {
  if (!conviction || !CONVICTION_LABELS[conviction]) return null;
  const cls =
    conviction === "high"
      ? "border-accent/60 text-accent"
      : conviction === "medium"
        ? "border-border text-foreground"
        : "border-border text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-wider border whitespace-nowrap",
        cls,
      )}
    >
      {CONVICTION_LABELS[conviction]}
    </span>
  );
}

/** Live % move since the call, or a muted em-dash when no fresh price. */
function CalloutResultValue({ result }: { result: CalloutResult | null }) {
  if (!result || result.pnlPercent == null) {
    return <span className="font-mono text-sm text-muted-foreground">—</span>;
  }
  const v = result.pnlPercent;
  return (
    <span className={cn("font-mono text-sm font-semibold", pnlColor(v))}>
      {v >= 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

/** One labelled snapshot/performance cell in a callout card. */
function StatBox({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="border border-border bg-secondary/30 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-mono text-sm truncate",
          valueClass ?? "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/** Owner-only: append an immutable follow-up note to one of their own calls. */
function AddUpdateForm({
  calloutId,
  profileKey,
}: {
  calloutId: number;
  profileKey: string;
}) {
  const [content, setContent] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: () => api.callouts.addUpdate(calloutId, content.trim()),
    onSuccess: () => {
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["callouts", profileKey] });
    },
    onError: (e) =>
      toast({
        title: "Couldn't add update",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (content.trim()) mutation.mutate();
      }}
      className="mt-3 flex items-stretch"
    >
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={CALLOUT_UPDATE_MAX}
        placeholder="Add an update…"
        data-testid={`input-callout-update-${calloutId}`}
        className="flex-1 h-9 rounded-l-2xl bg-secondary/40 border border-r-0 border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
      />
      <button
        type="submit"
        disabled={!content.trim() || mutation.isPending}
        data-testid={`button-callout-update-${calloutId}`}
        className="inline-flex items-center justify-center h-9 w-11 rounded-r-2xl bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50 flex-shrink-0"
      >
        {mutation.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </button>
    </form>
  );
}

/** A single immutable callout card with its update trail and live result. */
function CalloutCard({
  callout,
  isOwner,
  profileKey,
}: {
  callout: CalloutWithDetail;
  isOwner: boolean;
  profileKey: string;
}) {
  return (
    <div
      data-testid={`card-callout-${callout.id}`}
      className="rounded-3xl bg-card shadow-card p-4"
    >
      {/* Header: token identity + timestamp */}
      <div className="flex items-start gap-3">
        {callout.token_logo ? (
          <img
            src={callout.token_logo}
            alt=""
            className="w-9 h-9 object-cover flex-shrink-0"
            onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          />
        ) : (
          <div className="w-9 h-9 bg-secondary flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0">
            {callout.token_symbol?.slice(0, 2) ?? "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/?token=${callout.token_mint}`}
              className="text-sm font-semibold text-foreground truncate hover:text-accent transition-colors"
            >
              {callout.token_symbol || shortAddr(callout.token_mint)}
            </Link>
            {callout.token_name && (
              <span className="text-xs text-muted-foreground truncate">
                {callout.token_name}
              </span>
            )}
            <ConvictionBadge conviction={callout.conviction} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            {timeAgo(callout.created_at)}
          </div>
        </div>
      </div>

      {/* Original thesis */}
      {callout.thesis && (
        <p className="mt-3 text-sm text-foreground whitespace-pre-wrap break-words">
          {callout.thesis}
        </p>
      )}

      {/* Entry snapshot + live performance */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatBox
          label="Called MC"
          value={
            callout.call_market_cap != null
              ? fmtMarketCap(callout.call_market_cap)
              : "—"
          }
        />
        <StatBox
          label="Current MC"
          value={fmtMarketCap(callout.result?.currentMarketCapUsd ?? null)}
        />
        <div className="border border-border bg-secondary/30 p-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Result
          </div>
          <div className="mt-0.5">
            <CalloutResultValue result={callout.result} />
          </div>
        </div>
        <StatBox
          label="Entry Price"
          value={
            callout.call_price_usd != null
              ? fmtPrice(callout.call_price_usd)
              : "—"
          }
        />
        <StatBox
          label="Current X"
          value={fmtMultiple(callout.result?.currentMultiple ?? null)}
          valueClass={multipleTone(callout.result?.currentMultiple ?? null)}
        />
        <StatBox
          label="ATH X"
          value={fmtMultiple(callout.result?.athMultiple ?? null)}
          valueClass={multipleTone(callout.result?.athMultiple ?? null)}
        />
      </div>

      {/* Append-only update trail */}
      {callout.updates.length > 0 && (
        <div className="mt-3 border-l-2 border-border pl-3 space-y-2">
          {callout.updates.map((u) => (
            <div key={u.id} data-testid={`callout-update-${u.id}`}>
              <div className="text-[11px] text-muted-foreground font-mono">
                {timeAgo(u.created_at)}
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                {u.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {isOwner && (
        <AddUpdateForm calloutId={callout.id} profileKey={profileKey} />
      )}
    </div>
  );
}

/** Owner-only: collapsible composer to make a new, immutable call. */
function NewCallForm({ profileKey }: { profileKey: string }) {
  const [open, setOpen] = useState(false);
  const [mint, setMint] = useState<string | null>(null);
  const [thesis, setThesis] = useState("");
  const [conviction, setConviction] = useState<Conviction | "">("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      api.callouts.create({
        tokenMint: mint!,
        thesis: thesis.trim(),
        conviction: conviction || null,
      }),
    onSuccess: () => {
      setMint(null);
      setThesis("");
      setConviction("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["callouts", profileKey] });
      toast({ title: "Call recorded", description: "It's now on the record — permanent and immutable." });
    },
    onError: (e) =>
      toast({
        title: "Couldn't record call",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="button-new-call"
        className="mb-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-2xl bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
      >
        <Plus className="w-4 h-4" />
        New call
      </button>
    );
  }

  const canSubmit = !!mint && !!thesis.trim() && !mutation.isPending;

  return (
    <div className="mb-3 rounded-xl bg-card shadow-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">New call</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          data-testid="button-cancel-call"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      {mint ? (
        <div className="flex items-center justify-between gap-2 border border-border bg-secondary/30 px-3 h-10">
          <span className="font-mono text-sm text-foreground truncate">
            {shortAddr(mint, 6)}
          </span>
          <button
            type="button"
            onClick={() => setMint(null)}
            data-testid="button-change-token"
            className="text-xs text-muted-foreground hover:text-accent transition-colors flex-shrink-0"
          >
            Change
          </button>
        </div>
      ) : (
        <TokenSearch onSelect={(m) => setMint(m)} placeholder="Search a token to call" />
      )}

      <textarea
        value={thesis}
        onChange={(e) => setThesis(e.target.value)}
        maxLength={CALLOUT_THESIS_MAX}
        rows={3}
        placeholder="Your thesis — why this call?"
        data-testid="input-call-thesis"
        className="w-full bg-secondary/40 border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors resize-none"
      />
      <div className="flex items-center justify-between gap-2">
        <select
          value={conviction}
          onChange={(e) => setConviction(e.target.value as Conviction | "")}
          data-testid="select-conviction"
          className="h-9 bg-secondary/40 border border-border px-2 text-sm text-foreground focus:outline-none focus:border-accent"
        >
          <option value="">Conviction…</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <span className="text-[11px] text-muted-foreground font-mono">
          {thesis.length}/{CALLOUT_THESIS_MAX}
        </span>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Lock className="w-3 h-3 flex-shrink-0" />
        Calls are permanent — no edits or deletes once recorded.
      </div>

      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={!canSubmit}
        data-testid="button-submit-call"
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-2xl bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50"
      >
        {mutation.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Plus className="w-4 h-4" />
        )}
        Record call
      </button>
    </div>
  );
}

/** Aggregated caller reputation — derived live from this trader's callouts. */
function CallerStatsSection({ profile }: { profile: ProfileResponse }) {
  const key = profile.x_username || String(profile.user_id);
  const { data, isLoading } = useQuery({
    queryKey: ["caller-stats", key],
    queryFn: () => api.callouts.callerStats(profile.x_username || profile.user_id),
    enabled: !!profile,
    retry: false,
  });
  const stats = data?.stats ?? null;

  return (
    <>
      <SectionHeader icon={Megaphone} title="Caller Stats" />
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : !stats || stats.callsMade === 0 ? (
        <div
          data-testid="caller-stats-empty"
          className="rounded-xl bg-card shadow-card p-5 text-center"
        >
          <p className="text-sm text-muted-foreground">No Calls Yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatTile label="Total Calls" value={String(stats.callsMade)} />
          <StatTile
            label="Winning Calls"
            value={String(
              stats.gradedCalls > 0
                ? Math.round(stats.hitRate * stats.gradedCalls)
                : 0,
            )}
          />
          <StatTile
            label="Win Rate"
            value={
              stats.gradedCalls > 0
                ? fmtPercent(stats.hitRate * 100, 0)
                : "—"
            }
          />
          <StatTile
            label="Avg Multiple"
            value={stats.avgMultiple != null ? fmtMultiple(stats.avgMultiple) : "—"}
          />
          {stats.bestCall ? (
            <Link
              href={`/?token=${stats.bestCall.token_mint}`}
              className="col-span-2 md:col-span-4 block rounded-xl border border-border bg-secondary/30 p-3 hover:border-accent/60 transition-colors"
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Best Call
              </div>
              <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-sm font-semibold text-foreground truncate">
                  {stats.bestCall.token_symbol ||
                    shortAddr(stats.bestCall.token_mint, 4)}
                </span>
                <span
                  className={cn(
                    "font-mono text-sm font-semibold",
                    multipleTone(stats.bestCall.multiple),
                  )}
                >
                  {fmtMultiple(stats.bestCall.multiple)}
                </span>
                {stats.bestCall.athMultiple != null && (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    ATH {fmtMultiple(stats.bestCall.athMultiple)}
                  </span>
                )}
              </div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                {fmtMarketCap(stats.bestCall.calledMarketCapUsd ?? null)}
                {" → "}
                {fmtMarketCap(stats.bestCall.currentMarketCapUsd ?? null)}
              </div>
            </Link>
          ) : (
            <StatTile label="Best Call" value="—" />
          )}
        </div>
      )}
    </>
  );
}

const THESIS_SENTIMENT: Record<string, { label: string; cls: string }> = {
  bullish: { label: "Bullish", cls: "border-success/40 text-success" },
  bearish: { label: "Bearish", cls: "border-destructive/40 text-destructive" },
  neutral: { label: "Neutral", cls: "border-border text-muted-foreground" },
};

/** A single standalone thesis card — research, not graded as a call. */
function ThesisCard({ thesis }: { thesis: ThesisWithAuthor }) {
  const sent = THESIS_SENTIMENT[thesis.sentiment] ?? THESIS_SENTIMENT.neutral;
  return (
    <div
      data-testid={`card-thesis-${thesis.id}`}
      className="rounded-xl bg-card shadow-card p-4"
    >
      <div className="flex items-start gap-3">
        {thesis.token_logo ? (
          <img
            src={thesis.token_logo}
            alt=""
            className="w-9 h-9 object-cover flex-shrink-0"
            onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          />
        ) : (
          <div className="w-9 h-9 bg-secondary flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0">
            {thesis.token_symbol?.slice(0, 2) ?? "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">
              {thesis.token_symbol || shortAddr(thesis.token_mint)}
            </span>
            <span
              className={cn(
                "inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-wider border whitespace-nowrap",
                sent.cls,
              )}
            >
              {sent.label}
            </span>
            {thesis.conviction && (
              <ConvictionBadge conviction={thesis.conviction} />
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            {timeAgo(thesis.created_at)}
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm font-semibold text-foreground break-words">
        {thesis.title}
      </p>
      <p className="mt-1 text-sm text-foreground/90 whitespace-pre-wrap break-words">
        {thesis.content}
      </p>
    </div>
  );
}

/**
 * Standalone research theses — separate from Call History and NOT graded
 * against caller reputation.
 */
function ThesisHistorySection({ profile }: { profile: ProfileResponse }) {
  const { data, isLoading } = useQuery({
    queryKey: ["theses", profile.x_username || String(profile.user_id)],
    queryFn: () =>
      api.theses.getByUser(profile.x_username || profile.user_id),
    enabled: !!profile,
    retry: false,
  });
  const theses = data?.theses ?? [];

  return (
    <>
      <SectionHeader icon={ScrollText} title="Thesis History" />
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : theses.length === 0 ? (
        <PlaceholderCard
          kind="thesis"
          icon={ScrollText}
          title={profile.isSelf ? "Publish your first thesis" : "No theses yet"}
          body="Standalone research theses live here — they're separate from calls and don't affect caller reputation."
        />
      ) : (
        <div className="space-y-3" data-testid="list-theses">
          {theses.map((t) => (
            <ThesisCard key={t.id} thesis={t} />
          ))}
        </div>
      )}
    </>
  );
}

/** Real, immutable call history — newest first, with owner controls. */
function CallHistorySection({ profile }: { profile: ProfileResponse }) {
  const key = profile.x_username || String(profile.user_id);
  const { data, isLoading } = useQuery({
    queryKey: ["callouts", key],
    queryFn: () => api.callouts.list(profile.x_username || profile.user_id),
    enabled: !!profile,
    retry: false,
  });
  const callouts = data?.callouts ?? [];

  return (
    <>
      <SectionHeader icon={History} title="Call History" />
      {profile.isSelf && <NewCallForm profileKey={key} />}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : callouts.length === 0 ? (
        <PlaceholderCard
          kind="callout"
          icon={History}
          title={
            profile.isSelf ? "Make your first call" : "No calls yet"
          }
          body="Every on-the-record callout is listed here — permanent and immutable, with no edits or deletes."
        />
      ) : (
        <div className="space-y-3" data-testid="list-callouts">
          {callouts.map((c) => (
            <CalloutCard
              key={c.id}
              callout={c}
              isOwner={profile.isSelf}
              profileKey={key}
            />
          ))}
        </div>
      )}
    </>
  );
}

type PerfWindow = "30d" | "90d" | "all";

const perfTabs: { id: PerfWindow; label: string }[] = [
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
  { id: "all", label: "All Time" },
];

/** Period-filtered call performance (30D / 90D / All-time), graded live. */
function PerformanceSection({ profile }: { profile: ProfileResponse }) {
  const [win, setWin] = useState<PerfWindow>("30d");
  const key = profile.x_username || String(profile.user_id);

  const { data, isLoading } = useQuery({
    queryKey: ["performance", key],
    queryFn: () =>
      api.profiles.performance(profile.x_username || profile.user_id),
    retry: false,
    staleTime: 60_000,
  });

  const perf: PeriodPerformance | null = data
    ? win === "30d"
      ? data.performance.window30d
      : win === "90d"
        ? data.performance.window90d
        : data.performance.all
    : null;

  return (
    <>
      <SectionHeader icon={Activity} title="Call Performance" />
      <FilterPills
        options={perfTabs}
        value={win}
        onChange={(id) => setWin(id)}
        size="sm"
        ariaLabel="Performance window"
        testIdPrefix="perf-window"
        className="mb-3"
      />
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : !perf || perf.totalCalls === 0 ? (
        <div
          data-testid="performance-empty"
          className="rounded-xl bg-card shadow-card text-center py-10 px-6"
        >
          <p className="text-foreground font-medium mb-1">No calls in this window</p>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Calls made in the selected period are graded live and summarized here.
          </p>
        </div>
      ) : (
        <div data-testid="performance-card">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatTile label="Total Calls" value={String(perf.totalCalls)} />
            <StatTile label="Graded" value={String(perf.gradedCalls)} />
            <StatTile
              label="Win Rate"
              value={`${perf.winRate.toFixed(0)}%`}
              cls={perf.winRate >= 60 ? "text-emerald-400" : undefined}
            />
            <StatTile
              label="Avg Return"
              value={
                perf.avgReturnPercent == null
                  ? "—"
                  : fmtPercent(perf.avgReturnPercent, 0)
              }
              cls={
                perf.avgReturnPercent != null
                  ? pnlColor(perf.avgReturnPercent)
                  : undefined
              }
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            <PerfCallTile label="Best Call" call={perf.bestCall} />
            <PerfCallTile label="Worst Call" call={perf.worstCall} />
          </div>
        </div>
      )}
    </>
  );
}

function PerfCallTile({
  label,
  call,
}: {
  label: string;
  call: PeriodPerformance["bestCall"];
}) {
  return (
    <div className="rounded-xl bg-card shadow-card p-4">
      <div className="stat-label">{label}</div>
      {call ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="font-medium text-foreground truncate">
            {call.token_symbol || shortAddr(call.token_mint, 4)}
          </span>
          <span
            className={cn("font-mono text-lg", pnlColor(call.returnPercent))}
          >
            {fmtPercent(call.returnPercent, 0)}
          </span>
        </div>
      ) : (
        <div className="stat-value mt-1.5 text-lg text-muted-foreground">—</div>
      )}
    </div>
  );
}

/**
 * Forward-looking profile surfaces. These mirror the planned BlackPebble
 * reputation architecture (Recovery, Paper Trading, Campaigns, BlackPebble
 * Score) but carry NO logic yet — they render disabled "Coming soon" tiles so
 * the layout and information architecture are set ahead of the engines.
 */
function ScaffoldTile({ label }: { label: string }) {
  return (
    <div className="rounded-xl bg-card/50 border border-dashed border-border p-4">
      <div className="stat-label">{label}</div>
      <div className="stat-value mt-1.5 text-lg text-muted-foreground/50">—</div>
    </div>
  );
}

function ScaffoldSection({
  icon,
  title,
  fields,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  fields: string[];
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-2 mt-6">
        <div className="flex items-center gap-2">
          {(() => {
            const Icon = icon;
            return <Icon className="w-4 h-4 text-accent" />;
          })()}
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            {title}
          </h2>
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] text-accent/80">
          Coming soon
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {fields.map((f) => (
          <ScaffoldTile key={f} label={f} />
        ))}
      </div>
    </>
  );
}

function FutureScaffolding() {
  return (
    <>
      <ScaffoldSection
        icon={Wallet}
        title="SOL Recovery"
        fields={["SOL Recovered", "Accounts Closed", "Recovery Rank", "Wallet Health"]}
      />
      <ScaffoldSection
        icon={Coins}
        title="Paper Trading"
        fields={["ROI", "Trader Rank", "Best Trade", "Trade Count"]}
      />
      <ScaffoldSection
        icon={Swords}
        title="Campaigns"
        fields={["Participation", "Raider Score", "Wins", "Rewards"]}
      />
      <ScaffoldSection
        icon={Gem}
        title="BlackPebble Score"
        fields={["Overall Score", "Percentile", "Components", "Trend"]}
      />
    </>
  );
}

/** Share this profile to X / Telegram, or copy a link. */
function ShareCard({ profile }: { profile: ProfileResponse }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handle = profile.x_username?.trim().replace(/^@+/, "") || null;
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}`
      : "";
  const name = profile.x_display_name || (handle ? `@${handle}` : "this trader");
  const trust = profile.trustScore?.score;
  const text =
    trust != null
      ? `Check out ${name} on BlackPebble — Trust Score ${trust}.`
      : `Check out ${name} on BlackPebble.`;

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    text,
  )}&url=${encodeURIComponent(url)}`;
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(
    url,
  )}&text=${encodeURIComponent(text)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({
        title: "Couldn't copy link",
        description: "Copy the address from your browser instead.",
        variant: "destructive",
      });
    }
  }

  const btn =
    "inline-flex items-center justify-center gap-1.5 rounded-lg bg-card shadow-card px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-3 transition-colors";

  return (
    <>
      <SectionHeader icon={Share2} title="Share Profile" />
      <div className="grid grid-cols-3 gap-2">
        <a
          href={xUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="share-x"
          className={btn}
        >
          <CloseIcon className="w-4 h-4" />
          Post
        </a>
        <a
          href={tgUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="share-telegram"
          className={btn}
        >
          <Send className="w-4 h-4" />
          Telegram
        </a>
        <button
          type="button"
          onClick={copy}
          data-testid="share-copy"
          className={btn}
        >
          {copied ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </>
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
        <div className="rounded-2xl bg-card shadow-card text-center py-16 px-6">
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
  const profileUrl = xProfileUrl(profile.x_username);
  const stats = profile.stats;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-6">
      {/* Header */}
      <div className="rounded-2xl bg-card shadow-card p-5 md:p-6">
        <UserIdentity
          size="lg"
          align="start"
          nameAs="h1"
          testIdName="text-profile-name"
          avatarUrl={profile.x_avatar_url}
          displayName={profile.x_display_name}
          handle={profile.x_username}
          officialBadges={profile.officialBadges}
          tier={profile.graduationTier}
          tierPosition="inline"
          badgePosition="row"
          stopPropagation={false}
          handleLink={
            profileUrl ? { type: "external", href: profileUrl } : undefined
          }
          handleTestId="link-view-on-x"
          onHandleClick={() => trackXProfileLinkClicked()}
          handleTrailing={
            profile.rank != null ? (
              <span className="font-mono text-sm text-muted-foreground">
                Rank #{profile.rank}
              </span>
            ) : undefined
          }
        >
          {/* Bio: directly under avatar/name/handle (owner can edit inline) */}
          <BioSection profile={profile} />

          {/* Off-platform links as compact icon pills (owner can edit inline) */}
          <SocialLinks profile={profile} />

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
        </UserIdentity>
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
        <StatTile label="Tier" value={tierMeta(stats.graduationTier).name} />
      </div>

      {/* Reputation card: real X account data + BlackPebble metric placeholders */}
      <XReputationSection profile={profile} />

      {/* Caller Stats (real, derived from callouts) */}
      <CallerStatsSection profile={profile} />

      {/* Period-filtered call performance (30D / 90D / All) */}
      <PerformanceSection profile={profile} />

      {/* Call History (real, immutable) */}
      <CallHistorySection profile={profile} />

      {/* Thesis History (real, standalone research — not graded as calls) */}
      <ThesisHistorySection profile={profile} />

      {/* Achievements & Badges (placeholder) */}
      <BadgesSection profile={profile} />

      {/* Forward-looking reputation surfaces (no logic yet) */}
      <FutureScaffolding />

      {/* Share this profile */}
      <ShareCard profile={profile} />
    </div>
  );
}

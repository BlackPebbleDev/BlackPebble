import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Award,
  Check,
  ChevronDown,
  Copy,
  History,
  Loader2,
  Lock,
  Megaphone,
  Pencil,
  Plus,
  ScrollText,
  Search,
  Send,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  UserCheck,
  X as CloseIcon,
} from "lucide-react";
import {
  api,
  CALLOUT_THESIS_MAX,
  CALLOUT_UPDATE_MAX,
  type BadgeCategory,
  type BadgeEntry,
  type BadgeRarity,
  type CalloutResult,
  type CalloutWithDetail,
  type Conviction,
  type ProfileResponse,
  type ThesisWithAuthor,
} from "@/lib/api";
import { UserIdentity } from "@/components/user-identity";
import { ImageLightbox } from "@/components/image-lightbox";
import {
  AchievementBadge,
  RARITY_META,
  rarityOf,
} from "@/components/achievement-badge";
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
import {
  ProfileIdentityMeta,
  SOCIAL_DEFS,
} from "@/components/profile-identity";
import { TokenSearch } from "@/components/token-search";
import { PlaceholderCard } from "@/components/feed-card";
import {
  trackProfileView,
  trackFollowCreated,
  trackFollowRemoved,
} from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

/** Dark-glass panel wrapper used by the compact profile stat sections. */
function PanelCard({
  children,
  testId,
  className,
}: {
  children: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn("rounded-2xl bg-card shadow-card p-4 md:p-5", className)}
    >
      {children}
    </div>
  );
}

/**
 * Compact stat row: muted label on the left, strong value on the right. This is
 * the workhorse of the trader-resume layout, packing more numbers per screen
 * than the old square stat tiles. Rows are meant to sit inside a
 * `divide-y divide-border/60` list.
 */
function StatRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right font-mono text-sm font-semibold tabular-nums text-foreground",
          valueClass,
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * X profile banner hero - same click-to-expand treatment as the Token Page
 * banner (rounded card, hover overlay, fullscreen ImageLightbox on tap).
 * Falls back to a subtle premium gradient when the user has no X banner set
 * (most accounts), so the page never shows empty/broken space.
 */
function ProfileBannerFallback() {
  return (
    <div
      aria-hidden="true"
      data-testid="profile-banner-fallback"
      className="rounded-xl h-28 md:h-36 bg-gradient-to-r from-accent/10 via-card to-accent/5 border border-border/50"
    />
  );
}

function ProfileBanner({ profile }: { profile: ProfileResponse }) {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const banner = profile.x_banner_url;

  // No banner at all, or the image failed to load (dead/expired URL,
  // hotlink block, etc.) - show the premium fallback hero instead of a
  // blank or broken image. The page should never look broken.
  if (!banner || failed) {
    return <ProfileBannerFallback />;
  }

  const label = `${profile.x_display_name ?? profile.x_username}'s profile banner`;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => loaded && setExpanded(true)}
        onKeyDown={(e) => {
          if (loaded && (e.key === "Enter" || e.key === " ")) setExpanded(true);
        }}
        data-testid="button-expand-profile-banner"
        aria-label="Expand profile banner image"
        className="group relative rounded-xl overflow-hidden bg-card shadow-card cursor-zoom-in aspect-[3/1] md:aspect-[17/5]"
      >
        {/* Shimmer skeleton while the image loads, faded out once ready. */}
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-0 bg-gradient-to-r from-secondary/40 via-secondary/70 to-secondary/40 animate-pulse transition-opacity duration-300",
            loaded ? "opacity-0" : "opacity-100",
          )}
        />
        <img
          src={banner}
          alt={label}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "w-full h-full object-cover block select-none transition-opacity duration-300 group-hover:scale-[1.015]",
            loaded ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionProperty: "opacity, transform" }}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />
      </div>
      <ImageLightbox
        src={banner}
        alt={label}
        open={expanded}
        onClose={() => setExpanded(false)}
      />
    </>
  );
}

/**
 * Frontend bio limit for the compact profile hero. Kept well under the server
 * cap (BIO_MAX_LENGTH = 250) so a bio reads like a short trader tagline, not a
 * paragraph, and always fits the card. The backend still accepts anything up to
 * its own limit, so this is purely a stricter client constraint (no schema
 * change). Existing longer bios stay contained via clamping on display.
 */
const PROFILE_BIO_MAX = 50;

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
    const remaining = PROFILE_BIO_MAX - draft.length;
    return (
      <div className="mt-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, PROFILE_BIO_MAX))}
          maxLength={PROFILE_BIO_MAX}
          rows={3}
          autoFocus
          data-testid="textarea-bio"
          placeholder="Add a short bio (plain text only)"
          className="w-full resize-none rounded-xl bg-secondary/30 border border-border/60 p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
        />
        <div className="flex items-center justify-between mt-2">
          <span
            className={cn(
              "text-[10px] font-mono",
              remaining < 0 ? "text-danger" : "text-muted-foreground/60",
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
          className="min-w-0 max-w-full flex-1 text-sm text-foreground/90 break-words [overflow-wrap:anywhere] line-clamp-2 md:line-clamp-3"
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

  // Empty state: keep the card clean. Visitors see nothing (no cheap "No bio
  // yet" filler); the owner gets a single subtle affordance to add one.
  if (!profile.isSelf) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        data-testid="button-bio-add"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent transition-colors"
      >
        <Pencil className="w-3 h-3" />
        Add a bio
      </button>
    </div>
  );
}

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

/**
 * Trader Snapshot: the identity headline directly under the hero. BlackPebble
 * Score is a brand-owned slot, but no real score field exists on the profile
 * payload yet, so it shows a safe "Soon" placeholder rather than reusing Trust
 * Score or inventing a number. Trust Score stays its own distinct stat.
 * Everything else is real profile data.
 */
function TraderSnapshotSection({
  profile,
  solUsd,
}: {
  profile: ProfileResponse;
  solUsd: number;
}) {
  const trustScore = profile.trustScore?.score ?? 0;
  const trustLabel =
    profile.trustScore?.label ?? trustLabelFromScore(trustScore);
  const rankLabel = tradingRankLabel(profile);
  const s = profile.stats;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          Trader Snapshot
        </h2>
      </div>
      <PanelCard testId="trader-snapshot">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-accent/25 bg-accent/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              BlackPebble Score
            </div>
            <div
              data-testid="blackpebble-score"
              className="mt-1 font-mono text-2xl font-bold text-accent"
            >
              Soon
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground/70">
              Overall trader identity
            </div>
          </div>
          <div className="rounded-xl bg-secondary/30 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Trust Score
            </div>
            <div className="mt-1 flex items-baseline gap-2 flex-wrap">
              <span className="font-mono text-2xl font-bold text-foreground">
                {trustScore}
              </span>
              <TrustBadge
                score={trustScore}
                label={trustLabel}
                size="xs"
                showLabel
              />
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground/70">
              Reputation and credibility
            </div>
          </div>
        </div>
        <div className="mt-3 divide-y divide-border/60">
          <StatRow
            label="Trading Rank"
            value={rankLabel}
            valueClass="text-accent"
          />
          <StatRow
            label="Tier"
            value={tierMeta(s.graduationTier).name}
            valueClass="text-accent"
          />
          <StatRow
            label="ROI"
            value={fmtPercent(s.roiPercent)}
            valueClass={pnlColor(s.roiPercent)}
          />
          <StatRow
            label="Total P&L"
            value={
              <PnlAmount sol={s.totalPnlSol} solUsd={solUsd} unit={false} />
            }
            valueClass={pnlColor(s.totalPnlSol)}
          />
          <StatRow label="Win Rate" value={`${s.winRate.toFixed(1)}%`} />
        </div>
      </PanelCard>
    </div>
  );
}

/** Trading Behavior: trade-level detail that complements the snapshot. */
function TradingBehaviorSection({
  profile,
  solUsd,
}: {
  profile: ProfileResponse;
  solUsd: number;
}) {
  const s = profile.stats;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          Trading Behavior
        </h2>
      </div>
      <PanelCard testId="trading-behavior">
        <div className="divide-y divide-border/60">
          <StatRow label="Closed Trades" value={String(s.closedTrades)} />
          <StatRow label="Executions" value={String(s.totalExecutions)} />
          <StatRow
            label="Best Trade"
            value={<PnlAmount sol={s.bestTrade} solUsd={solUsd} unit={false} />}
            valueClass={pnlColor(s.bestTrade)}
          />
          <StatRow
            label="Realized P&L"
            value={
              <PnlAmount sol={s.realizedPnlSol} solUsd={solUsd} unit={false} />
            }
            valueClass={pnlColor(s.realizedPnlSol)}
          />
        </div>
      </PanelCard>
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

const RARITY_ORDER: BadgeRarity[] = ["legendary", "epic", "rare", "common"];

const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  trading: "Trading",
  profit: "Profit",
  caller: "Calls",
  thesis: "Research",
  wallet: "Wallet Utilities",
  community: "Community",
  profile: "Profile",
  milestone: "Milestones",
  special: "Special",
};

const CATEGORY_ORDER: BadgeCategory[] = [
  "trading",
  "profit",
  "caller",
  "thesis",
  "wallet",
  "community",
  "profile",
  "milestone",
  "special",
];

type StatusFilter = "all" | "earned" | "locked";
type RarityFilter = BadgeRarity | "all";
type CategoryFilter = BadgeCategory | "all";
type BadgeSort = "rarity" | "recent" | "progress" | "name";

const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "earned", label: "Earned" },
  { id: "locked", label: "Locked" },
];

const SORT_OPTIONS: { id: BadgeSort; label: string }[] = [
  { id: "rarity", label: "Rarity" },
  { id: "recent", label: "Recent" },
  { id: "progress", label: "Progress" },
  { id: "name", label: "Name" },
];

/** Sort comparator: earned tiles always precede locked, then by chosen key. */
function compareBadges(a: BadgeEntry, b: BadgeEntry, sort: BadgeSort): number {
  if (a.earned !== b.earned) return a.earned ? -1 : 1;
  switch (sort) {
    case "recent":
      return (b.earnedAt ?? 0) - (a.earnedAt ?? 0);
    case "name":
      return a.name.localeCompare(b.name);
    case "progress": {
      const ratio = (x: BadgeEntry) =>
        x.earned
          ? 1
          : x.progress && x.progress.target > 0
            ? x.progress.current / x.progress.target
            : 0;
      return ratio(b) - ratio(a);
    }
    case "rarity":
    default: {
      const ra = RARITY_ORDER.indexOf(rarityOf(a));
      const rb = RARITY_ORDER.indexOf(rarityOf(b));
      if (ra !== rb) return ra - rb;
      return (b.earnedAt ?? 0) - (a.earnedAt ?? 0);
    }
  }
}

/**
 * Achievements section - lazily fetches the full badge list for this profile and
 * renders a collectible-style view: a summary (progress + rarity breakdown), a
 * grid of earned collectible tiles, and the locked set tucked behind an
 * expandable toggle so the section stays compact by default.
 */
function BadgesSection({ profile }: { profile: ProfileResponse }) {
  const profileKey = profile.x_username || String(profile.user_id);
  const { toast } = useToast();
  const [showLocked, setShowLocked] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [rarity, setRarity] = useState<RarityFilter>("all");
  const [sort, setSort] = useState<BadgeSort>("rarity");
  // Keys to briefly shimmer after a fresh unlock (self profile only).
  const [justUnlocked, setJustUnlocked] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["badges", profileKey],
    queryFn: () =>
      api.profiles.badges(profile.x_username || profile.user_id),
    retry: false,
    staleTime: 60_000,
  });

  const allBadges = data?.badges ?? [];
  // Hidden achievements stay invisible until earned - never reveal the locked
  // tile (no name, no hint). Everything else is part of the visible catalogue.
  const visibleBadges = allBadges.filter((b) => b.earned || !b.hidden);
  const earnedBadges = visibleBadges.filter((b) => b.earned);
  const lockedBadges = visibleBadges.filter((b) => !b.earned);
  const total = visibleBadges.length;
  const earnedCount = earnedBadges.length;
  const pct = total > 0 ? Math.round((earnedCount / total) * 100) : 0;

  // Premium unlock celebration: diff the current earned set against what this
  // device has already seen for this user. Self profile only; first-ever load
  // seeds the baseline without celebrating the whole backlog.
  useEffect(() => {
    if (!profile.isSelf || !data) return;
    const storageKey = `bp_seen_achievements_${profile.user_id}`;
    const earnedKeys = (data.badges ?? [])
      .filter((b) => b.earned)
      .map((b) => b.key);
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(storageKey) || "[]");
    } catch {
      seen = [];
    }
    if (seen.length === 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(earnedKeys));
      } catch {
        /* storage unavailable - skip celebration baseline */
      }
      return;
    }
    const fresh = earnedKeys.filter((k) => !seen.includes(k));
    if (fresh.length === 0) return;
    setJustUnlocked(new Set(fresh));
    const firstName =
      (data.badges ?? []).find((b) => b.key === fresh[0])?.name ?? "";
    toast({
      title:
        fresh.length === 1
          ? "Achievement unlocked!"
          : `${fresh.length} achievements unlocked!`,
      description: fresh.length === 1 ? firstName : undefined,
    });
    try {
      localStorage.setItem(storageKey, JSON.stringify(earnedKeys));
    } catch {
      /* storage unavailable */
    }
    const t = setTimeout(() => setJustUnlocked(new Set()), 6000);
    return () => clearTimeout(t);
  }, [data, profile.isSelf, profile.user_id, toast]);

  // Share an earned achievement - copy a ready-to-post line to the clipboard.
  // Self profile only (copy is first-person). Guards the clipboard explicitly:
  // navigator.clipboard?.writeText resolves undefined when unavailable, so a
  // naive await would fire a false "Copied" toast.
  const handleShare = async (badge: BadgeEntry) => {
    const rarePct =
      badge.globalEarnedPercent != null
        ? ` · held by ${
            badge.globalEarnedPercent < 1
              ? badge.globalEarnedPercent.toFixed(1)
              : Math.round(badge.globalEarnedPercent)
          }% of traders`
        : "";
    const line = `I unlocked "${badge.name}" (${
      RARITY_META[rarityOf(badge)].label
    }) on BlackPebble${rarePct}.`;
    const url = `${window.location.origin}${window.location.pathname}`;
    const payload = `${line} ${url}`;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(payload);
        toast({ title: "Copied", description: "Share text copied to clipboard." });
        return;
      } catch {
        /* fall through to failure toast */
      }
    }
    toast({
      title: "Couldn't copy",
      description: "Clipboard isn't available here.",
      variant: "destructive",
    });
  };

  const rarityCounts = earnedBadges.reduce<Record<BadgeRarity, number>>(
    (acc, b) => {
      const r = rarityOf(b);
      acc[r] = (acc[r] ?? 0) + 1;
      return acc;
    },
    { common: 0, rare: 0, epic: 0, legendary: 0 },
  );

  // "Most recent unlock" - the earned badge with the latest timestamp.
  const mostRecent = earnedBadges.reduce<BadgeEntry | null>(
    (best, b) => ((b.earnedAt ?? 0) > (best?.earnedAt ?? -1) ? b : best),
    null,
  );
  // "Rarest" - lowest index in RARITY_ORDER wins (legendary first); ties are
  // broken by most-recently earned.
  const rarestRank = (b: BadgeEntry) => RARITY_ORDER.indexOf(rarityOf(b));
  const rarest = earnedBadges.reduce<BadgeEntry | null>((best, b) => {
    if (!best) return b;
    const rb = rarestRank(b);
    const rBest = rarestRank(best);
    if (rb !== rBest) return rb < rBest ? b : best;
    return (b.earnedAt ?? 0) > (best.earnedAt ?? 0) ? b : best;
  }, null);
  // Group earned badges into their collections for display.
  const earnedByCategory = earnedBadges.reduce<Record<string, BadgeEntry[]>>(
    (acc, b) => {
      (acc[b.category] ??= []).push(b);
      return acc;
    },
    {},
  );

  // Category pills are built from the collections actually present.
  const presentCategories = CATEGORY_ORDER.filter((c) =>
    visibleBadges.some((b) => b.category === c),
  );
  const categoryOptions = [
    { id: "all" as CategoryFilter, label: "All" },
    ...presentCategories.map((c) => ({
      id: c as CategoryFilter,
      label: CATEGORY_LABELS[c],
    })),
  ];

  const q = query.trim().toLowerCase();
  const filtersActive =
    q !== "" || category !== "all" || status !== "all" || rarity !== "all";
  const filtered = visibleBadges
    .filter((b) => {
      if (category !== "all" && b.category !== category) return false;
      if (status === "earned" && !b.earned) return false;
      if (status === "locked" && b.earned) return false;
      if (rarity !== "all" && rarityOf(b) !== rarity) return false;
      if (
        q &&
        !b.name.toLowerCase().includes(q) &&
        !b.description.toLowerCase().includes(q)
      )
        return false;
      return true;
    })
    .sort((a, b) => compareBadges(a, b, sort));

  const onShare = profile.isSelf ? handleShare : undefined;

  return (
    <>
      <SectionHeader icon={Award} title="Achievements" />
      <div
        data-testid="achievements-card"
        className="rounded-xl bg-card shadow-card p-5"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : total === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No achievements available.
          </p>
        ) : (
          <>
            {/* Achievement summary */}
            <div className="mb-5">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">
                  {earnedCount}
                  <span className="text-muted-foreground">
                    {" "}
                    of {total} unlocked
                  </span>
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {pct}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFilters((v) => !v)}
                    data-testid="toggle-achievement-filters"
                    aria-label="Filter achievements"
                    className={cn(
                      "rounded-full p-1.5 transition-colors",
                      showFilters || filtersActive
                        ? "bg-accent/10 text-accent"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/40">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {earnedCount > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {RARITY_ORDER.filter((r) => rarityCounts[r] > 0).map((r) => (
                    <span
                      key={r}
                      data-testid={`rarity-chip-${r}`}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        RARITY_META[r].chip,
                      )}
                    >
                      {rarityCounts[r]} {RARITY_META[r].label}
                    </span>
                  ))}
                </div>
              )}
              {earnedCount > 0 && (mostRecent || rarest) && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-secondary/30 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      Latest unlock
                    </div>
                    <div
                      data-testid="achievement-latest"
                      className="mt-0.5 truncate text-xs font-semibold text-foreground"
                    >
                      {mostRecent?.name ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-secondary/30 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      Rarest
                    </div>
                    <div
                      data-testid="achievement-rarest"
                      className="mt-0.5 flex items-center gap-1.5"
                    >
                      <span className="truncate text-xs font-semibold text-foreground">
                        {rarest?.name ?? "—"}
                      </span>
                      {rarest && (
                        <span
                          className={cn(
                            "flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                            RARITY_META[rarityOf(rarest)].chip,
                          )}
                        >
                          {RARITY_META[rarityOf(rarest)].label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Filter / search controls (collapsed by default for a clean view) */}
            {showFilters && (
              <div
                data-testid="achievement-filters"
                className="mb-5 space-y-3 rounded-xl border border-border/40 bg-secondary/10 p-3"
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search achievements"
                    data-testid="input-achievement-search"
                    className="w-full rounded-full border border-border bg-background py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-accent/50 focus:outline-none"
                  />
                </div>
                <FilterPills
                  options={categoryOptions}
                  value={category}
                  onChange={(id) => setCategory(id)}
                  size="sm"
                  ariaLabel="Filter by collection"
                  testIdPrefix="filter-category"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <FilterPills
                    options={STATUS_OPTIONS}
                    value={status}
                    onChange={(id) => setStatus(id)}
                    size="sm"
                    ariaLabel="Filter by status"
                    testIdPrefix="filter-status"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FilterPills
                    options={[
                      { id: "all" as RarityFilter, label: "All" },
                      ...RARITY_ORDER.map((r) => ({
                        id: r as RarityFilter,
                        label: RARITY_META[r].label,
                      })),
                    ]}
                    value={rarity}
                    onChange={(id) => setRarity(id)}
                    size="sm"
                    ariaLabel="Filter by rarity"
                    testIdPrefix="filter-rarity"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Sort
                  </span>
                  <FilterPills
                    options={SORT_OPTIONS}
                    value={sort}
                    onChange={(id) => setSort(id)}
                    size="sm"
                    ariaLabel="Sort achievements"
                    testIdPrefix="sort"
                  />
                </div>
              </div>
            )}

            {filtersActive ? (
              /* Flat filtered grid */
              filtered.length > 0 ? (
                <div
                  data-testid="achievement-filtered-grid"
                  className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5"
                >
                  {filtered.map((b) => (
                    <AchievementBadge
                      key={b.key}
                      badge={b}
                      onShare={onShare}
                      justUnlocked={justUnlocked.has(b.key)}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No achievements match these filters.
                </p>
              )
            ) : (
              <>
                {/* Earned collectible tiles, grouped by collection */}
                {earnedCount > 0 ? (
                  <div className="space-y-4">
                    {CATEGORY_ORDER.filter(
                      (c) => earnedByCategory[c]?.length,
                    ).map((c) => (
                      <div key={c}>
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                          {CATEGORY_LABELS[c]}
                        </div>
                        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
                          {earnedByCategory[c].map((b) => (
                            <AchievementBadge
                              key={b.key}
                              badge={b}
                              onShare={onShare}
                              justUnlocked={justUnlocked.has(b.key)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-2 text-center text-sm text-muted-foreground">
                    No achievements unlocked yet.
                  </p>
                )}

                {/* Locked, behind an expandable toggle */}
                {lockedBadges.length > 0 && (
                  <div className="mt-4 border-t border-border/40 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowLocked((v) => !v)}
                      data-testid="toggle-locked-achievements"
                      className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
                    >
                      <span>Locked · {lockedBadges.length}</span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform",
                          showLocked && "rotate-180",
                        )}
                      />
                    </button>
                    {showLocked && (
                      <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
                        {lockedBadges.map((b) => (
                          <AchievementBadge key={b.key} badge={b} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
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
      ? "border-accent/40 bg-accent/10 text-accent"
      : conviction === "medium"
        ? "border-border/70 bg-secondary/40 text-foreground"
        : "border-border/60 bg-secondary/30 text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider whitespace-nowrap",
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
    <div className="rounded-lg border border-border/60 bg-secondary/20 p-2">
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
      className="rounded-xl bg-card shadow-card p-4"
    >
      {/* Header: token identity + timestamp */}
      <div className="flex items-start gap-3">
        {callout.token_logo ? (
          <img
            src={callout.token_logo}
            alt=""
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0">
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

      {/* Live proof first (result / multiples), then entry context. Reads like
          a trading receipt: outcome up top, snapshot below. */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/60 bg-secondary/20 p-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Result
          </div>
          <div className="mt-0.5">
            <CalloutResultValue result={callout.result} />
          </div>
        </div>
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
        <StatBox
          label="Entry Price"
          value={
            callout.call_price_usd != null
              ? fmtPrice(callout.call_price_usd)
              : "—"
          }
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
      toast({ title: "Call recorded", description: "It's now on the record - permanent and immutable." });
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
        placeholder="Your thesis - why this call?"
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
        Calls are permanent - no edits or deletes once recorded.
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

/** Aggregated caller reputation - derived live from this trader's callouts. */
/**
 * Call Edge: one merged, compact view of caller reputation (formerly Caller
 * Stats) and graded call performance (formerly Call Performance), so the
 * profile shows call proof without two overlapping stat walls. All-time
 * figures. No grading or stat formulas changed.
 */
function CallEdgeSection({ profile }: { profile: ProfileResponse }) {
  const id = profile.x_username || profile.user_id;
  const key = profile.x_username || String(profile.user_id);
  const { data: csData, isLoading: csLoading } = useQuery({
    queryKey: ["caller-stats", key],
    queryFn: () => api.callouts.callerStats(id),
    enabled: !!profile,
    retry: false,
    staleTime: 60_000,
  });
  const { data: perfData, isLoading: perfLoading } = useQuery({
    queryKey: ["performance", key],
    queryFn: () => api.profiles.performance(id),
    enabled: !!profile,
    retry: false,
    staleTime: 60_000,
  });

  const cs = csData?.stats ?? null;
  const all = perfData?.performance.all ?? null;
  const totalCalls = cs?.callsMade ?? all?.totalCalls ?? 0;
  const gradedCalls = cs?.gradedCalls ?? all?.gradedCalls ?? 0;
  const isLoading = csLoading || perfLoading;

  const header = (
    <div className="flex items-center gap-2 mb-2">
      <Megaphone className="w-4 h-4 text-accent" />
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
        Call Edge
      </h2>
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {header}
        <PanelCard>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        </PanelCard>
      </div>
    );
  }

  if (totalCalls === 0) {
    return (
      <div>
        {header}
        <PanelCard testId="call-edge-empty">
          <p className="py-4 text-center text-sm text-muted-foreground">
            No calls yet.
          </p>
        </PanelCard>
      </div>
    );
  }

  const winningCalls =
    cs && gradedCalls > 0 ? Math.round(cs.hitRate * gradedCalls) : 0;
  const winRate =
    cs && gradedCalls > 0
      ? fmtPercent(cs.hitRate * 100, 0)
      : all && gradedCalls > 0
        ? `${all.winRate.toFixed(0)}%`
        : "—";

  return (
    <div>
      {header}
      <PanelCard testId="call-edge">
        <div className="divide-y divide-border/60">
          <StatRow label="Total Calls" value={String(totalCalls)} />
          <StatRow label="Winning Calls" value={String(winningCalls)} />
          <StatRow label="Win Rate" value={winRate} />
          <StatRow
            label="Avg Multiple"
            value={cs?.avgMultiple != null ? fmtMultiple(cs.avgMultiple) : "—"}
            valueClass={multipleTone(cs?.avgMultiple ?? null)}
          />
          <StatRow
            label="Avg Return"
            value={
              all?.avgReturnPercent != null
                ? fmtPercent(all.avgReturnPercent, 0)
                : "—"
            }
            valueClass={
              all?.avgReturnPercent != null
                ? pnlColor(all.avgReturnPercent)
                : undefined
            }
          />
        </div>

        {(cs?.bestCall || all?.worstCall) && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {cs?.bestCall && (
              <Link
                href={`/?token=${cs.bestCall.token_mint}`}
                data-testid="call-edge-best"
                className="block rounded-xl border border-border/60 bg-secondary/20 p-3 hover:border-accent/60 transition-colors"
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Best Call
                </div>
                <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-foreground truncate">
                    {cs.bestCall.token_symbol ||
                      shortAddr(cs.bestCall.token_mint, 4)}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-sm font-semibold",
                      multipleTone(cs.bestCall.multiple),
                    )}
                  >
                    {fmtMultiple(cs.bestCall.multiple)}
                  </span>
                  {cs.bestCall.athMultiple != null && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      ATH {fmtMultiple(cs.bestCall.athMultiple)}
                    </span>
                  )}
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {fmtMarketCap(cs.bestCall.calledMarketCapUsd ?? null)}
                  {" → "}
                  {fmtMarketCap(cs.bestCall.currentMarketCapUsd ?? null)}
                </div>
              </Link>
            )}
            {all?.worstCall && (
              <Link
                href={`/?token=${all.worstCall.token_mint}`}
                data-testid="call-edge-lowest"
                className="block rounded-xl border border-border/60 bg-secondary/20 p-3 hover:border-accent/60 transition-colors"
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Lowest Call
                </div>
                <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-foreground truncate">
                    {all.worstCall.token_symbol ||
                      shortAddr(all.worstCall.token_mint, 4)}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-sm font-semibold",
                      pnlColor(all.worstCall.returnPercent),
                    )}
                  >
                    {fmtPercent(all.worstCall.returnPercent, 0)}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Lowest graded return
                </div>
              </Link>
            )}
          </div>
        )}
      </PanelCard>
    </div>
  );
}

const THESIS_SENTIMENT: Record<string, { label: string; cls: string }> = {
  bullish: {
    label: "Bullish",
    cls: "border-success/40 bg-success/10 text-success",
  },
  bearish: {
    label: "Bearish",
    cls: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  neutral: {
    label: "Neutral",
    cls: "border-border/60 bg-secondary/30 text-muted-foreground",
  },
};

/** A single standalone thesis card - research, not graded as a call. */
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
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0">
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
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider whitespace-nowrap",
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

      <p className="mt-3 text-sm font-semibold text-foreground break-words [overflow-wrap:anywhere]">
        {thesis.title}
      </p>
      <p className="mt-1 text-sm text-foreground/90 break-words [overflow-wrap:anywhere] line-clamp-4">
        {thesis.content}
      </p>
    </div>
  );
}

/**
 * Standalone research theses - separate from Call History and NOT graded
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
          body="Standalone research theses live here - they're separate from calls and don't affect caller reputation."
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

/** Real, immutable call history - newest first, with owner controls. */
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
          body="Every on-the-record callout is listed here - permanent and immutable, with no edits or deletes."
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
      ? `Check out ${name} on BlackPebble - Trust Score ${trust}.`
      : `Check out ${name} on BlackPebble.`;

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    text,
  )}&url=${encodeURIComponent(url)}`;
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(
    url,
  )}&text=${encodeURIComponent(text)}`;

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
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
            <Check className="w-4 h-4 text-success" />
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

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-6">
      {/* X banner hero - same treatment as the Token Page banner: rounded card,
          click-to-expand fullscreen, subtle premium fallback when unset. */}
      <ProfileBanner profile={profile} />

      {/* Header */}
      <div className="hairline-accent overflow-hidden rounded-2xl bg-card shadow-card p-5 md:p-6 mt-3">
        {/* Identity: avatar + name/badges + compact @handle · tier · rank row */}
        <UserIdentity
          size="lg"
          align="start"
          nameAs="h1"
          testIdName="text-profile-name"
          avatarUrl={profile.x_avatar_url}
          avatarExpandable
          displayName={profile.x_display_name}
          handle={profile.x_username}
          officialBadges={profile.officialBadges}
          tier={profile.graduationTier}
          accountStatus="member"
          tierPosition="none"
          badgePosition="row"
          badgeSize="sm"
          showHandle={false}
          stopPropagation={false}
        >
          <ProfileIdentityMeta
            handle={profile.x_username}
            profileUrl={profileUrl}
            tier={profile.graduationTier}
            rank={profile.rank}
          />
        </UserIdentity>

        {/* Detail block spans the full card width (including under the avatar)
            so the hero reads balanced instead of left-empty / right-heavy. */}
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
          <div className="mt-4">
            <FollowButton profile={profile} />
          </div>
        )}
      </div>

      {/* Trader Snapshot - headline identity: BlackPebble Score, Trust Score,
          rank, tier, ROI, P&L, win rate */}
      <TraderSnapshotSection profile={profile} solUsd={solUsd} />

      {/* Trading Behavior + Call Edge - side by side on desktop, stacked on
          mobile, both as compact right-aligned stat panels */}
      <div className="mt-6 grid items-start gap-x-4 gap-y-6 md:grid-cols-2">
        <TradingBehaviorSection profile={profile} solUsd={solUsd} />
        <CallEdgeSection profile={profile} />
      </div>

      {/* Call Receipts + Thesis History */}
      <CallHistorySection profile={profile} />
      <ThesisHistorySection profile={profile} />

      {/* Achievements & Badges (unchanged in this pass) */}
      <BadgesSection profile={profile} />

      {/* Share this profile */}
      <ShareCard profile={profile} />
    </div>
  );
}

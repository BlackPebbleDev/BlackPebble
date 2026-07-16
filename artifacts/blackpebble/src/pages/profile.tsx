import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Check,
  ChevronDown,
  Coins,
  Copy,
  Dna,
  Fingerprint,
  Gem,
  History,
  Layers,
  Loader2,
  Lock,
  Medal,
  Megaphone,
  Pencil,
  Plus,
  Rocket,
  Rss,
  ScrollText,
  Send,
  Share2,
  ShieldCheck,
  TrendingUp,
  Trophy,
  UserPlus,
  UserCheck,
  Wallet,
  X as CloseIcon,
  Zap,
} from "lucide-react";
import {
  api,
  CALLOUT_THESIS_MAX,
  CALLOUT_UPDATE_MAX,
  type BadgeEntry,
  type CalloutWithDetail,
  type Conviction,
  type ProfileResponse,
  type ThesisWithAuthor,
} from "@/lib/api";
import { UserIdentity } from "@/components/user-identity";
import { ImageLightbox } from "@/components/image-lightbox";
import { RARITY_META, rarityOf } from "@/components/achievement-badge";
import { AchievementsShowcase } from "@/components/achievements-showcase";
import { TrustBadge, trustLabelFromScore } from "@/components/reputation-card";
import { FilterPills } from "@/components/filter-pills";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useXAuth } from "@/hooks/use-x-auth";
import { useSolUsd } from "@/hooks/use-sol-usd";
import {
  fmtMarketCap,
  fmtMultiple,
  fmtPercent,
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
import {
  SectionHeader,
  PanelCard,
  InfoHint,
  MiniStat,
  ProofChip,
} from "@/components/profile-ui";
import { ProfileEquityChart } from "@/components/equity-chart";

/**
 * Lightweight in-page section nav. Smooth-scrolls to anchored sections so the
 * profile reads like a browseable social page rather than one long dump. Uses
 * getElementById + scrollIntoView (no router state) so it can never break the
 * page or hide content.
 */
function ProfileSectionNav() {
  const items = [
    { id: "profile-overview", label: "Overview" },
    { id: "profile-activity", label: "Calls" },
    { id: "profile-thesis", label: "Thesis" },
    { id: "profile-more", label: "More" },
  ];
  const go = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div
      data-testid="profile-section-nav"
      className="mt-3 flex flex-wrap gap-2"
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => go(it.id)}
          data-testid={`nav-${it.id}`}
          className="rounded-full border border-border/70 bg-secondary/30 px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent"
        >
          {it.label}
        </button>
      ))}
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
 * Reputation Passport: the identity header answering "why should I trust or
 * follow this person?". BlackPebble Score is a brand-owned flagship slot, but no
 * real score field exists on the profile payload yet, so it shows a safe "Soon"
 * placeholder rather than reusing Trust Score or inventing a number. Trust Score
 * stays its own distinct stat. Everything else is real profile data.
 */
function ReputationPassportSection({
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
    <div id="profile-overview" className="mt-6 scroll-mt-24">
      <div className="flex items-center gap-2 mb-2">
        <Fingerprint className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          Reputation Passport
        </h2>
      </div>

      {/* Flagship BlackPebble Score (signature identity metric) + Trust Score.
          BlackPebble Score is the platform's own headline stat, so it gets a
          full-width premium plaque: warm gold glow, gunmetal top hairline,
          refined icon chip, and room for the label so it never truncates.
          No real score field exists yet, so it shows an intentional "Beta"
          state (never a raw placeholder). The value slot preserves its layout
          for a numeric score later. */}
      <div className="space-y-2.5 md:space-y-3">
        <div
          data-testid="blackpebble-score-card"
          className="relative overflow-hidden rounded-2xl border border-accent/50 bg-gradient-to-br from-accent/[0.18] via-accent/[0.06] to-transparent p-4 shadow-[0_14px_44px_-20px_rgba(212,175,55,0.6)]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-accent/20 blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent"
          />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/15 shadow-[0_0_10px_-2px_rgba(212,175,55,0.5)]">
                  <Gem className="h-3 w-3 text-accent" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent/90">
                  BlackPebble Score
                </span>
                <InfoHint
                  title="BlackPebble Score"
                  text="Combines trading, calls, activity, and reputation signals."
                />
              </div>
              <div className="mt-2 text-[11px] font-medium text-muted-foreground/80">
                Overall trader identity
              </div>
            </div>
            <div className="flex flex-shrink-0 flex-col items-end text-right">
              <span
                data-testid="blackpebble-score"
                className="font-mono text-3xl font-bold leading-none tracking-tight text-accent"
              >
                Beta
              </span>
              <span className="mt-1.5 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent/80">
                Calibrating
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-secondary/25 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="w-3 h-3 flex-shrink-0 text-accent" />
              <span>Trust Score</span>
              <InfoHint
                title="Trust Score"
                text="Signals profile credibility, activity, and reputation."
              />
            </div>
            <div className="mt-1.5 font-mono text-3xl font-bold leading-none text-foreground">
              {trustScore}
            </div>
          </div>
          <div className="flex-shrink-0">
            <TrustBadge
              score={trustScore}
              label={trustLabel}
              size="xs"
              showLabel
            />
          </div>
        </div>
      </div>

      {/* Proof strip: fast social proof for "is this trader worth watching?" */}
      <div data-testid="proof-strip" className="mt-2.5 flex flex-wrap gap-2">
        <ProofChip icon={Trophy} tone="accent">
          {rankLabel}
        </ProofChip>
        <ProofChip icon={Medal} tone="accent">
          {tierMeta(s.graduationTier).name}
        </ProofChip>
        <ProofChip tone={s.winRate >= 50 ? "up" : "muted"}>
          {s.winRate.toFixed(1)}% Win Rate
        </ProofChip>
        <ProofChip tone={s.totalPnlSol >= 0 ? "up" : "down"}>
          <PnlAmount sol={s.totalPnlSol} solUsd={solUsd} unit={false} /> P&L
        </ProofChip>
        <ProofChip>{s.closedTrades} Trades</ProofChip>
        <ProofChip icon={UserPlus}>{profile.followers} Followers</ProofChip>
      </div>
    </div>
  );
}

/**
 * Trader DNA: answers "how does this person trade?" with the full behavior stat
 * set. Avg Hold Time has no source on the public profile payload yet (spot
 * trades are unpaired buy/sell rows and ProfileStats exposes no hold field), so
 * it shows a "Soon" slot rather than a faked number. Designed to grow a real
 * "Trader Style" label later without a redesign.
 */
function TraderDnaSection({
  profile,
  solUsd,
}: {
  profile: ProfileResponse;
  solUsd: number;
}) {
  const s = profile.stats;
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-2">
        <Dna className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          Trader DNA
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MiniStat
          icon={TrendingUp}
          label="ROI"
          value={fmtPercent(s.roiPercent)}
          valueClass={pnlColor(s.roiPercent)}
        />
        <MiniStat
          icon={Coins}
          label="Total P&L"
          value={<PnlAmount sol={s.totalPnlSol} solUsd={solUsd} unit={false} />}
          valueClass={pnlColor(s.totalPnlSol)}
        />
        <MiniStat
          icon={Coins}
          label="Realized P&L"
          value={
            <PnlAmount sol={s.realizedPnlSol} solUsd={solUsd} unit={false} />
          }
          valueClass={pnlColor(s.realizedPnlSol)}
        />
        <MiniStat
          icon={Activity}
          label="Win Rate"
          value={`${s.winRate.toFixed(1)}%`}
        />
        <MiniStat
          icon={History}
          label="Closed Trades"
          value={String(s.closedTrades)}
        />
        <MiniStat
          icon={Zap}
          label="Executions"
          value={String(s.totalExecutions)}
        />
        <MiniStat
          icon={Trophy}
          label="Best Trade"
          value={<PnlAmount sol={s.bestTrade} solUsd={solUsd} unit={false} />}
          valueClass={pnlColor(s.bestTrade)}
        />
        <MiniStat
          icon={Activity}
          label="Avg Hold"
          value={<span className="text-muted-foreground">Soon</span>}
          hint={{
            title: "Avg Hold",
            text: "Average time between opening and closing paper trades. Coming soon.",
          }}
        />
      </div>
      <div className="mt-2 flex items-center gap-1.5 px-0.5 text-[11px] text-muted-foreground/70">
        <Dna className="w-3 h-3 text-accent/70" />
        Trader style: coming soon
      </div>
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

/**
 * Achievements section - lazily fetches the full badge list for this profile,
 * runs the fresh-unlock celebration + share-copy logic, and hands the data to
 * the premium AchievementsShowcase (medallion cluster in earned order, inline
 * detail reveal, and a compact locked drawer).
 */
function BadgesSection({ profile }: { profile: ProfileResponse }) {
  const profileKey = profile.x_username || String(profile.user_id);
  const { toast } = useToast();
  // Keys to briefly shimmer after a fresh unlock (self profile only).
  const [justUnlocked, setJustUnlocked] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["badges", profileKey],
    queryFn: () =>
      api.profiles.badges(profile.x_username || profile.user_id),
    retry: false,
    staleTime: 60_000,
  });

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

  return (
    <AchievementsShowcase
      badges={data?.badges ?? []}
      isLoading={isLoading}
      justUnlocked={justUnlocked}
      onShare={profile.isSelf ? handleShare : undefined}
    />
  );
}

/**
 * Circular token image shared by every call-related card (Call Receipts, Best
 * Call, Lowest Call, activity). Matches the markets/feed visual language: a
 * round avatar with a graceful initials fallback when the logo is missing or
 * fails to load (never a broken image or empty gap).
 */
function TokenAvatar({
  logo,
  symbol,
  className = "w-9 h-9",
}: {
  logo?: string | null;
  symbol?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (logo && !failed) {
    return (
      <img
        src={logo}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn(
          "rounded-full object-cover flex-shrink-0 bg-secondary",
          className,
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full bg-secondary flex items-center justify-center text-[10px] font-semibold uppercase text-muted-foreground flex-shrink-0",
        className,
      )}
    >
      {symbol?.slice(0, 2) ?? "?"}
    </div>
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

/** ATH multiple from call -> ATH percent from call. Null-safe; no faked data. */
function athPercentFromMultiple(mult: number | null | undefined): number | null {
  return mult != null && Number.isFinite(mult) && mult > 0
    ? (mult - 1) * 100
    : null;
}

/**
 * Shared call-result block used by every call receipt. Meme-coin calls are
 * judged on how high they ran AFTER the call, so the ATH from call is the hero:
 *   1. ATH % from call (big green number)
 *   2. ATH x from call (bold, beside it)
 *   3. called MC -> ATH MC run
 *   4. current stats, demoted to a small secondary row
 * ATH % is derived from the real ATH multiple ((x - 1) * 100) and ATH MC from
 * the called MC * ATH multiple. Nothing is invented; only hierarchy changes.
 */
function CallResultBlock({
  athMultiple,
  currentMultiple,
  currentPercent,
  calledMc,
  currentMc,
}: {
  athMultiple: number | null;
  currentMultiple: number | null;
  currentPercent: number | null;
  calledMc: number | null;
  currentMc: number | null;
}) {
  const athPct = athPercentFromMultiple(athMultiple);
  const athMc =
    calledMc != null && athMultiple != null && athMultiple > 0
      ? calledMc * athMultiple
      : null;
  return (
    <div className="mt-3 rounded-xl border border-border/60 bg-secondary/20 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent/80">
        <TrendingUp className="w-3 h-3" />
        ATH return from call
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono">
        <span className={cn("text-2xl font-bold", pnlColor(athPct))}>
          {fmtPercent(athPct, 0)}
        </span>
        <span
          className={cn(
            "text-sm font-semibold",
            multipleTone(athMultiple),
          )}
        >
          ATH {fmtMultiple(athMultiple)}
        </span>
      </div>
      <div className="mt-1 font-mono text-[11px] text-muted-foreground">
        Called {fmtMarketCap(calledMc)}
        {" \u2192 "}
        ATH {fmtMarketCap(athMc)}
      </div>
      {/* Current stats, demoted to a subtle secondary row */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-border/40 pt-2 font-mono text-[11px] text-muted-foreground">
        <span className="inline-flex items-baseline gap-1">
          <span className="uppercase tracking-wider text-muted-foreground/70">
            Now
          </span>
          <span className={cn("font-semibold", pnlColor(currentPercent))}>
            {fmtPercent(currentPercent, 0)}
          </span>
        </span>
        <span className={cn("font-semibold", multipleTone(currentMultiple))}>
          {fmtMultiple(currentMultiple)}
        </span>
        <span className="text-muted-foreground/80">
          MC {fmtMarketCap(currentMc)}
        </span>
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
        <TokenAvatar logo={callout.token_logo} symbol={callout.token_symbol} />
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

      {/* Featured result: for meme calls the flex is how high it ran AFTER the
          call, so ATH from call is the hero metric. ATH % + ATH x lead, then
          the called MC to ATH MC run, and current stats sit demoted below. */}
      <CallResultBlock
        athMultiple={callout.result?.athMultiple ?? null}
        currentMultiple={callout.result?.currentMultiple ?? null}
        currentPercent={callout.result?.pnlPercent ?? null}
        calledMc={callout.call_market_cap}
        currentMc={callout.result?.currentMarketCapUsd ?? null}
      />

      {/* Original call text */}
      {callout.thesis && (
        <p className="mt-2.5 text-sm text-foreground/90 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {callout.thesis}
        </p>
      )}

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

/**
 * Call Trophy Case: the flex section. Merges caller reputation (formerly Caller
 * Stats) and graded call performance (formerly Call Performance) into a compact
 * stat grid plus a featured Best Call trophy and a smaller Lowest Call. All-time
 * figures. No grading or stat formulas changed. The Best Call return percent is
 * derived from its real multiple ((multiple - 1) * 100); nothing is faked.
 */
function CallTrophyCaseSection({ profile }: { profile: ProfileResponse }) {
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
  // Reuse the (already cached) call list purely to resolve circular token
  // images for the Best / Lowest call by mint. Caller stats don't carry a
  // logo, so we map it in the UI layer without any backend change.
  const { data: coData } = useQuery({
    queryKey: ["callouts", key],
    queryFn: () => api.callouts.list(id),
    enabled: !!profile,
    retry: false,
  });
  const tokenByMint = useMemo(() => {
    const m = new Map<
      string,
      { logo: string | null; symbol: string | null }
    >();
    for (const c of coData?.callouts ?? []) {
      if (!m.has(c.token_mint)) {
        m.set(c.token_mint, { logo: c.token_logo, symbol: c.token_symbol });
      }
    }
    return m;
  }, [coData]);

  const cs = csData?.stats ?? null;
  const all = perfData?.performance.all ?? null;
  const totalCalls = cs?.callsMade ?? all?.totalCalls ?? 0;
  const gradedCalls = cs?.gradedCalls ?? all?.gradedCalls ?? 0;
  const isLoading = csLoading || perfLoading;

  const header = (
    <div className="flex items-center gap-2 mb-2">
      <Trophy className="w-4 h-4 text-accent" />
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
        Call Trophy Case
      </h2>
    </div>
  );

  if (isLoading) {
    return (
      <div className="mt-6">
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
      <div className="mt-6">
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
  const best = cs?.bestCall ?? null;
  // ATH from call is the meme-coin flex: prefer the true ATH high-water
  // multiple, falling back to the graded multiple only when no peak is tracked.
  const bestAthMultiple = best ? best.athMultiple ?? best.multiple : null;
  const bestAthPct = athPercentFromMultiple(bestAthMultiple);
  const bestAthMc =
    best &&
    best.calledMarketCapUsd != null &&
    bestAthMultiple != null &&
    bestAthMultiple > 0
      ? best.calledMarketCapUsd * bestAthMultiple
      : null;
  const bestToken = best ? tokenByMint.get(best.token_mint) : undefined;
  const worst = all?.worstCall ?? null;
  const worstToken = worst ? tokenByMint.get(worst.token_mint) : undefined;

  return (
    <div className="mt-6">
      {header}
      <PanelCard testId="call-edge">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MiniStat
            icon={Megaphone}
            label="Total Calls"
            value={String(totalCalls)}
            sub={`${winningCalls} winning`}
          />
          <MiniStat
            icon={Trophy}
            label="Win Rate"
            value={winRate}
            hint={{
              title: "Call Win Rate",
              text: "Share of graded calls that finished in profit.",
            }}
          />
          <MiniStat
            icon={TrendingUp}
            label="Avg Multiple"
            value={cs?.avgMultiple != null ? fmtMultiple(cs.avgMultiple) : "—"}
            valueClass={multipleTone(cs?.avgMultiple ?? null)}
            hint={{
              title: "Avg Multiple",
              text: "Average return multiple across graded calls.",
            }}
          />
          <MiniStat
            icon={Activity}
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

        {/* Featured Best Call trophy (ATH from call is the hero flex) + a
            smaller Lowest Call comparison beneath it. */}
        {(best || worst) && (
          <div className="mt-3 space-y-2">
            {best && (
              <Link
                href={`/?token=${best.token_mint}`}
                data-testid="call-edge-best"
                className="relative block overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/12 via-accent/[0.04] to-transparent p-4 shadow-[0_8px_30px_-16px_rgba(212,175,55,0.5)] transition-colors hover:border-accent/60"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-accent/15 blur-2xl"
                />
                <div className="relative flex items-center gap-2.5">
                  <TokenAvatar
                    logo={bestToken?.logo}
                    symbol={bestToken?.symbol ?? best.token_symbol}
                    className="w-9 h-9"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent/90">
                      <Trophy className="w-3 h-3" />
                      Best Call
                    </div>
                    <div className="mt-0.5 font-mono text-base font-bold text-foreground truncate">
                      {best.token_symbol || shortAddr(best.token_mint, 4)}
                    </div>
                  </div>
                </div>
                <div className="relative mt-2 text-[10px] uppercase tracking-wider text-accent/70">
                  ATH return from call
                </div>
                <div className="relative mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono">
                  <span
                    className={cn("text-2xl font-bold", pnlColor(bestAthPct))}
                  >
                    {fmtPercent(bestAthPct, 0)}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      multipleTone(bestAthMultiple),
                    )}
                  >
                    ATH {fmtMultiple(bestAthMultiple)}
                  </span>
                </div>
                <div className="relative mt-1 font-mono text-[11px] text-muted-foreground">
                  Called {fmtMarketCap(best.calledMarketCapUsd ?? null)}
                  {" \u2192 "}
                  ATH {fmtMarketCap(bestAthMc)}
                </div>
                {/* Current, demoted */}
                <div className="relative mt-1.5 border-t border-accent/15 pt-1.5 font-mono text-[10px] text-muted-foreground/80">
                  Graded {fmtMultiple(best.multiple)}
                  {" \u00b7 Now "}
                  {fmtMarketCap(best.currentMarketCapUsd ?? null)}
                </div>
              </Link>
            )}
            {worst && (
              <Link
                href={`/?token=${worst.token_mint}`}
                data-testid="call-edge-lowest"
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/20 p-3 transition-colors hover:border-accent/50"
              >
                <TokenAvatar
                  logo={worstToken?.logo}
                  symbol={worstToken?.symbol ?? worst.token_symbol}
                  className="w-8 h-8"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Lowest Call
                  </div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-foreground truncate">
                    {worst.token_symbol || shortAddr(worst.token_mint, 4)}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span
                    className={cn(
                      "font-mono text-sm font-semibold",
                      pnlColor(worst.returnPercent),
                    )}
                  >
                    {fmtPercent(worst.returnPercent, 0)}
                  </span>
                  <div className="text-[10px] text-muted-foreground">
                    Lowest graded return
                  </div>
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
        <TokenAvatar logo={thesis.token_logo} symbol={thesis.token_symbol} />
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
    <div id="profile-thesis" className="scroll-mt-24">
      <SectionHeader icon={ScrollText} title="Thesis Notes" />
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
    </div>
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
    <div className="scroll-mt-24">
      <SectionHeader icon={History} title="Call Receipts" />
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
    </div>
  );
}

/**
 * Trader Activity: frames Call Receipts and Thesis Notes as one social feed with
 * lightweight filter chips (All / Calls / Thesis). The filter is local UI state
 * only; both underlying sections keep their own data + owner controls, so
 * nothing about calls or theses logic changes.
 */
type ActivityTab = "all" | "calls" | "thesis";

function TraderActivitySection({ profile }: { profile: ProfileResponse }) {
  const [tab, setTab] = useState<ActivityTab>("all");
  return (
    <div id="profile-activity" className="mt-6 scroll-mt-24">
      <div className="flex items-center gap-2 mb-2">
        <Rss className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          Trader Activity
        </h2>
      </div>
      <FilterPills
        options={[
          { id: "all", label: "All" },
          { id: "calls", label: "Calls" },
          { id: "thesis", label: "Thesis" },
        ]}
        value={tab}
        onChange={(id) => setTab(id as ActivityTab)}
        size="sm"
        ariaLabel="Activity filter"
        testIdPrefix="activity-filter"
      />
      {tab !== "thesis" && <CallHistorySection profile={profile} />}
      {tab !== "calls" && <ThesisHistorySection profile={profile} />}
    </div>
  );
}

/**
 * More Reputation Lanes: future-ready collapsed dropdown that shows where the
 * Crypto Reputation Passport is heading (Dev History, Wallet Utility Proof,
 * Campaign Record). No data systems exist yet, so each lane shows a subtle,
 * honest "Coming soon" state. Nothing here is faked and it stays collapsed by
 * default so it never clutters the active profile.
 */
function MoreReputationLanesSection() {
  const [open, setOpen] = useState(false);
  const lanes = [
    {
      icon: Rocket,
      title: "Dev History",
      text: "Tokens launched, launch dates, peak and current market cap, and burn proof.",
    },
    {
      icon: Wallet,
      title: "Wallet Utility Proof",
      text: "SOL recovered, token burns, and cleanup receipts.",
    },
    {
      icon: Megaphone,
      title: "Campaign Record",
      text: "Campaigns created, funded, and organizer reputation.",
    },
  ];
  return (
    <div id="profile-more" className="mt-6 scroll-mt-24">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            data-testid="more-reputation-lanes"
            className="flex w-full items-center justify-between gap-2 rounded-2xl bg-card p-4 shadow-card transition-colors hover:bg-card/80"
          >
            <span className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold uppercase tracking-wider text-foreground">
                More Reputation Lanes
              </span>
            </span>
            <ChevronDown
              className={cn(
                "w-4 h-4 flex-shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          {lanes.map((lane) => (
            <div
              key={lane.title}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/20 p-3"
            >
              <lane.icon className="w-4 h-4 flex-shrink-0 text-accent/80 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {lane.title}
                  </span>
                  <span className="flex-shrink-0 rounded-full border border-border/70 bg-secondary/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Coming soon
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {lane.text}
                </p>
              </div>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
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
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 py-5">
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

      {/* In-page section nav: browseable social profile, not one long dump */}
      <ProfileSectionNav />

      {/* Reputation Passport - flagship identity: BlackPebble Score, Trust
          Score, and a social proof strip */}
      <ReputationPassportSection profile={profile} solUsd={solUsd} />

      {/* Equity trend - a small live curve so the profile feels alive (hidden
          until the trader has enough paper-account history to draw one) */}
      <ProfileEquityChart
        profileId={profile.x_username || profile.user_id}
        className="mt-3"
      />

      {/* Trader DNA - how this person trades (full behavior stat set) */}
      <TraderDnaSection profile={profile} solUsd={solUsd} />

      {/* Call Trophy Case - scoreboard + featured Best Call / Lowest Call */}
      <CallTrophyCaseSection profile={profile} />

      {/* Trader Activity - Call Receipts + Thesis Notes as one feed */}
      <TraderActivitySection profile={profile} />

      {/* Future-ready reputation lanes (collapsed, no fake data) */}
      <MoreReputationLanesSection />

      {/* Achievements - premium collectible medallion showcase */}
      <BadgesSection profile={profile} />

      {/* Share this profile (sits below the achievements showcase) */}
      <ShareCard profile={profile} />
    </div>
  );
}

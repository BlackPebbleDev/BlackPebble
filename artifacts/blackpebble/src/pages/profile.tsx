import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BadgeCheck,
  ExternalLink,
  History,
  Loader2,
  Lock,
  Pencil,
  Pin,
  Plus,
  Send,
  ShieldCheck,
  Trophy,
  UserPlus,
  UserCheck,
  X as CloseIcon,
} from "lucide-react";
import {
  api,
  BIO_MAX_LENGTH,
  CALLOUT_THESIS_MAX,
  CALLOUT_UPDATE_MAX,
  type CalloutResult,
  type CalloutWithDetail,
  type Conviction,
  type ProfileResponse,
} from "@/lib/api";
import { useXAuth } from "@/hooks/use-x-auth";
import { useSolUsd } from "@/hooks/use-sol-usd";
import {
  fmtMarketCap,
  fmtNum,
  fmtPercent,
  fmtPrice,
  pnlColor,
  shortAddr,
  timeAgo,
  xProfileUrl,
} from "@/lib/format";
import { PnlAmount } from "@/components/pnl-amount";
import { TierBadge } from "@/components/tier-badge";
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
        className="rounded-xl bg-card shadow-card p-5 space-y-6"
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
      className="rounded-xl border border-dashed border-border bg-card/40 p-5"
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
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-secondary/30 px-2.5 py-1 text-[11px] text-muted-foreground/70"
          >
            <Award className="w-3 h-3" />
            {b}
          </span>
        ))}
      </div>
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
      className="mt-3 flex items-center gap-2"
    >
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={CALLOUT_UPDATE_MAX}
        placeholder="Add an update…"
        data-testid={`input-callout-update-${calloutId}`}
        className="flex-1 h-9 bg-secondary/40 border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
      />
      <button
        type="submit"
        disabled={!content.trim() || mutation.isPending}
        data-testid={`button-callout-update-${calloutId}`}
        className="inline-flex items-center justify-center h-9 w-9 bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50 flex-shrink-0"
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
            <span className="text-sm font-semibold text-foreground truncate">
              {callout.token_symbol || shortAddr(callout.token_mint)}
            </span>
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

      {/* Entry snapshot + current result */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="border border-border bg-secondary/30 p-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Entry Price
          </div>
          <div className="mt-0.5 font-mono text-sm text-foreground">
            {callout.call_price_usd != null
              ? fmtPrice(callout.call_price_usd)
              : "—"}
          </div>
        </div>
        <div className="border border-border bg-secondary/30 p-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Entry MC
          </div>
          <div className="mt-0.5 font-mono text-sm text-foreground">
            {callout.call_market_cap != null
              ? fmtMarketCap(callout.call_market_cap)
              : "—"}
          </div>
        </div>
        <div className="border border-border bg-secondary/30 p-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Result
          </div>
          <div className="mt-0.5">
            <CalloutResultValue result={callout.result} />
          </div>
        </div>
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
        className="mb-3 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
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
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50"
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
  const displayName = profile.x_display_name?.trim() || `@${profile.x_username}`;
  const profileUrl = xProfileUrl(profile.x_username);
  const stats = profile.stats;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-6">
      {/* Header */}
      <div className="rounded-2xl bg-card shadow-card p-5 md:p-6">
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

      {/* Call History (real, immutable) */}
      <CallHistorySection profile={profile} />

      {/* Achievements & Badges (placeholder) */}
      <SectionHeader icon={Award} title="Achievements & Badges" />
      <AchievementsPlaceholder />
    </div>
  );
}

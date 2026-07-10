import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookPlus,
  ChevronDown,
  Crown,
  ExternalLink,
  Flame,
  Gem,
  Loader2,
  Megaphone,
  Medal,
  ScrollText,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import {
  api,
  type BadgeRarity,
  type FeedActivityItem,
  type FeedAggMeta,
} from "@/lib/api";
import { ReactionBar } from "@/components/feed-reactions";
import { useXAuth } from "@/hooks/use-x-auth";
import { useToast } from "@/hooks/use-toast";
import type { PickedTrade } from "@/components/journal/trade-picker";
import {
  JournalEntryDialog,
  formFromPickedTrade,
} from "@/components/journal/journal-entry-dialog";
import {
  fmtMarketCap,
  fmtMultiple,
  multipleTone,
  shortAddr,
  timeAgo,
  xProfileUrl,
} from "@/lib/format";
import { PnlAmount } from "@/components/pnl-amount";
import { CurrencyAmount } from "@/components/currency-amount";
import { UserIdentity } from "@/components/user-identity";
import { AccountStatusChip } from "@/components/account-status-chip";
import { TierBadge } from "@/components/tier-badge";
import { TrustBadge, trustLabelFromScore } from "@/components/reputation-card";
import { trackXProfileLinkClicked } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/** Display label for a token: symbol → name → shortened mint. */
function tokenLabel(token: FeedActivityItem["token"]): string {
  return (
    token.symbol?.trim() ||
    token.name?.trim() ||
    shortAddr(token.mint, 4) ||
    "token"
  );
}

/**
 * The token name/symbol as an in-app link to its trade view (`/?token=<mint>`).
 * Used in every feed card so any token reference is clickable. Falls back to
 * plain text when no mint is available.
 */
function TokenLink({ token }: { token: FeedActivityItem["token"] }) {
  const label = tokenLabel(token);
  if (!token.mint) {
    return <span className="text-foreground font-medium">{label}</span>;
  }
  return (
    <Link
      href={`/?token=${token.mint}`}
      onClick={(e) => e.stopPropagation()}
      className="text-foreground font-medium hover:text-accent transition-colors"
    >
      {label}
    </Link>
  );
}

/** A small "trade this token" affordance appended to a verb line. */
function TradeLink({ token }: { token: FeedActivityItem["token"] }) {
  if (!token.mint) return null;
  return (
    <Link
      href={`/?token=${token.mint}`}
      onClick={(e) => e.stopPropagation()}
      className="ml-1 text-[11px] text-accent/80 hover:text-accent"
    >
      trade
    </Link>
  );
}

/** Right-aligned "View on X" link, shared by every card that has a handle. */
function ViewOnX({ handle }: { handle: string | null }) {
  const profileUrl = xProfileUrl(handle);
  if (!profileUrl) return null;
  return (
    <a
      href={profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.stopPropagation();
        trackXProfileLinkClicked();
      }}
      className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent transition-colors"
    >
      View on X <ExternalLink className="w-3 h-3" />
    </a>
  );
}

/** A small uppercase category chip (Spot, Perps, Callout, Recovery…). */
function Chip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "uppercase tracking-wider text-[10px] font-semibold rounded-full px-2 py-0.5",
        className ?? "bg-secondary text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

/** One labelled stat in a callout performance / recovery block. */
function PerfStat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-sm tabular-nums truncate",
          valueClass ?? "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Live performance block for a callout - Called MC, Current MC, Current X and
 * ATH X. All values are computed dynamically server-side; the call's original
 * Called MC and timestamp are preserved untouched. Theses never render this.
 */
function CalloutPerformance({ item }: { item: FeedActivityItem }) {
  const hasAny =
    item.callMarketCapUsd != null ||
    item.currentMarketCapUsd != null ||
    item.currentMultiple != null ||
    item.athMultiple != null;
  if (!hasAny) return null;
  return (
    <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 rounded-lg bg-secondary/40 px-3 py-2.5">
      <PerfStat label="Called MC" value={fmtMarketCap(item.callMarketCapUsd)} />
      <PerfStat
        label="Current MC"
        value={fmtMarketCap(item.currentMarketCapUsd)}
      />
      <PerfStat
        label="Current X"
        value={fmtMultiple(item.currentMultiple)}
        valueClass={multipleTone(item.currentMultiple)}
      />
      <PerfStat
        label="ATH X"
        value={fmtMultiple(item.athMultiple)}
        valueClass={multipleTone(item.athMultiple)}
      />
    </div>
  );
}

/**
 * Premium metric tile — rounded, slightly darker than the parent card, subtle
 * border, clean label over a strong number. The reusable building block for
 * all data-dense feed cards. `value` accepts a node so tiles can host the
 * tappable SOL/USD <CurrencyAmount>.
 */
function MetricTile({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="metric-tile">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 truncate">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-mono text-sm tabular-nums truncate",
          valueClass ?? "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** Human duration between two unix-second timestamps, e.g. "18 minutes". */
function windowLabel(startSec: number, endSec: number): string {
  const s = Math.max(0, endSec - startSec);
  if (s < 60) return "under a minute";
  const m = Math.round(s / 60);
  if (m < 90) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(s / 3600);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

/** Format a SOL amount for cards: trim trailing zeros, max 4 dp. */
function fmtSol(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "0";
  return Number(v.toFixed(4)).toString();
}

// ── Event visuals (the small badge overlaid on the identity avatar) ──────────

interface EventVisual {
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind classes for the corner badge (background + icon color). */
  tone: string;
}

const BUY_EVENT: EventVisual = { icon: ArrowUpRight, tone: "bg-success text-white" };
const SELL_EVENT: EventVisual = { icon: ArrowDownRight, tone: "bg-danger text-white" };
// Perps get a directional treatment so LONG / SHORT / LIQUIDATED read distinctly
// at a glance (icon + corner-badge tone), instead of one generic perps badge.
// Cyan-up for longs, orange-down for shorts, critical red for liquidations.
const PERPS_LONG_EVENT: EventVisual = { icon: TrendingUp, tone: "bg-cyan-500 text-white" };
const PERPS_SHORT_EVENT: EventVisual = { icon: TrendingDown, tone: "bg-orange-500 text-white" };
const PERPS_LIQ_EVENT: EventVisual = { icon: AlertTriangle, tone: "bg-red-600 text-white" };
const CALLOUT_EVENT: EventVisual = { icon: Megaphone, tone: "bg-accent text-accent-foreground" };
const THESIS_EVENT: EventVisual = { icon: ScrollText, tone: "bg-accent text-accent-foreground" };
const RECOVERY_EVENT: EventVisual = { icon: Sparkles, tone: "bg-accent text-accent-foreground" };
const CAMPAIGN_EVENT: EventVisual = { icon: Megaphone, tone: "bg-accent text-accent-foreground" };

function EventBadge({ visual }: { visual: EventVisual }) {
  const Icon = visual.icon;
  return (
    <span
      className={cn(
        "flex h-[22px] w-[22px] lg:h-7 lg:w-7 items-center justify-center rounded-full",
        visual.tone,
      )}
    >
      <Icon className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
    </span>
  );
}

/**
 * Avatar + display name/handle that links to the in-app profile. The event
 * icon rides in the avatar's corner (single strong identity anchor instead of
 * a competing medallion).
 */
export function FeedUserLink({
  user,
  event,
}: {
  user: FeedActivityItem["user"];
  event?: EventVisual;
}) {
  const handle = user.x_username?.trim().replace(/^@+/, "") || null;
  const hasTrust = user.trustScore != null && user.trustScore > 0;
  const hasEquity = user.equityUsd != null && user.equityUsd > 0;
  return (
    <UserIdentity
      avatarUrl={user.x_avatar_url}
      displayName={user.x_display_name}
      handle={user.x_username}
      officialBadges={user.official_badges}
      size="feed"
      badgeSize="xs"
      pinNameRow
      tierPosition="none"
      align="start"
      avatarBadge={event ? <EventBadge visual={event} /> : undefined}
      nameLink={
        handle
          ? { type: "internal", href: `/u/${encodeURIComponent(handle)}` }
          : undefined
      }
      testIdName={handle ? `link-profile-${handle}` : undefined}
      // MEMBER sits beside the @handle (not the name) to save a row.
      handleTrailing={<AccountStatusChip status="member" />}
      // Trust score + progression tier share one line under the handle.
      subline={
        <div className="mt-1 flex items-center gap-2 min-w-0">
          {hasTrust && (
            <TrustBadge
              score={user.trustScore as number}
              label={trustLabelFromScore(user.trustScore as number)}
              size="xs"
              showLabel={false}
            />
          )}
          <TierBadge tier={user.graduation_tier} size="sm" variant="plain" />
          {hasEquity && (
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-muted-foreground/80"
              title="Paper portfolio value"
              data-testid={`feed-equity-${user.user_id}`}
            >
              <Wallet
                className="h-3 w-3 text-muted-foreground/60"
                aria-hidden="true"
              />
              {fmtMarketCap(user.equityUsd)}
            </span>
          )}
        </div>
      }
    />
  );
}

/**
 * Desktop-only right-shift for a card's "lead" block (identity header + the
 * descriptive "what they did" line). On desktop the cards are wide, so nudging
 * the lead inward — while the metric tiles and everything below stay full
 * width — gives a premium staggered/offset dashboard look instead of a flat
 * left-aligned column. Mobile is untouched (base = no indent). Tunable here.
 */
const LEAD_INDENT = "lg:pl-[15%]";

/**
 * The shared premium shell for every feed card. Two slots:
 *  - `lead`  — the identity header (avatar + event badge + name/tier +
 *    timestamp) plus the card's descriptive line(s); indented right on desktop.
 *  - `children` — the full-width data region (metric tiles, breakdowns, and the
 *    trailing chip/PnL row) that stays flush so numbers get the full width.
 * Nothing else re-implements the chrome, so spacing/hierarchy stay identical
 * everywhere. Tile-less cards pass all their content as `lead`.
 */
function CardShell({
  item,
  event,
  className,
  lead,
  children,
}: {
  item: FeedActivityItem;
  event?: EventVisual;
  className?: string;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-testid={`feed-card-${item.id}`}
      className={cn(
        "rounded-xl bg-card shadow-card p-4 transition-colors hover:bg-surface-3",
        className,
      )}
    >
      <div className={LEAD_INDENT}>
        <div className="flex items-start justify-between gap-3">
          <FeedUserLink user={item.user} event={event} />
          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {timeAgo(item.timestamp)}
          </span>
        </div>
        {lead != null && <div className="mt-2.5">{lead}</div>}
      </div>

      {children}

      <ReactionBar item={item} trailing={<CardTrailing item={item} />} />
    </div>
  );
}

/**
 * The right-aligned footer action opposite the reactions. On the viewer's OWN
 * cards this is the "Journal" button; on other traders' cards it's "Follow".
 * Both self-gate to null, so exactly one (or neither, for a guest viewing
 * someone else's card) renders.
 */
function CardTrailing({ item }: { item: FeedActivityItem }) {
  return (
    <>
      <JournalTradeButton item={item} />
      <FollowTradeButton item={item} />
    </>
  );
}

/** win/loss/neutral from a realized PnL, for the journal prefill outcome. */
function outcomeFromPnl(pnl: number | null): PickedTrade["outcome"] {
  if (pnl == null) return null;
  if (pnl > 0) return "win";
  if (pnl < 0) return "loss";
  return "neutral";
}

/**
 * Build a journal prefill (PickedTrade) straight from the feed item's own data
 * — no extra fetch. Only spot buys/sells, perps, and accumulation cards map to
 * a journalable trade; everything else returns null. Buys/opens carry entry MC
 * only; sells/closes carry exit MC + realized PnL.
 */
function feedItemToPickedTrade(item: FeedActivityItem): PickedTrade | null {
  const token =
    item.token.symbol?.trim() ||
    item.token.name?.trim() ||
    shortAddr(item.token.mint, 4) ||
    "token";
  const tokenMint = item.token.mint;
  // Feed timestamps are unix seconds (tolerating an accidental ms value).
  const ts =
    item.timestamp > 1e12 ? Math.floor(item.timestamp / 1000) : item.timestamp;

  if (item.kind === "spot") {
    const isSell = item.action === "sell";
    const mc = item.tradeMarketCapUsd ?? null;
    const pnl = isSell ? (item.pnlSol ?? null) : null;
    return {
      source: "spot",
      tradeType: "spot",
      direction: "long",
      token,
      tokenMint,
      ts,
      entryMc: isSell ? null : mc,
      exitMc: isSell ? mc : null,
      pnlSol: pnl,
      roiPct: null,
      outcome: outcomeFromPnl(pnl),
      detail: isSell ? "Sell" : "Buy",
      leverage: null,
    };
  }

  if (item.kind === "leverage") {
    const meta = (item.meta ?? {}) as { marketCapUsd?: number | null };
    const isOpen = item.action === "open";
    const pnl = isOpen ? null : (item.pnlSol ?? null);
    return {
      source: "leverage",
      tradeType: "leverage",
      direction: item.direction === "short" ? "short" : "long",
      token,
      tokenMint,
      ts,
      entryMc: isOpen ? (meta.marketCapUsd ?? null) : null,
      exitMc: isOpen ? null : (meta.marketCapUsd ?? null),
      pnlSol: pnl,
      roiPct: null,
      outcome: outcomeFromPnl(pnl),
      detail:
        item.action === "liquidated"
          ? "Liquidated"
          : isOpen
            ? "Opened"
            : "Closed",
      leverage: item.leverage ?? null,
    };
  }

  if (item.kind === "agg") {
    const meta = (item.meta ?? {}) as unknown as FeedAggMeta;
    const isBuy = item.action === "accumulated";
    const pnl = isBuy ? null : (meta.totalPnlSol ?? null);
    return {
      source: "spot",
      tradeType: "spot",
      direction: "long",
      token,
      tokenMint,
      ts: meta.windowEnd ?? ts,
      entryMc: isBuy ? (meta.avgMarketCapUsd ?? null) : null,
      exitMc: isBuy ? null : (meta.avgMarketCapUsd ?? null),
      pnlSol: pnl,
      roiPct: null,
      outcome: outcomeFromPnl(pnl),
      detail: isBuy ? "Accumulation" : "Exit",
      leverage: null,
    };
  }

  return null;
}

/**
 * Inline "Journal this trade" affordance on the reaction row. Mirrors the
 * reaction "React" trigger (ghost pill, tiny icon + label) but with a journal
 * book icon, and is pinned opposite the reactions. Only shown on the viewer's
 * OWN spot/perps/accumulation cards; opens the shared journal editor prefilled
 * from the trade. Renders nothing (self-gates) otherwise.
 */
function JournalTradeButton({ item }: { item: FeedActivityItem }) {
  const { user } = useXAuth();
  const [open, setOpen] = useState(false);

  const myHandle = user?.x_username?.trim().replace(/^@+/, "").toLowerCase();
  const cardHandle = item.user.x_username?.trim().replace(/^@+/, "").toLowerCase();
  const isMine = !!myHandle && myHandle === cardHandle;

  const picked = useMemo(
    () => (isMine ? feedItemToPickedTrade(item) : null),
    [isMine, item],
  );
  const seed = useMemo(
    () => (picked ? formFromPickedTrade(picked) : null),
    [picked],
  );

  if (!seed) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        data-testid={`journal-trade-${item.id}`}
        aria-label="Journal this trade"
        title="Journal this trade"
        className={cn(
          "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors border border-transparent",
          "text-muted-foreground/70 hover:text-foreground hover:bg-secondary/60",
        )}
      >
        <BookPlus className="w-3.5 h-3.5" />
        <span>Journal</span>
      </button>
      <JournalEntryDialog
        open={open}
        onOpenChange={setOpen}
        seed={seed}
        editingId={null}
      />
    </>
  );
}

/**
 * Real follow state for feed cards. The feed payload does NOT inline the
 * viewer's follow relationship, so instead of faking it we derive it from the
 * viewer's own following list — one shared React Query (deduped across every
 * card by its stable key). Follow/unfollow optimistically update that shared
 * set and reconcile against the real API result.
 */
function useFollowState(targetUserId: number, handle: string | null) {
  const { user, loggedIn } = useXAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const viewerRef = user?.x_username || user?.id || null;
  const key = ["following-set", user?.id ?? null] as const;

  const { data: set } = useQuery({
    queryKey: key,
    enabled: loggedIn && !!viewerRef,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await api.profiles.following(viewerRef as string | number);
      return new Set<number>(res.users.map((u) => u.user_id));
    },
  });

  const mut = useMutation({
    mutationFn: (follow: boolean) =>
      follow
        ? api.profiles.follow(handle ?? targetUserId)
        : api.profiles.unfollow(handle ?? targetUserId),
    onMutate: async (follow) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Set<number>>(key);
      const next = new Set(prev ?? []);
      if (follow) next.add(targetUserId);
      else next.delete(targetUserId);
      qc.setQueryData(key, next);
      return { prev };
    },
    onError: (_e, _follow, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast({ variant: "destructive", title: "Couldn't update follow" });
    },
    onSuccess: (res, follow, ctx) => {
      if (!res.ok) {
        if (ctx?.prev) qc.setQueryData(key, ctx.prev);
        toast({
          variant: "destructive",
          title: res.error || "Couldn't update follow",
        });
        return;
      }
      if (follow && handle) {
        toast({
          variant: "social",
          icon: <UserPlus className="h-4 w-4" />,
          title: `Following @${handle}`,
          duration: 4000,
        });
      }
    },
  });

  const following = set?.has(targetUserId) ?? false;
  return { following, loggedIn, pending: mut.isPending, toggle: () => mut.mutate(!following) };
}

/**
 * Inline "Follow" affordance on the reaction row, mirroring the Journal button
 * (ghost pill, tiny icon + label, pinned opposite the reactions) but shown on
 * OTHER traders' cards. Self-gates to null on the viewer's own cards, for
 * guests (the follow graph is X-scoped), and when there's no author id.
 */
function FollowTradeButton({ item }: { item: FeedActivityItem }) {
  const { user, loggedIn } = useXAuth();
  const handle = item.user.x_username?.trim().replace(/^@+/, "") || null;
  const myHandle = user?.x_username?.trim().replace(/^@+/, "").toLowerCase();
  const isMine = !!myHandle && myHandle === handle?.toLowerCase();
  const { following, pending, toggle } = useFollowState(item.user.user_id, handle);

  if (!loggedIn || isMine || !item.user.user_id) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      disabled={pending}
      data-testid={`follow-user-${item.id}`}
      aria-label={following ? `Unfollow @${handle}` : `Follow @${handle}`}
      title={following ? `Unfollow @${handle}` : `Follow @${handle}`}
      className={cn(
        "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors border border-transparent disabled:opacity-60",
        following
          ? "text-accent hover:text-foreground hover:bg-secondary/60"
          : "text-muted-foreground/70 hover:text-foreground hover:bg-secondary/60",
      )}
    >
      {pending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : following ? (
        <UserCheck className="w-3.5 h-3.5" />
      ) : (
        <UserPlus className="w-3.5 h-3.5" />
      )}
      <span>{following ? "Following" : "Follow"}</span>
    </button>
  );
}

const CONVICTION_TONE: Record<string, string> = {
  low: "bg-secondary text-muted-foreground",
  medium: "bg-accent/12 text-accent",
  high: "bg-success/12 text-success",
};

/** A callout feed item: a trader putting a token call on the record. */
function CalloutActivityCard({ item }: { item: FeedActivityItem }) {
  const handle = item.user.x_username?.trim().replace(/^@+/, "") || null;
  const conviction = item.conviction?.toLowerCase() || null;

  return (
    <CardShell
      item={item}
      event={CALLOUT_EVENT}
      lead={
        <>
          <p className="text-sm text-muted-foreground">
            called <TokenLink token={item.token} />
            <TradeLink token={item.token} />
          </p>
          {item.thesis && (
            <p className="mt-1.5 text-sm text-foreground/90 whitespace-pre-wrap break-words">
              {item.thesis}
            </p>
          )}
        </>
      }
    >
      <CalloutPerformance item={item} />

      <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
        <Chip label="Callout" className="bg-accent/12 text-accent" />
        {conviction && CONVICTION_TONE[conviction] && (
          <Chip
            label={`${conviction} conviction`}
            className={CONVICTION_TONE[conviction]}
          />
        )}
        <ViewOnX handle={handle} />
      </div>
    </CardShell>
  );
}

const SENTIMENT_TONE: Record<string, { label: string; cls: string }> = {
  bullish: { label: "Bullish", cls: "bg-success/15 text-success" },
  bearish: { label: "Bearish", cls: "bg-destructive/15 text-destructive" },
  neutral: { label: "Neutral", cls: "bg-secondary text-muted-foreground" },
};

/** A standalone thesis feed item: published research, not graded as a call. */
function ThesisActivityCard({ item }: { item: FeedActivityItem }) {
  const handle = item.user.x_username?.trim().replace(/^@+/, "") || null;
  const conviction = item.conviction?.toLowerCase() || null;
  const sentiment = item.sentiment?.toLowerCase() || null;
  const sent = sentiment ? SENTIMENT_TONE[sentiment] : null;

  return (
    <CardShell
      item={item}
      event={THESIS_EVENT}
      lead={
        <>
          <p className="text-sm text-muted-foreground">
            published a thesis on <TokenLink token={item.token} />
            <TradeLink token={item.token} />
          </p>

          {item.thesisTitle && (
            <p className="mt-1.5 text-sm font-semibold text-foreground break-words">
              {item.thesisTitle}
            </p>
          )}
          {item.thesis && (
            <p className="mt-1 text-sm text-foreground/90 whitespace-pre-wrap break-words line-clamp-4">
              {item.thesis}
            </p>
          )}

          <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
            <Chip label="Thesis" className="bg-accent/12 text-accent" />
            {sent && <Chip label={sent.label} className={sent.cls} />}
            {conviction && CONVICTION_TONE[conviction] && (
              <Chip
                label={`${conviction} conviction`}
                className={CONVICTION_TONE[conviction]}
              />
            )}
            <ViewOnX handle={handle} />
          </div>
        </>
      }
    />
  );
}

/**
 * Premium feed tint per achievement rarity. Higher rarities read richer (glow
 * + chip) so a legendary unlock feels premium in the feed. Falls back to the
 * neutral gold treatment when rarity is absent.
 */
const FEED_RARITY_TINT: Record<
  BadgeRarity,
  { badge: string; chip: string; card: string }
> = {
  common: {
    badge: "bg-zinc-400 text-zinc-900",
    chip: "bg-zinc-500/12 text-zinc-300",
    card: "",
  },
  rare: {
    badge: "bg-sky-500 text-white",
    chip: "bg-sky-500/12 text-sky-300",
    card: "shadow-[0_0_12px_rgba(56,189,248,0.12)]",
  },
  epic: {
    badge: "bg-violet-500 text-white",
    chip: "bg-violet-500/12 text-violet-300",
    card: "shadow-[0_0_14px_rgba(167,139,250,0.16)]",
  },
  legendary: {
    badge: "bg-amber-400 text-amber-950",
    chip: "bg-amber-400/14 text-amber-300",
    card: "shadow-[0_0_16px_rgba(251,191,36,0.2)]",
  },
};

const FEED_RARITY_DEFAULT = {
  badge: "bg-yellow-500 text-yellow-950",
  chip: "bg-yellow-500/12 text-yellow-400",
  card: "",
};

/** Rarity-flavored icon so a legendary unlock reads richer in feed. */
const FEED_RARITY_ICON: Record<BadgeRarity, EventVisual["icon"]> = {
  common: Medal,
  rare: Medal,
  epic: Gem,
  legendary: Crown,
};

function AchievementActivityCard({ item }: { item: FeedActivityItem }) {
  const handle = item.user.x_username?.trim().replace(/^@+/, "") || null;
  const badgeName = item.badgeName || item.badgeKey || "Achievement";
  const description = item.thesis;
  const tint = item.badgeRarity
    ? FEED_RARITY_TINT[item.badgeRarity]
    : FEED_RARITY_DEFAULT;
  const rarityLabel = item.badgeRarity
    ? item.badgeRarity.charAt(0).toUpperCase() + item.badgeRarity.slice(1)
    : null;
  const RarityIcon = item.badgeRarity
    ? FEED_RARITY_ICON[item.badgeRarity]
    : Medal;

  return (
    <CardShell
      item={item}
      event={{ icon: RarityIcon, tone: tint.badge }}
      className={tint.card}
      lead={
        <>
          <p className="text-sm text-muted-foreground">
            earned the{" "}
            <span className="text-foreground font-medium">{badgeName}</span>{" "}
            badge
          </p>

          {description && (
            <p className="mt-1 text-sm text-foreground/70 italic">
              {description}
            </p>
          )}

          <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
            <Chip label={rarityLabel ?? "Achievement"} className={tint.chip} />
            <ViewOnX handle={handle} />
          </div>
        </>
      }
    />
  );
}

/**
 * A recovery feed item: a trader completing a wallet cleanup. Sourced from real
 * recovery_events only (successful cleanups that closed accounts). Surfaces the
 * SOL recovered and accounts closed.
 */
function RecoveryActivityCard({
  item,
  solUsd,
}: {
  item: FeedActivityItem;
  solUsd: number;
}) {
  const handle = item.user.x_username?.trim().replace(/^@+/, "") || null;
  const sol = item.recoveredSol ?? 0;
  const closed = item.accountsClosed ?? 0;

  return (
    <CardShell
      item={item}
      event={RECOVERY_EVENT}
      lead={
        <p className="text-sm text-muted-foreground">
          completed a wallet cleanup
        </p>
      }
    >
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <MetricTile
          label="SOL recovered"
          value={<CurrencyAmount sol={sol} solUsd={solUsd} />}
          valueClass="text-success"
        />
        <MetricTile label="Accounts closed" value={closed.toLocaleString()} />
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
        <Chip label="Recovery" className="bg-accent/12 text-accent" />
        <ViewOnX handle={handle} />
      </div>
    </CardShell>
  );
}

/**
 * A community campaign milestone: launched, funded, or completed. Links to the
 * campaign's public page with its live escrow ledger.
 */
function CampaignActivityCard({ item }: { item: FeedActivityItem }) {
  const verb =
    item.action === "funded"
      ? "fully funded their campaign"
      : item.action === "completed"
        ? "completed their campaign"
        : "launched a campaign";
  const goal = item.campaignGoalSol;

  return (
    <CardShell
      item={item}
      event={CAMPAIGN_EVENT}
      lead={
        <>
          <p className="text-sm text-muted-foreground">
            {verb}
            {item.thesisTitle && (
              <>
                {": "}
                <span className="text-foreground font-medium">
                  {item.thesisTitle}
                </span>
              </>
            )}
          </p>

          <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
            <Chip label="Campaign" className="bg-accent/12 text-accent" />
            {goal != null && goal > 0 && (
              <span className="text-muted-foreground">
                Goal {fmtSol(goal)} SOL
              </span>
            )}
            {item.campaignPublicId && (
              <Link
                href={`/campaigns/${item.campaignPublicId}`}
                className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent transition-colors"
              >
                View campaign <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>
        </>
      }
    />
  );
}

/**
 * Aggregated trade card — a burst of buys/sells in one token collapsed into a
 * single story ("accumulated BONK — 5 buys over 18 minutes") with metric
 * tiles and an expandable per-trade breakdown for power users.
 */
function AggTradeCard({
  item,
  solUsd,
}: {
  item: FeedActivityItem;
  solUsd: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = (item.meta ?? {}) as unknown as FeedAggMeta;
  const isBuy = item.action === "accumulated";
  const verb = isBuy
    ? "accumulated"
    : item.action === "took_profits"
      ? "took profits on"
      : "exited";
  const count = meta.tradeCount ?? 0;
  const sideWord = isBuy ? "buy" : "sell";
  const subtitle = `${count} ${sideWord}${count === 1 ? "" : "s"} over ${windowLabel(
    meta.windowStart ?? item.timestamp,
    meta.windowEnd ?? item.timestamp,
  )}`;
  const breakdown = Array.isArray(meta.breakdown) ? meta.breakdown : [];

  return (
    <CardShell
      item={item}
      event={isBuy ? BUY_EVENT : SELL_EVENT}
      lead={
        <>
          <p className="text-sm text-muted-foreground">
            {verb} <TokenLink token={item.token} />
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">{subtitle}</p>
        </>
      }
    >
      <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricTile
          label={isBuy ? "Avg Entry" : "Avg Exit"}
          value={
            meta.avgMarketCapUsd != null
              ? `${fmtMarketCap(meta.avgMarketCapUsd)} MC`
              : "—"
          }
        />
        <MetricTile
          label="Total Size"
          value={<CurrencyAmount sol={meta.totalSol} solUsd={solUsd} />}
        />
        <MetricTile label={isBuy ? "Buys" : "Sells"} value={String(count)} />
        {isBuy ? (
          <MetricTile
            label="Window"
            value={windowLabel(
              meta.windowStart ?? item.timestamp,
              meta.windowEnd ?? item.timestamp,
            )}
          />
        ) : (
          <MetricTile
            label="Realized PnL"
            value={
              meta.totalPnlSol != null ? (
                <PnlAmount sol={meta.totalPnlSol} solUsd={solUsd} />
              ) : (
                "—"
              )
            }
            valueClass={
              meta.totalPnlSol == null
                ? undefined
                : meta.totalPnlSol > 0
                  ? "text-success"
                  : meta.totalPnlSol < 0
                    ? "text-danger"
                    : undefined
            }
          />
        )}
      </div>

      {breakdown.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            data-testid={`agg-expand-${item.id}`}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent transition-colors"
          >
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
            {expanded ? "Hide breakdown" : "View breakdown"}
          </button>
          {expanded && (
            <div className="mt-2 rounded-lg bg-secondary/30 border border-border/40 divide-y divide-border/40">
              {breakdown.map((t, i) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                >
                  <span className="text-muted-foreground/70 flex-shrink-0">
                    {isBuy ? "Buy" : "Sell"} {i + 1}
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {t.marketCapUsd != null
                      ? `${fmtMarketCap(t.marketCapUsd)} MC`
                      : "—"}
                  </span>
                  <span className="font-mono tabular-nums text-foreground">
                    <CurrencyAmount sol={t.solAmount} solUsd={solUsd} />
                  </span>
                  {!isBuy && (
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        t.pnlSol != null && t.pnlSol > 0
                          ? "text-success"
                          : t.pnlSol != null && t.pnlSol < 0
                            ? "text-danger"
                            : "text-muted-foreground",
                      )}
                    >
                      {t.pnlSol != null ? (
                        <PnlAmount sol={t.pnlSol} solUsd={solUsd} unit={false} />
                      ) : (
                        "—"
                      )}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 text-xs">
        <Chip
          label={isBuy ? "Accumulation" : "Exit"}
          className={
            isBuy ? "bg-success/12 text-success" : "bg-danger/12 text-danger"
          }
        />
      </div>
    </CardShell>
  );
}

/**
 * Published milestone card (feed_events): tier promotions, follower
 * milestones and future DNA / AI events. Celebratory but premium — subtle
 * glow, no confetti.
 */
const MILESTONE_STYLE: Record<
  string,
  { icon: EventVisual["icon"]; badge: string; chip: string; chipCls: string; glow: string }
> = {
  tier_up: {
    icon: Flame,
    badge: "bg-amber-400 text-amber-950",
    chip: "Milestone",
    chipCls: "bg-amber-400/14 text-amber-300",
    glow: "shadow-[0_0_14px_rgba(251,191,36,0.14)]",
  },
  follower_milestone: {
    icon: Users,
    badge: "bg-sky-500 text-white",
    chip: "Community",
    chipCls: "bg-sky-500/12 text-sky-300",
    glow: "",
  },
};

const MILESTONE_DEFAULT = {
  icon: Trophy,
  badge: "bg-accent text-accent-foreground",
  chip: "Milestone",
  chipCls: "bg-accent/12 text-accent",
  glow: "",
};

function MilestoneCard({ item }: { item: FeedActivityItem }) {
  const style = MILESTONE_STYLE[item.action] ?? MILESTONE_DEFAULT;

  return (
    <CardShell
      item={item}
      event={{ icon: style.icon, tone: style.badge }}
      className={style.glow}
      lead={
        <>
          {item.thesisTitle && (
            <p className="text-sm font-semibold text-foreground">
              {item.thesisTitle}
            </p>
          )}
          {item.thesis && (
            <p className="mt-0.5 text-sm text-muted-foreground">{item.thesis}</p>
          )}

          <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
            <Chip label={style.chip} className={style.chipCls} />
          </div>
        </>
      }
    />
  );
}

/**
 * Metric tiles for perps events, from the structured meta payload: entry/exit
 * market cap, margin, position size, and the liquidation trigger when the
 * position was liquidated. Renders nothing for pre-upgrade rows without meta.
 */
function LeverageMetrics({
  item,
  solUsd,
}: {
  item: FeedActivityItem;
  solUsd: number;
}) {
  const meta = (item.meta ?? {}) as {
    marginSol?: number | null;
    notionalSol?: number | null;
    marketCapUsd?: number | null;
    triggerMc?: number | null;
  };
  const isOpen = item.action === "open";
  const isLiq = item.action === "liquidated";
  const tiles: { label: string; value: React.ReactNode; valueClass?: string }[] = [];
  if (meta.marketCapUsd != null && meta.marketCapUsd > 0) {
    tiles.push({
      label: isOpen ? "Entry MC" : "Exit MC",
      value: `${fmtMarketCap(meta.marketCapUsd)}`,
    });
  }
  if (isLiq && meta.triggerMc != null && meta.triggerMc > 0) {
    tiles.push({
      label: "Liq. Trigger",
      value: `${fmtMarketCap(meta.triggerMc)}`,
      valueClass: "text-danger",
    });
  }
  if (meta.marginSol != null && meta.marginSol > 0) {
    tiles.push({
      label: "Margin",
      value: <CurrencyAmount sol={meta.marginSol} solUsd={solUsd} />,
    });
  }
  if (meta.notionalSol != null && meta.notionalSol > 0) {
    tiles.push({
      label: "Position Size",
      value: <CurrencyAmount sol={meta.notionalSol} solUsd={solUsd} />,
    });
  }
  if (tiles.length === 0) return null;
  return (
    <div
      className={cn(
        "mt-2.5 grid grid-cols-2 gap-2",
        tiles.length >= 3 ? "sm:grid-cols-4" : "sm:grid-cols-2",
      )}
    >
      {tiles.map((t) => (
        <MetricTile
          key={t.label}
          label={t.label}
          value={t.value}
          valueClass={t.valueClass}
        />
      ))}
    </div>
  );
}

/**
 * Metric tiles for a spot buy/sell, from values captured at execution: the SOL
 * size (with SOL/USD toggle), the market cap at fill (entry for buys, exit for
 * sells) and — sells only — realized PnL. Renders nothing for legacy rows that
 * predate these columns, so the card stays honest instead of showing zeros.
 */
function SpotMetrics({
  item,
  solUsd,
}: {
  item: FeedActivityItem;
  solUsd: number;
}) {
  const isBuy = item.action === "buy";
  const amount = item.tradeSolAmount;
  const mc = item.tradeMarketCapUsd;
  const pnl = item.pnlSol;
  const tiles: { label: string; value: React.ReactNode; valueClass?: string }[] = [];
  if (amount != null && amount > 0) {
    tiles.push({
      label: isBuy ? "Bought" : "Sold",
      value: <CurrencyAmount sol={amount} solUsd={solUsd} />,
    });
  }
  if (mc != null && mc > 0) {
    tiles.push({
      label: isBuy ? "Entry MC" : "Exit MC",
      value: fmtMarketCap(mc),
    });
  }
  if (!isBuy && pnl != null && Number.isFinite(pnl)) {
    tiles.push({
      label: "Realized PnL",
      value: <PnlAmount sol={pnl} solUsd={solUsd} unit={false} />,
      valueClass:
        pnl > 0 ? "text-success" : pnl < 0 ? "text-danger" : undefined,
    });
  }
  if (tiles.length === 0) return null;
  return (
    <div
      className={cn(
        "mt-2.5 grid grid-cols-2 gap-2",
        tiles.length >= 3 && "sm:grid-cols-3",
      )}
    >
      {tiles.map((t) => (
        <MetricTile
          key={t.label}
          label={t.label}
          value={t.value}
          valueClass={t.valueClass}
        />
      ))}
    </div>
  );
}

/**
 * The spot/leverage trade card (the default, highest-volume card). Buys, sells,
 * perps opens/closes/liquidations. All other kinds are dispatched to their own
 * card above.
 */
export function TradeActivityCard({
  item,
  solUsd,
}: {
  item: FeedActivityItem;
  solUsd: number;
}) {
  if (item.kind === "agg") {
    return <AggTradeCard item={item} solUsd={solUsd} />;
  }
  if (item.kind === "milestone") {
    return <MilestoneCard item={item} />;
  }
  if (item.kind === "callout") {
    return <CalloutActivityCard item={item} />;
  }
  if (item.kind === "thesis") {
    return <ThesisActivityCard item={item} />;
  }
  if (item.kind === "achievement") {
    return <AchievementActivityCard item={item} />;
  }
  if (item.kind === "recovery") {
    return <RecoveryActivityCard item={item} solUsd={solUsd} />;
  }
  if (item.kind === "campaign") {
    return <CampaignActivityCard item={item} />;
  }

  const handle = item.user.x_username?.trim().replace(/^@+/, "") || null;

  let verb: React.ReactNode;
  let event: EventVisual;
  if (item.kind === "spot") {
    if (item.action === "buy") {
      verb = (
        <>
          bought <TokenLink token={item.token} />
        </>
      );
      event = BUY_EVENT;
    } else {
      verb = (
        <>
          sold <TokenLink token={item.token} />
        </>
      );
      event = SELL_EVENT;
    }
  } else {
    const lev = item.leverage ? `${item.leverage}×` : "";
    const dir = (item.direction || "").toUpperCase();
    const isLiq = item.action === "liquidated";
    const isShort = item.direction === "short";
    event = isLiq
      ? PERPS_LIQ_EVENT
      : isShort
        ? PERPS_SHORT_EVENT
        : PERPS_LONG_EVENT;
    if (item.action === "open") {
      verb = (
        <>
          opened a {lev} {dir} on <TokenLink token={item.token} />
        </>
      );
    } else if (isLiq) {
      verb = (
        <>
          was liquidated on <TokenLink token={item.token} />
        </>
      );
    } else {
      verb = (
        <>
          closed a {lev} {dir} on <TokenLink token={item.token} />
        </>
      );
    }
  }

  const showPnl = item.pnlSol != null && Number.isFinite(item.pnlSol);

  // Directional perps chip tint (matches the corner-badge cue) + a subtle
  // critical glow on liquidations. Spot keeps the neutral chip, no glow.
  const isPerps = item.kind === "leverage";
  const perpsLiq = isPerps && item.action === "liquidated";
  const perpsShort = isPerps && item.direction === "short";
  const chipClass = !isPerps
    ? "bg-secondary text-muted-foreground"
    : perpsLiq
      ? "bg-red-500/15 text-red-300"
      : perpsShort
        ? "bg-orange-500/12 text-orange-300"
        : "bg-cyan-500/12 text-cyan-300";

  return (
    <CardShell
      item={item}
      event={event}
      className={perpsLiq ? "shadow-[0_0_14px_rgba(239,68,68,0.16)]" : undefined}
      lead={
        <p className="text-sm text-muted-foreground">
          {verb}
          <TradeLink token={item.token} />
        </p>
      }
    >
      {item.kind === "leverage" && (
        <LeverageMetrics item={item} solUsd={solUsd} />
      )}
      {item.kind === "spot" && <SpotMetrics item={item} solUsd={solUsd} />}

      <div className="mt-2 flex items-center gap-2 text-xs">
        <Chip label={isPerps ? "Perps" : "Spot"} className={chipClass} />
        {showPnl && item.kind === "leverage" && (
          <span
            className={cn(
              "font-mono",
              (item.pnlSol as number) > 0
                ? "text-success"
                : (item.pnlSol as number) < 0
                  ? "text-danger"
                  : "text-muted-foreground",
            )}
          >
            <PnlAmount sol={item.pnlSol} solUsd={solUsd} unit={false} />
          </span>
        )}
        <ViewOnX handle={handle} />
      </div>
    </CardShell>
  );
}

/**
 * Placeholder card for a feature whose engine doesn't exist yet (callouts,
 * token theses, achievements). Keeps the layout coherent and signals what's
 * coming without faking data.
 */
export function PlaceholderCard({
  kind,
  title,
  body,
  icon,
}: {
  kind: "callout" | "thesis" | "achievement";
  title: string;
  body: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const Icon =
    icon ??
    (kind === "callout" ? Megaphone : kind === "thesis" ? ScrollText : Trophy);
  return (
    <div
      data-testid={`placeholder-${kind}`}
      className="rounded-xl border border-dashed border-border bg-card/40 p-5 flex items-start gap-3"
    >
      <Icon className="w-5 h-5 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-foreground font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{body}</p>
      </div>
    </div>
  );
}

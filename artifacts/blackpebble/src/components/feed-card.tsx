import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Crown,
  ExternalLink,
  Flame,
  Gem,
  Megaphone,
  Medal,
  ScrollText,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import type {
  BadgeRarity,
  FeedActivityItem,
  FeedAggMeta,
} from "@/lib/api";
import { ReactionBar } from "@/components/feed-reactions";
import {
  fmtMarketCap,
  fmtMultiple,
  multipleTone,
  shortAddr,
  timeAgo,
  xProfileUrl,
} from "@/lib/format";
import { PnlAmount } from "@/components/pnl-amount";
import { UserIdentity } from "@/components/user-identity";
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

/** One labelled stat in a callout performance block. */
function PerfStat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
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
 * all data-dense feed cards.
 */
function MetricTile({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
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

/** Format SOL with sensible precision for feed tiles. */
function fmtSolAmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const digits = abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
  return `${Number(v.toFixed(digits)).toLocaleString("en-US")} SOL`;
}

/**
 * Metric tiles for perps events, from the structured meta payload: entry/exit
 * market cap, margin, position size, and the liquidation trigger when the
 * position was liquidated. Renders nothing for pre-upgrade rows without meta.
 */
function LeverageMetrics({ item }: { item: FeedActivityItem }) {
  const meta = (item.meta ?? {}) as {
    marginSol?: number | null;
    notionalSol?: number | null;
    marketCapUsd?: number | null;
    triggerMc?: number | null;
  };
  const isOpen = item.action === "open";
  const isLiq = item.action === "liquidated";
  const tiles: { label: string; value: string; valueClass?: string }[] = [];
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
    tiles.push({ label: "Margin", value: fmtSolAmt(meta.marginSol) });
  }
  if (meta.notionalSol != null && meta.notionalSol > 0) {
    tiles.push({ label: "Position Size", value: fmtSolAmt(meta.notionalSol) });
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

/** Avatar + display name/handle that links to the in-app profile. */
export function FeedUserLink({
  user,
}: {
  user: FeedActivityItem["user"];
}) {
  const handle = user.x_username?.trim().replace(/^@+/, "") || null;
  return (
    <UserIdentity
      avatarUrl={user.x_avatar_url}
      displayName={user.x_display_name}
      handle={user.x_username}
      officialBadges={user.official_badges}
      accountStatus="member"
      tier={user.graduation_tier}
      size="md"
      badgeSize="xs"
      tierVariant="plain"
      tierPosition="below"
      nameLink={
        handle
          ? { type: "internal", href: `/u/${encodeURIComponent(handle)}` }
          : undefined
      }
      testIdName={handle ? `link-profile-${handle}` : undefined}
      subline={
        user.trustScore != null && user.trustScore > 0 ? (
          <div className="mt-0.5">
            <TrustBadge
              score={user.trustScore}
              label={trustLabelFromScore(user.trustScore)}
              size="xs"
              showLabel={false}
            />
          </div>
        ) : undefined
      }
    />
  );
}

/**
 * Renders a single piece of public trading activity (spot or leverage). This is
 * the primary reusable feed card; callout / thesis / achievement cards are
 * placeholders below until those engines exist.
 */
const CONVICTION_TONE: Record<string, string> = {
  low: "bg-secondary text-muted-foreground",
  medium: "bg-accent/12 text-accent",
  high: "bg-success/12 text-success",
};

/** A callout feed item: a trader putting a token call on the record. */
function CalloutActivityCard({ item }: { item: FeedActivityItem }) {
  const handle = item.user.x_username?.trim().replace(/^@+/, "") || null;
  const profileUrl = xProfileUrl(handle);
  const conviction = item.conviction?.toLowerCase() || null;

  return (
    <div
      data-testid={`feed-card-${item.id}`}
      className="rounded-xl bg-card shadow-card p-4 flex items-start gap-3 transition-colors hover:bg-surface-3"
    >
      <div className="mt-0.5 flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-accent/12 text-accent">
        <Megaphone className="w-[18px] h-[18px]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <FeedUserLink user={item.user} />
          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {timeAgo(item.timestamp)}
          </span>
        </div>

        <p className="mt-1.5 text-sm text-muted-foreground">
          called <TokenLink token={item.token} />
          {item.token.mint && (
            <Link
              href={`/?token=${item.token.mint}`}
              onClick={(e) => e.stopPropagation()}
              className="ml-1 text-[11px] text-accent/80 hover:text-accent"
            >
              trade
            </Link>
          )}
        </p>

        {item.thesis && (
          <p className="mt-1.5 text-sm text-foreground/90 whitespace-pre-wrap break-words">
            {item.thesis}
          </p>
        )}

        <CalloutPerformance item={item} />

        <div className="mt-1.5 flex items-center gap-3 text-xs flex-wrap">
          <span className="uppercase tracking-wider text-[10px] font-semibold rounded-full px-2 py-0.5 bg-accent/12 text-accent">
            Callout
          </span>
          {conviction && CONVICTION_TONE[conviction] && (
            <span
              className={cn(
                "uppercase tracking-wider text-[10px] font-semibold rounded-full px-2 py-0.5",
                CONVICTION_TONE[conviction],
              )}
            >
              {conviction} conviction
            </span>
          )}
          {profileUrl && (
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
          )}
        </div>

        <ReactionBar item={item} />
      </div>
    </div>
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
  const profileUrl = xProfileUrl(handle);
  const conviction = item.conviction?.toLowerCase() || null;
  const sentiment = item.sentiment?.toLowerCase() || null;
  const sent = sentiment ? SENTIMENT_TONE[sentiment] : null;

  return (
    <div
      data-testid={`feed-card-${item.id}`}
      className="rounded-xl bg-card shadow-card p-4 flex items-start gap-3 transition-colors hover:bg-surface-3"
    >
      <div className="mt-0.5 flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-accent/12 text-accent">
        <ScrollText className="w-[18px] h-[18px]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <FeedUserLink user={item.user} />
          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {timeAgo(item.timestamp)}
          </span>
        </div>

        <p className="mt-1.5 text-sm text-muted-foreground">
          published a thesis on{" "}
          <TokenLink token={item.token} />
          {item.token.mint && (
            <Link
              href={`/?token=${item.token.mint}`}
              onClick={(e) => e.stopPropagation()}
              className="ml-1 text-[11px] text-accent/80 hover:text-accent"
            >
              trade
            </Link>
          )}
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

        <div className="mt-1.5 flex items-center gap-3 text-xs flex-wrap">
          <span className="uppercase tracking-wider text-[10px] font-semibold rounded-full px-2 py-0.5 bg-accent/12 text-accent">
            Thesis
          </span>
          {sent && (
            <span
              className={cn(
                "uppercase tracking-wider text-[10px] font-semibold rounded-full px-2 py-0.5",
                sent.cls,
              )}
            >
              {sent.label}
            </span>
          )}
          {conviction && CONVICTION_TONE[conviction] && (
            <span
              className={cn(
                "uppercase tracking-wider text-[10px] font-semibold rounded-full px-2 py-0.5",
                CONVICTION_TONE[conviction],
              )}
            >
              {conviction} conviction
            </span>
          )}
          {profileUrl && (
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
          )}
        </div>

        <ReactionBar item={item} />
      </div>
    </div>
  );
}

/**
 * Premium feed tint per achievement rarity. Higher rarities read richer (icon
 * medallion, glow, chip) so a legendary unlock feels premium in the feed.
 * Falls back to the neutral gold treatment when rarity is absent.
 */
const FEED_RARITY_TINT: Record<
  BadgeRarity,
  { icon: string; chip: string; card: string }
> = {
  common: {
    icon: "bg-zinc-500/12 text-zinc-300",
    chip: "bg-zinc-500/12 text-zinc-300",
    card: "",
  },
  rare: {
    icon: "bg-sky-500/12 text-sky-300",
    chip: "bg-sky-500/12 text-sky-300",
    card: "shadow-[0_0_12px_rgba(56,189,248,0.12)]",
  },
  epic: {
    icon: "bg-violet-500/12 text-violet-300",
    chip: "bg-violet-500/12 text-violet-300",
    card: "shadow-[0_0_14px_rgba(167,139,250,0.16)]",
  },
  legendary: {
    icon: "bg-amber-400/14 text-amber-300",
    chip: "bg-amber-400/14 text-amber-300",
    card: "shadow-[0_0_16px_rgba(251,191,36,0.2)]",
  },
};

const FEED_RARITY_DEFAULT = {
  icon: "bg-yellow-500/12 text-yellow-400",
  chip: "bg-yellow-500/12 text-yellow-400",
  card: "",
};

/** Rarity-flavored medallion icon so a legendary unlock reads richer in feed. */
const FEED_RARITY_ICON: Record<BadgeRarity, typeof Medal> = {
  common: Medal,
  rare: Medal,
  epic: Gem,
  legendary: Crown,
};

function AchievementActivityCard({ item }: { item: FeedActivityItem }) {
  const handle = item.user.x_username?.trim().replace(/^@+/, "") || null;
  const profileUrl = xProfileUrl(handle);
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
    <div
      data-testid={`feed-card-${item.id}`}
      className={cn(
        "rounded-xl bg-card shadow-card p-4 flex items-start gap-3 transition-colors hover:bg-surface-3",
        tint.card,
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full",
          tint.icon,
        )}
      >
        <RarityIcon className="w-[18px] h-[18px]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <FeedUserLink user={item.user} />
          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {timeAgo(item.timestamp)}
          </span>
        </div>

        <p className="mt-1.5 text-sm text-muted-foreground">
          earned the{" "}
          <span className="text-foreground font-medium">{badgeName}</span>{" "}
          badge
        </p>

        {description && (
          <p className="mt-1 text-sm text-foreground/70 italic">
            {description}
          </p>
        )}

        <div className="mt-1.5 flex items-center gap-3 text-xs flex-wrap">
          <span
            className={cn(
              "uppercase tracking-wider text-[10px] font-semibold rounded-full px-2 py-0.5",
              tint.chip,
            )}
          >
            {rarityLabel ?? "Achievement"}
          </span>
          {profileUrl && (
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
          )}
        </div>

        <ReactionBar item={item} />
      </div>
    </div>
  );
}

/** Format a SOL amount for the recovery card: trim trailing zeros, max 4 dp. */
function fmtSol(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "0";
  return Number(v.toFixed(4)).toString();
}

/**
 * A recovery feed item: a trader completing a wallet cleanup. Sourced from real
 * recovery_events only (successful cleanups that closed accounts). Surfaces the
 * SOL recovered and accounts closed, reusing the standard feed card styling.
 */
function RecoveryActivityCard({ item }: { item: FeedActivityItem }) {
  const handle = item.user.x_username?.trim().replace(/^@+/, "") || null;
  const profileUrl = xProfileUrl(handle);
  const sol = item.recoveredSol ?? 0;
  const closed = item.accountsClosed ?? 0;

  return (
    <div
      data-testid={`feed-card-${item.id}`}
      className="rounded-xl bg-card shadow-card p-4 flex items-start gap-3 transition-colors hover:bg-surface-3"
    >
      <div className="mt-0.5 flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-accent/12 text-accent">
        <Sparkles className="w-[18px] h-[18px]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <FeedUserLink user={item.user} />
          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {timeAgo(item.timestamp)}
          </span>
        </div>

        <p className="mt-1.5 text-sm text-muted-foreground">
          completed a wallet cleanup
        </p>

        <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-secondary/40 px-3 py-2.5">
          <PerfStat
            label="SOL recovered"
            value={`${fmtSol(sol)} SOL`}
            valueClass="text-success"
          />
          <PerfStat label="Accounts closed" value={closed.toLocaleString()} />
        </div>

        <div className="mt-1.5 flex items-center gap-3 text-xs flex-wrap">
          <span className="uppercase tracking-wider text-[10px] font-semibold rounded-full px-2 py-0.5 bg-accent/12 text-accent">
            Recovery
          </span>
          {profileUrl && (
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
          )}
        </div>

        <ReactionBar item={item} />
      </div>
    </div>
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
    <div
      data-testid={`feed-card-${item.id}`}
      className="rounded-xl bg-card shadow-card p-4 flex items-start gap-3 transition-colors hover:bg-surface-3"
    >
      <div className="mt-0.5 flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-accent/12 text-accent">
        <Megaphone className="w-[18px] h-[18px]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <FeedUserLink user={item.user} />
          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {timeAgo(item.timestamp)}
          </span>
        </div>

        <p className="mt-1.5 text-sm text-muted-foreground">
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

        <div className="mt-1.5 flex items-center gap-3 text-xs flex-wrap">
          <span className="uppercase tracking-wider text-[10px] font-semibold rounded-full px-2 py-0.5 bg-accent/12 text-accent">
            Campaign
          </span>
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

        <ReactionBar item={item} />
      </div>
    </div>
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
    <div
      data-testid={`feed-card-${item.id}`}
      className="rounded-xl bg-card shadow-card p-4 flex items-start gap-3 transition-colors hover:bg-surface-3"
    >
      <div
        className={cn(
          "mt-0.5 flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full",
          isBuy
            ? "bg-success/12 text-success"
            : "bg-danger/12 text-danger",
        )}
      >
        {isBuy ? (
          <ArrowUpRight className="w-[18px] h-[18px]" />
        ) : (
          <ArrowDownRight className="w-[18px] h-[18px]" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <FeedUserLink user={item.user} />
          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {timeAgo(item.timestamp)}
          </span>
        </div>

        <p className="mt-1.5 text-sm text-muted-foreground">
          {verb} <TokenLink token={item.token} />
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">{subtitle}</p>

        <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricTile
            label={isBuy ? "Avg Entry" : "Avg Exit"}
            value={
              meta.avgMarketCapUsd != null
                ? `${fmtMarketCap(meta.avgMarketCapUsd)} MC`
                : "—"
            }
          />
          <MetricTile label="Total Size" value={fmtSolAmt(meta.totalSol)} />
          <MetricTile
            label={isBuy ? "Buys" : "Sells"}
            value={String(count)}
          />
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
                meta.totalPnlSol != null ? fmtSolAmt(meta.totalPnlSol) : "—"
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
                      {fmtSolAmt(t.solAmount)}
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

        <div className="mt-1.5 flex items-center gap-3 text-xs">
          <span
            className={cn(
              "uppercase tracking-wider text-[10px] font-semibold rounded-full px-2 py-0.5",
              isBuy
                ? "bg-success/12 text-success"
                : "bg-danger/12 text-danger",
            )}
          >
            {isBuy ? "Accumulation" : "Exit"}
          </span>
        </div>

        <ReactionBar item={item} />
      </div>
    </div>
  );
}

/**
 * Published milestone card (feed_events): tier promotions, follower
 * milestones and future DNA / AI events. Celebratory but premium — subtle
 * glow, no confetti.
 */
const MILESTONE_STYLE: Record<
  string,
  { icon: typeof Trophy; iconCls: string; chip: string; chipCls: string; glow: string }
> = {
  tier_up: {
    icon: Flame,
    iconCls: "bg-amber-400/14 text-amber-300",
    chip: "Milestone",
    chipCls: "bg-amber-400/14 text-amber-300",
    glow: "shadow-[0_0_14px_rgba(251,191,36,0.14)]",
  },
  follower_milestone: {
    icon: Users,
    iconCls: "bg-sky-500/12 text-sky-300",
    chip: "Community",
    chipCls: "bg-sky-500/12 text-sky-300",
    glow: "",
  },
};

const MILESTONE_DEFAULT = {
  icon: Trophy,
  iconCls: "bg-accent/12 text-accent",
  chip: "Milestone",
  chipCls: "bg-accent/12 text-accent",
  glow: "",
};

function MilestoneCard({ item }: { item: FeedActivityItem }) {
  const style = MILESTONE_STYLE[item.action] ?? MILESTONE_DEFAULT;
  const Icon = style.icon;

  return (
    <div
      data-testid={`feed-card-${item.id}`}
      className={cn(
        "rounded-xl bg-card shadow-card p-4 flex items-start gap-3 transition-colors hover:bg-surface-3",
        style.glow,
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full",
          style.iconCls,
        )}
      >
        <Icon className="w-[18px] h-[18px]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <FeedUserLink user={item.user} />
          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {timeAgo(item.timestamp)}
          </span>
        </div>

        {item.thesisTitle && (
          <p className="mt-1.5 text-sm font-semibold text-foreground">
            {item.thesisTitle}
          </p>
        )}
        {item.thesis && (
          <p className="mt-0.5 text-sm text-muted-foreground">{item.thesis}</p>
        )}

        <div className="mt-1.5 flex items-center gap-3 text-xs flex-wrap">
          <span
            className={cn(
              "uppercase tracking-wider text-[10px] font-semibold rounded-full px-2 py-0.5",
              style.chipCls,
            )}
          >
            {style.chip}
          </span>
        </div>

        <ReactionBar item={item} />
      </div>
    </div>
  );
}

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
    return <RecoveryActivityCard item={item} />;
  }
  if (item.kind === "campaign") {
    return <CampaignActivityCard item={item} />;
  }

  const handle = item.user.x_username?.trim().replace(/^@+/, "") || null;
  const profileUrl = xProfileUrl(handle);

  let verb: React.ReactNode;
  let tone: "buy" | "sell" | "neutral" = "neutral";
  if (item.kind === "spot") {
    if (item.action === "buy") {
      verb = (
        <>
          bought <TokenLink token={item.token} />
        </>
      );
      tone = "buy";
    } else {
      verb = (
        <>
          sold <TokenLink token={item.token} />
        </>
      );
      tone = "sell";
    }
  } else {
    const lev = item.leverage ? `${item.leverage}×` : "";
    const dir = (item.direction || "").toUpperCase();
    if (item.action === "open") {
      verb = (
        <>
          opened a {lev} {dir} on{" "}
          <TokenLink token={item.token} />
        </>
      );
      tone = "buy";
    } else if (item.action === "liquidated") {
      verb = (
        <>
          was liquidated on{" "}
          <TokenLink token={item.token} />
        </>
      );
      tone = "sell";
    } else {
      verb = (
        <>
          closed a {lev} {dir} on{" "}
          <TokenLink token={item.token} />
        </>
      );
      tone = "sell";
    }
  }

  const showPnl = item.pnlSol != null && Number.isFinite(item.pnlSol);

  return (
    <div
      data-testid={`feed-card-${item.id}`}
      className="rounded-xl bg-card shadow-card p-4 flex items-start gap-3 transition-colors hover:bg-surface-3"
    >
      <div
        className={cn(
          "mt-0.5 flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full",
          tone === "buy"
            ? "bg-success/12 text-success"
            : tone === "sell"
              ? "bg-danger/12 text-danger"
              : "bg-secondary text-muted-foreground",
        )}
      >
        {item.kind === "leverage" ? (
          <Zap className="w-[18px] h-[18px]" />
        ) : tone === "buy" ? (
          <ArrowUpRight className="w-[18px] h-[18px]" />
        ) : (
          <ArrowDownRight className="w-[18px] h-[18px]" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <FeedUserLink user={item.user} />
          <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {timeAgo(item.timestamp)}
          </span>
        </div>

        <p className="mt-1.5 text-sm text-muted-foreground">
          {verb}
          {item.token.mint && (
            <Link
              href={`/?token=${item.token.mint}`}
              onClick={(e) => e.stopPropagation()}
              className="ml-1 text-[11px] text-accent/80 hover:text-accent"
            >
              trade
            </Link>
          )}
        </p>

        {item.kind === "leverage" && <LeverageMetrics item={item} />}

        <div className="mt-1.5 flex items-center gap-3 text-xs">
          <span
            className={cn(
              "uppercase tracking-wider text-[10px] font-semibold rounded-full px-2 py-0.5",
              item.kind === "leverage"
                ? "bg-accent/12 text-accent"
                : "bg-secondary text-muted-foreground",
            )}
          >
            {item.kind === "leverage" ? "Perps" : "Spot"}
          </span>
          {showPnl && (
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
          {profileUrl && (
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
          )}
        </div>

        <ReactionBar item={item} />
      </div>
    </div>
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

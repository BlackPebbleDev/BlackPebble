import { Link } from "wouter";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Megaphone,
  ScrollText,
  Trophy,
  Zap,
} from "lucide-react";
import type { FeedActivityItem } from "@/lib/api";
import {
  fmtMarketCap,
  fmtMultiple,
  multipleTone,
  shortAddr,
  timeAgo,
  xProfileUrl,
} from "@/lib/format";
import { PnlAmount } from "@/components/pnl-amount";
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
 * Live performance block for a callout — Called MC, Current MC, Current X and
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

function Avatar({
  url,
  name,
  size = 36,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  const initial = name.replace(/^@+/, "").slice(0, 2).toUpperCase() || "?";
  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={{ width: size, height: size }}
        className="rounded-full object-cover flex-shrink-0"
        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-secondary flex items-center justify-center text-[11px] text-muted-foreground flex-shrink-0 font-mono"
    >
      {initial}
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
  const displayName = user.x_display_name?.trim() || null;
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar url={user.x_avatar_url} name={displayName || handle || "?"} />
      <div className="min-w-0 leading-tight">
        {handle ? (
          <Link
            href={`/u/${encodeURIComponent(handle)}`}
            onClick={(e) => e.stopPropagation()}
            data-testid={`link-profile-${handle}`}
            className="block truncate text-foreground font-medium hover:text-accent transition-colors"
          >
            {displayName || `@${handle}`}
          </Link>
        ) : (
          <span className="block truncate text-foreground font-medium">
            {displayName || "Anonymous"}
          </span>
        )}
        {handle && (
          <span className="block truncate text-[11px] text-muted-foreground">
            @{handle}
          </span>
        )}
      </div>
    </div>
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
  high: "bg-emerald-500/12 text-emerald-400",
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
  if (item.kind === "callout") {
    return <CalloutActivityCard item={item} />;
  }
  if (item.kind === "thesis") {
    return <ThesisActivityCard item={item} />;
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
            ? "bg-emerald-500/12 text-emerald-400"
            : tone === "sell"
              ? "bg-red-500/12 text-red-400"
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

        <div className="mt-1.5 flex items-center gap-3 text-xs">
          <span
            className={cn(
              "uppercase tracking-wider text-[10px] font-semibold rounded-full px-2 py-0.5",
              item.kind === "leverage"
                ? "bg-accent/12 text-accent"
                : "bg-secondary text-muted-foreground",
            )}
          >
            {item.kind === "leverage" ? "Leverage" : "Spot"}
          </span>
          {showPnl && (
            <span
              className={cn(
                "font-mono",
                (item.pnlSol as number) > 0
                  ? "text-emerald-400"
                  : (item.pnlSol as number) < 0
                    ? "text-red-400"
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

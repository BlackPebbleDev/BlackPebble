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
import { shortAddr, timeAgo, xProfileUrl } from "@/lib/format";
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
export function TradeActivityCard({
  item,
  solUsd,
}: {
  item: FeedActivityItem;
  solUsd: number;
}) {
  const token = tokenLabel(item.token);
  const handle = item.user.x_username?.trim().replace(/^@+/, "") || null;
  const profileUrl = xProfileUrl(handle);

  let verb: React.ReactNode;
  let tone: "buy" | "sell" | "neutral" = "neutral";
  if (item.kind === "spot") {
    if (item.action === "buy") {
      verb = (
        <>
          bought <span className="text-foreground font-medium">{token}</span>
        </>
      );
      tone = "buy";
    } else {
      verb = (
        <>
          sold <span className="text-foreground font-medium">{token}</span>
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
          <span className="text-foreground font-medium">{token}</span>
        </>
      );
      tone = "buy";
    } else if (item.action === "liquidated") {
      verb = (
        <>
          was liquidated on{" "}
          <span className="text-foreground font-medium">{token}</span>
        </>
      );
      tone = "sell";
    } else {
      verb = (
        <>
          closed a {lev} {dir} on{" "}
          <span className="text-foreground font-medium">{token}</span>
        </>
      );
      tone = "sell";
    }
  }

  const showPnl = item.pnlSol != null && Number.isFinite(item.pnlSol);

  return (
    <div
      data-testid={`feed-card-${item.id}`}
      className="border border-border bg-card p-3 flex items-start gap-3"
    >
      <div
        className={cn(
          "mt-0.5 flex-shrink-0",
          tone === "buy"
            ? "text-emerald-400"
            : tone === "sell"
              ? "text-red-400"
              : "text-muted-foreground",
        )}
      >
        {item.kind === "leverage" ? (
          <Zap className="w-4 h-4" />
        ) : tone === "buy" ? (
          <ArrowUpRight className="w-4 h-4" />
        ) : (
          <ArrowDownRight className="w-4 h-4" />
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
          <span className="uppercase tracking-wider text-[10px] text-muted-foreground border border-border px-1.5 py-0.5">
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
}: {
  kind: "callout" | "thesis" | "achievement";
  title: string;
  body: string;
}) {
  const Icon =
    kind === "callout" ? Megaphone : kind === "thesis" ? ScrollText : Trophy;
  return (
    <div
      data-testid={`placeholder-${kind}`}
      className="border border-dashed border-border bg-card/40 p-4 flex items-start gap-3"
    >
      <Icon className="w-5 h-5 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm text-foreground font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{body}</p>
      </div>
    </div>
  );
}

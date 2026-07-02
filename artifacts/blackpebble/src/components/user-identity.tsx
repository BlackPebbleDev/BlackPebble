import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ExternalLink } from "lucide-react";
import { OfficialBadge, ROLE_ORDER } from "@/components/official-badge";
import { TierBadge } from "@/components/tier-badge";
import { AccountStatusChip } from "@/components/account-status-chip";
import { ImageLightbox } from "@/components/image-lightbox";
import type { AccountStatus } from "@/lib/account-status";
import type { OfficialBadgeType } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * The single source of truth for how a user's identity is rendered across the
 * app — avatar, display name, official badges, tier, and @handle. Every surface
 * (feed cards, all leaderboard tabs, profile header, token callouts/theses)
 * uses this so badge/tier placement and alignment stay consistent everywhere.
 *
 * Display order convention is fixed: Avatar | (Name + Official badges + Tier) /
 * @handle / subline. Only sizing and link behaviour vary by surface.
 */

/**
 * Official badges always render in a fixed priority order (see ROLE_ORDER:
 * Founder, BlackPebble Team, Ambassador, Verified Trader, Early User) so the
 * highest-priority badges lead and are never dropped first when space is tight.
 * Unknown/future badge types sort after the known ones. The order is shared with
 * official-badge.tsx so roles render identically everywhere.
 */
function orderBadges(
  badges: readonly OfficialBadgeType[] | null | undefined,
): OfficialBadgeType[] {
  if (!badges?.length) return [];
  const rank = (t: OfficialBadgeType) => {
    const i = ROLE_ORDER.indexOf(t);
    return i === -1 ? 99 : i;
  };
  return [...badges].sort((a, b) => rank(a) - rank(b));
}

export type IdentitySize = "xs" | "sm" | "md" | "lg";

type BadgeSize = "xs" | "sm" | "md";

interface SizeSpec {
  /** Fixed avatar px (xs/sm/md). */
  avatarPx?: number;
  /** Responsive avatar classes (lg). */
  avatarClass?: string;
  /** Initials font size for the avatar fallback. */
  initials: string;
  /** Gap between avatar and the text column. */
  rowGap: string;
  /** Display-name typography. */
  name: string;
  /** @handle / subline typography. */
  handle: string;
  /** Default official-badge size. */
  badge: BadgeSize;
}

const SIZES: Record<IdentitySize, SizeSpec> = {
  xs: {
    avatarPx: 28,
    initials: "text-[10px]",
    rowGap: "gap-2",
    name: "text-sm font-medium",
    handle: "text-[11px]",
    badge: "sm",
  },
  sm: {
    avatarPx: 32,
    initials: "text-[11px]",
    rowGap: "gap-2.5",
    name: "text-sm font-medium",
    handle: "text-[11px]",
    badge: "sm",
  },
  md: {
    avatarPx: 36,
    initials: "text-[11px]",
    rowGap: "gap-3",
    name: "text-sm font-medium",
    handle: "text-[11px]",
    badge: "sm",
  },
  lg: {
    avatarClass: "w-16 h-16 md:w-20 md:h-20",
    initials: "text-lg",
    rowGap: "gap-4",
    name: "text-xl md:text-2xl font-semibold",
    handle: "text-sm",
    badge: "md",
  },
};

/**
 * Bump an X (twitter) avatar to a higher-resolution variant. X serves profile
 * images at `_normal` (48px) by default; swapping to `_400x400` gives a crisp
 * image on large/retina surfaces. Non-X URLs pass through unchanged.
 */
function hiResAvatar(url: string): string {
  return url.replace(/_normal(\.[a-zA-Z0-9]+)(\?.*)?$/, "_400x400$1$2");
}

function IdentityAvatar({
  url,
  name,
  spec,
  expandable,
}: {
  url?: string | null;
  name: string;
  spec: SizeSpec;
  /** Tap-to-expand into a fullscreen preview (profile-header surfaces only). */
  expandable?: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const initial = name.replace(/^@+/, "").slice(0, 2).toUpperCase() || "?";
  if (url) {
    // Use the hi-res variant only on the large (profile-header) avatar; dense
    // surfaces keep the lightweight default to avoid extra bandwidth.
    const hiRes = hiResAvatar(url);
    const img = spec.avatarPx ? (
      <img
        src={url}
        alt=""
        style={{ width: spec.avatarPx, height: spec.avatarPx }}
        className="rounded-full object-cover flex-shrink-0"
        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      />
    ) : (
      <img
        src={hiRes}
        alt=""
        className={cn("rounded-full object-cover flex-shrink-0", spec.avatarClass)}
        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      />
    );
    if (!expandable) return img;
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPreviewOpen(true);
          }}
          data-testid="button-expand-avatar"
          aria-label={`View ${name}'s profile picture`}
          className="flex-shrink-0 rounded-full cursor-zoom-in"
        >
          {img}
        </button>
        <ImageLightbox
          src={hiRes}
          alt={`${name}'s profile picture`}
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
        />
      </>
    );
  }
  const fallback =
    "rounded-full bg-secondary flex items-center justify-center text-muted-foreground flex-shrink-0 font-mono";
  return spec.avatarPx ? (
    <div
      style={{ width: spec.avatarPx, height: spec.avatarPx }}
      className={cn(fallback, spec.initials)}
    >
      {initial}
    </div>
  ) : (
    <div className={cn(fallback, spec.avatarClass, spec.initials)}>{initial}</div>
  );
}

type LinkSpec = { type: "internal" | "external"; href: string };

export interface UserIdentityProps {
  avatarUrl?: string | null;
  /** Let the avatar be tapped to open a fullscreen preview (profile-header
   * surfaces only — Portfolio and Public Profile). Defaults to false so
   * dense surfaces (feed, leaderboard) are unaffected. */
  avatarExpandable?: boolean;
  /** Trimmed display name; falls back to @handle then `fallbackName`. */
  displayName?: string | null;
  /** X handle (with or without a leading @). */
  handle?: string | null;
  officialBadges?: readonly OfficialBadgeType[] | null;
  tier?: string | null;
  /** Optional account-status chip (Guest/Member). Omit to hide on dense feeds. */
  accountStatus?: AccountStatus | null;
  size?: IdentitySize;
  /** Override the official-badge size (e.g. icon-only "xs" on dense feeds). */
  badgeSize?: BadgeSize;
  /** "pill" = rounded tier badge; "plain" = color-only inline text. */
  tierVariant?: "pill" | "plain";
  /** Where the tier sits: beside the name, or under the @handle. */
  tierPosition?: "inline" | "below";
  /** Where official badges sit: inline beside the name, or on their own row. */
  badgePosition?: "inline" | "row";
  /** Vertical alignment of the avatar against the text column. */
  align?: "center" | "start";
  /** Make the display name a link. */
  nameLink?: LinkSpec;
  /** Make the @handle a link (external renders an X-style icon). */
  handleLink?: LinkSpec;
  /** Fired when the handle link is clicked (e.g. analytics). */
  onHandleClick?: () => void;
  /** Render the @handle line. Defaults to true. */
  showHandle?: boolean;
  /** Inline node placed after the @handle (e.g. "Rank #4"). */
  handleTrailing?: ReactNode;
  /** Secondary line under the @handle (e.g. best call). */
  subline?: ReactNode;
  /** Shown when there is no display name and no handle. */
  fallbackName?: string;
  /** Render the display name as a heading (profile header). */
  nameAs?: "span" | "h1";
  /** Extra content rendered in the text column below the identity rows. */
  children?: ReactNode;
  className?: string;
  testIdName?: string;
  handleTestId?: string;
  /** Stop click propagation on inner links (for clickable card rows). */
  stopPropagation?: boolean;
}

export function UserIdentity({
  avatarUrl,
  avatarExpandable = false,
  displayName,
  handle,
  officialBadges,
  tier,
  accountStatus,
  size = "md",
  badgeSize,
  tierVariant = "pill",
  tierPosition = "inline",
  badgePosition = "inline",
  align = "center",
  nameLink,
  handleLink,
  onHandleClick,
  showHandle = true,
  handleTrailing,
  subline,
  fallbackName = "Anonymous",
  nameAs = "span",
  children,
  className,
  testIdName,
  handleTestId,
  stopPropagation = true,
}: UserIdentityProps) {
  const spec = SIZES[size];
  const bSize = badgeSize ?? spec.badge;
  const cleanHandle = handle?.trim().replace(/^@+/, "") || null;
  const name = displayName?.trim() || (cleanHandle ? `@${cleanHandle}` : fallbackName);
  const avatarName = displayName?.trim() || cleanHandle || "?";

  const stop = stopPropagation
    ? (e: React.MouseEvent) => e.stopPropagation()
    : undefined;

  const nameClasses = cn(spec.name, "text-foreground truncate");
  let nameEl: ReactNode;
  if (nameLink) {
    const cls = cn(nameClasses, "hover:text-accent transition-colors");
    nameEl =
      nameLink.type === "internal" ? (
        <Link href={nameLink.href} onClick={stop} data-testid={testIdName} className={cls}>
          {name}
        </Link>
      ) : (
        <a
          href={nameLink.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={stop}
          data-testid={testIdName}
          className={cls}
        >
          {name}
        </a>
      );
  } else if (nameAs === "h1") {
    nameEl = (
      <h1 data-testid={testIdName} className={nameClasses}>
        {name}
      </h1>
    );
  } else {
    nameEl = (
      <span data-testid={testIdName} className={nameClasses}>
        {name}
      </span>
    );
  }

  // Render a separate @handle line when the name isn't already the handle, or
  // when the handle is itself a link (e.g. the profile header's "View on X").
  const hasHandleLine =
    showHandle && cleanHandle && (!!displayName?.trim() || !!handleLink);
  let handleNode: ReactNode = null;
  if (hasHandleLine) {
    const txt = cn(spec.handle, "text-muted-foreground truncate");
    if (handleLink) {
      const onClick = (e: React.MouseEvent) => {
        stop?.(e);
        onHandleClick?.();
      };
      handleNode =
        handleLink.type === "external" ? (
          <a
            href={handleLink.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClick}
            data-testid={handleTestId}
            className={cn(
              txt,
              "inline-flex items-center gap-1 hover:text-accent transition-colors",
            )}
          >
            <span className="truncate">@{cleanHandle}</span>
            <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
          </a>
        ) : (
          <Link
            href={handleLink.href}
            onClick={onClick}
            data-testid={handleTestId}
            className={cn(txt, "hover:text-accent transition-colors")}
          >
            @{cleanHandle}
          </Link>
        );
    } else {
      handleNode = <span className={txt}>@{cleanHandle}</span>;
    }
  }

  const handleRow =
    handleNode || handleTrailing ? (
      <div
        className={cn(
          "flex items-center gap-3 min-w-0",
          size === "lg" ? "mt-1" : "mt-0.5",
        )}
      >
        {handleNode}
        {handleTrailing}
      </div>
    ) : null;

  const tierBadge = (
    <TierBadge tier={tier} size="sm" variant={tierVariant} />
  );

  const statusChip = accountStatus ? (
    <AccountStatusChip status={accountStatus} />
  ) : null;

  const badgeEls = orderBadges(officialBadges).map((b) => (
    <OfficialBadge key={b} type={b} size={bSize} />
  ));

  return (
    <div
      className={cn(
        "flex min-w-0",
        align === "start" ? "items-start" : "items-center",
        spec.rowGap,
        className,
      )}
    >
      <IdentityAvatar
        url={avatarUrl}
        name={avatarName}
        spec={spec}
        expandable={avatarExpandable}
      />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {nameEl}
          {statusChip}
          {badgePosition === "inline" && badgeEls}
          {tierPosition === "inline" && tierBadge}
        </div>
        {badgePosition === "row" && badgeEls.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap min-w-0">
            {badgeEls}
          </div>
        )}
        {handleRow}
        {subline}
        {tierPosition === "below" && <div className="mt-0.5">{tierBadge}</div>}
        {children}
      </div>
    </div>
  );
}

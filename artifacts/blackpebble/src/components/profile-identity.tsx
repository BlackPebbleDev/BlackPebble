import { ExternalLink, Globe, MessagesSquare, Send, Trophy } from "lucide-react";
import { TierBadge } from "@/components/tier-badge";
import { trackXProfileLinkClicked } from "@/lib/analytics";
import type { ProfileSocials } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Shared identity/link presentation for the profile surfaces so the public
 * profile hero and the Portfolio summary card stay visually identical. This is
 * display-only: no editing, no data fetching, no logic. Owner-edit affordances
 * live with each page.
 */

export const SOCIAL_DEFS = [
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
 * Compact identity metadata row rendered under the name/badges: "@handle · tier
 * · #rank". The @handle keeps its external-link icon and view-on-X tracking and
 * shows in full (it only truncates past a generous max width for unusually long
 * handles). Tier renders as color-only text; rank is subtle inline gold text
 * with a small trophy icon, quieter than the official role badges. The row
 * prefers one line and wraps only when it genuinely cannot fit.
 */
export function ProfileIdentityMeta({
  handle,
  profileUrl,
  tier,
  rank,
}: {
  handle: string | null | undefined;
  profileUrl: string | null;
  tier: string | null | undefined;
  rank: number | null | undefined;
}) {
  const cleanHandle = handle?.trim().replace(/^@+/, "") || null;
  const dot = (
    <span aria-hidden className="flex-shrink-0 text-muted-foreground/40">
      ·
    </span>
  );

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0 text-sm">
      {cleanHandle &&
        (profileUrl ? (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-view-on-x"
            onClick={() => trackXProfileLinkClicked()}
            className="inline-flex max-w-[12rem] min-w-0 items-center gap-1 text-muted-foreground hover:text-accent transition-colors"
          >
            <span className="truncate">@{cleanHandle}</span>
            <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
          </a>
        ) : (
          <span className="inline-flex max-w-[12rem] min-w-0 items-center text-muted-foreground">
            <span className="truncate">@{cleanHandle}</span>
          </span>
        ))}
      {cleanHandle && dot}
      <TierBadge tier={tier} variant="plain" className="flex-shrink-0" />
      {rank != null && (
        <>
          {dot}
          <span
            data-testid="text-profile-rank"
            aria-label={`Rank #${rank}`}
            className="inline-flex flex-shrink-0 items-center gap-1 font-semibold text-accent whitespace-nowrap"
          >
            <Trophy className="w-3 h-3 flex-shrink-0" />
            #{rank}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Read-only off-platform link pills (website / telegram / discord). Renders
 * nothing when no links are set. Matches the compact pill style used on the
 * public profile hero.
 */
export function ProfileSocialPills({
  socials,
  className,
}: {
  socials: ProfileSocials;
  className?: string;
}) {
  const links = SOCIAL_DEFS.map((d) => ({ ...d, value: socials[d.key] })).filter(
    (d) => !!d.value,
  );
  if (links.length === 0) return null;
  return (
    <div className={cn("mt-3 flex items-center gap-2 flex-wrap", className)}>
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
    </div>
  );
}

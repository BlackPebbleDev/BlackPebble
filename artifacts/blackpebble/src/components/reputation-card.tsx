import { useLocation } from "wouter";
import { ShieldCheck } from "lucide-react";
import { UserIdentity, type IdentitySize } from "@/components/user-identity";
import { fmtPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReputationEntry, TrustLabel } from "@/lib/api";

/**
 * Mirror of the server's Trust Score → label thresholds (badges.ts):
 *   0–15 New · 16–40 Building · 41–70 Established · 71–100 Proven.
 * Display-only — used where a row carries a score but not its label (e.g. feed).
 */
export function trustLabelFromScore(score: number): TrustLabel {
  if (score <= 15) return "New";
  if (score <= 40) return "Building";
  if (score <= 70) return "Established";
  return "Proven";
}

/**
 * Trust label → tone. The Trust Score is the shared reputation primitive; its
 * label tier (New → Building → Established → Proven) drives a single accent so
 * the badge reads the same everywhere it appears (profile, search, feed, board).
 */
function trustTone(label: TrustLabel): string {
  switch (label) {
    case "Proven":
      return "text-amber-400 bg-amber-400/10 ring-amber-400/20";
    case "Established":
      return "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20";
    case "Building":
      return "text-sky-300 bg-sky-400/10 ring-sky-400/20";
    default:
      return "text-muted-foreground bg-muted/40 ring-border";
  }
}

/**
 * Compact Trust Score indicator. Reused on profiles, reputation cards, feed
 * cards and search rows so trust always looks identical. Display-only — it never
 * computes or alters a score.
 */
export function TrustBadge({
  score,
  label,
  size = "sm",
  showLabel = true,
  className,
}: {
  score: number;
  label: TrustLabel;
  size?: "xs" | "sm";
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <span
      data-testid="trust-badge"
      title={`Trust Score ${score} · ${label}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full ring-1 font-mono font-semibold",
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        trustTone(label),
        className,
      )}
    >
      <ShieldCheck className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {score}
      {showLabel && (
        <span className="font-sans font-medium opacity-80">{label}</span>
      )}
    </span>
  );
}

function Field({
  label,
  value,
  cls,
}: {
  label: string;
  value: React.ReactNode;
  cls?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-foreground", cls)}>{value}</span>
    </div>
  );
}

/**
 * Shared trader reputation card — one consistent shape used by Trader Discovery,
 * Top Rising Traders and Highest Trust Score. Reuses UserIdentity (shared) and
 * TrustBadge; tier/badges are decoration only, never a rank.
 */
export function ReputationCard({
  entry,
  size = "md",
  showRank = false,
  highlight = "trust",
}: {
  entry: ReputationEntry;
  size?: IdentitySize;
  showRank?: boolean;
  /** Which momentum metric to surface in the footer line. */
  highlight?: "trust" | "rising";
}) {
  const [, navigate] = useLocation();
  const handle = entry.x_username?.trim().replace(/^@+/, "") || null;
  const pid = handle || String(entry.user_id);

  function go() {
    navigate(`/u/${encodeURIComponent(pid)}`);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={onKeyDown}
      data-testid={`reputation-card-${pid}`}
      className="rounded-xl bg-card shadow-card p-3.5 cursor-pointer hover:bg-surface-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent transition-colors"
    >
      <div className="flex items-center gap-3 mb-3">
        {showRank && entry.rank != null && (
          <span className="font-mono font-semibold text-sm text-muted-foreground shrink-0">
            #{entry.rank}
          </span>
        )}
        <UserIdentity
          className="flex-1 min-w-0"
          size={size}
          avatarUrl={entry.x_avatar_url}
          displayName={entry.x_display_name}
          handle={handle}
          officialBadges={entry.officialBadges}
          accountStatus="member"
          tier={entry.graduation_tier}
          fallbackName={`User ${entry.user_id}`}
        />
        <TrustBadge
          score={entry.trustScore}
          label={entry.trustLabel}
          showLabel={false}
          className="shrink-0"
        />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Field label="Followers" value={entry.followers} />
        <Field label="Calls" value={entry.callsMade} />
        <Field
          label="Win Rate"
          value={fmtPercent(entry.winRate, 0)}
          cls={entry.winRate >= 60 ? "text-emerald-400" : undefined}
        />
        <Field
          label="ROI"
          value={fmtPercent(entry.roiPercent, 0)}
          cls={
            entry.roiPercent > 0
              ? "text-emerald-400"
              : entry.roiPercent < 0
                ? "text-red-400"
                : undefined
          }
        />
      </div>

      {highlight === "rising" && (
        <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Last 30d</span>
          <span className="font-mono text-emerald-400">
            +{entry.followers30d} followers · {entry.calls30d} calls
          </span>
        </div>
      )}
    </div>
  );
}

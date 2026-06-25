import { cn } from "@/lib/utils";
import {
  ACCOUNT_STATUS_META,
  type AccountStatus,
} from "@/lib/account-status";

/**
 * Renders the account-status axis (Guest | Member) as a subtle chip. This is
 * deliberately understated — it is a membership state, not a rank or a role, so
 * it must never read as prestige. Kept visually distinct from tier badges
 * (lib/tiers.ts) and role badges (official-badge.tsx) so the three axes are
 * never confused.
 */
const STATUS_STYLE: Record<AccountStatus, string> = {
  member: "border-border/60 bg-secondary/40 text-muted-foreground",
  guest: "border-border/40 bg-transparent text-muted-foreground/70",
};

interface AccountStatusChipProps {
  status: AccountStatus;
  className?: string;
}

export function AccountStatusChip({
  status,
  className,
}: AccountStatusChipProps) {
  const meta = ACCOUNT_STATUS_META[status];
  return (
    <span
      title={meta.description}
      data-testid={`account-status-${status}`}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap",
        STATUS_STYLE[status],
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

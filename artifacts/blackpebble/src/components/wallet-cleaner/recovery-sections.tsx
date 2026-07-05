import { useState, type ReactNode } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRentSol, type UseWalletCleaner } from "@/hooks/use-wallet-cleaner";
import { ScanResults } from "@/components/wallet-cleaner/scan-results";

/**
 * A collapsible recovery category. "Recover Now" handles empty-account rent
 * reclamation; the token cleanup buckets (Dust / Burn / Protected) live in the
 * dedicated TokenCleanup component below this section.
 */
function ExpandableSection({
  icon,
  title,
  subtitle,
  badge,
  defaultOpen = false,
  testId,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  defaultOpen?: boolean;
  testId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl bg-card shadow-card overflow-hidden" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-secondary/50 transition-colors"
        aria-expanded={open}
        data-testid={`${testId}-toggle`}
      >
        <div className="w-9 h-9 rounded-full bg-accent/12 flex items-center justify-center flex-shrink-0 text-accent">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-muted-foreground leading-snug">
            {subtitle}
          </div>
        </div>
        {badge && (
          <span className="font-mono text-xs text-foreground flex-shrink-0">
            {badge}
          </span>
        )}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}

/**
 * The "Recover Now" rent-reclamation category. Token cleanup buckets live in
 * the dedicated TokenCleanup component. Never fabricates counts or values.
 */
export function RecoverySections({ cleaner }: { cleaner: UseWalletCleaner }) {
  const { accounts, totalRecoverable } = cleaner;

  return (
    <div className="space-y-3">
      <ExpandableSection
        icon={<Sparkles className="w-4 h-4" />}
        title="Recover now"
        subtitle="Empty token accounts with reclaimable rent"
        badge={
          accounts.length > 0
            ? `${accounts.length} · ${formatRentSol(totalRecoverable)} SOL`
            : "0"
        }
        defaultOpen
        testId="section-recover-now"
      >
        {accounts.length > 0 ? (
          <ScanResults cleaner={cleaner} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No empty token accounts to recover right now.
          </p>
        )}
      </ExpandableSection>
    </div>
  );
}

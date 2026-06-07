import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  Sparkles,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRentSol, type UseWalletCleaner } from "@/hooks/use-wallet-cleaner";
import { ScanResults } from "@/components/wallet-cleaner/scan-results";

/**
 * A collapsible recovery category. The dashboard is organised into three of
 * these — Recover Now (live), Review (future) and Protected (informational) —
 * so new recovery modules can be added later without redesigning the page.
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
    <div className="border border-border bg-card" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-secondary/50 transition-colors"
        aria-expanded={open}
        data-testid={`${testId}-toggle`}
      >
        <div className="w-9 h-9 border border-accent/40 flex items-center justify-center flex-shrink-0 text-accent">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-muted-foreground truncate">
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

function FutureList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item}
          className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
        >
          <span className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 bg-muted-foreground/50 flex-shrink-0" />
            {item}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 border border-border px-1.5 py-0.5">
            Soon
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The three recovery categories. Only "Recover Now" is interactive today; Review
 * and Protected are forward-looking and never fabricate counts or values.
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

      <ExpandableSection
        icon={<Clock className="w-4 h-4" />}
        title="Review"
        subtitle="Items that need a closer look before cleanup"
        testId="section-review"
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Future recovery modules will surface here. These require a manual
            review and are never closed or burned automatically.
          </p>
          <FutureList
            items={[
              "Dust tokens",
              "Burn candidates",
              "Small-balance accounts",
            ]}
          />
        </div>
      </ExpandableSection>

      <ExpandableSection
        icon={<ShieldCheck className="w-4 h-4" />}
        title="Protected"
        subtitle="Always kept safe — never selected or touched"
        testId="section-protected"
      >
        <ul className="space-y-2">
          {[
            "Your SOL balance",
            "Tokens & verified assets",
            "NFTs & collectibles",
            "Accounts with any balance",
          ].map((item) => (
            <li
              key={item}
              className="flex items-center gap-2.5 text-sm text-muted-foreground"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-accent flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </ExpandableSection>
    </div>
  );
}

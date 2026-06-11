import { formatRentSol, type UseWalletCleaner } from "@/hooks/use-wallet-cleaner";

/**
 * The pre-sign breakdown of a close run. Rendered both inline on the page (so
 * the user sees the math before opening the modal) and inside the preview modal.
 */
export function RecoverySummary({
  cleaner,
  className,
}: {
  cleaner: UseWalletCleaner;
  className?: string;
}) {
  const {
    selectedAccounts,
    selectedRecoverable,
    estimatedFee,
    estimatedNet,
    txCount,
  } = cleaner;

  const rows: Array<{ label: string; value: string; testId: string }> = [
    {
      label: "Accounts selected",
      value: String(selectedAccounts.length),
      testId: "summary-accounts",
    },
    {
      label: "Recoverable SOL",
      value: `${formatRentSol(selectedRecoverable)} SOL`,
      testId: "summary-recoverable",
    },
    {
      label: "Estimated network fees",
      value: `${formatRentSol(estimatedFee)} SOL`,
      testId: "summary-fees",
    },
    {
      label: "Estimated net received",
      value: `${formatRentSol(estimatedNet)} SOL`,
      testId: "summary-net",
    },
    {
      label: "Transactions required",
      value: String(txCount),
      testId: "summary-tx-count",
    },
  ];

  return (
    <div className={className} data-testid="recovery-summary">
      <div className="rounded-xl bg-card shadow-card overflow-hidden divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 px-4 py-2.5"
            data-testid={`row-${row.testId}`}
          >
            <span className="text-xs text-muted-foreground">{row.label}</span>
            <span className="font-mono text-sm text-foreground">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { Wallet, RefreshCw } from "lucide-react";
import { shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatRentSol, type UseWalletCleaner } from "@/hooks/use-wallet-cleaner";

/** Format a wallet-level SOL balance with friendlier precision than rent. */
function formatBalanceSol(sol: number | null): string {
  if (sol == null || !Number.isFinite(sol)) return "—";
  return sol.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/**
 * The post-connect overview of the wallet: live on-chain SOL balance plus the
 * scan totals (empty accounts, recoverable rent, estimated fees and net). Before
 * a scan completes the recovery rows read "—"; after a clean scan they read 0.
 */
export function WalletStatusCard({ cleaner }: { cleaner: UseWalletCleaner }) {
  const {
    status,
    owner,
    walletBalance,
    balanceStatus,
    accounts,
    totalRecoverable,
    totalFee,
    totalNet,
    refreshBalance,
  } = cleaner;

  const hasScanned =
    status === "scanned" ||
    status === "closing" ||
    status === "done" ||
    (status === "error" && accounts.length > 0);

  const balanceText =
    balanceStatus === "loading" && walletBalance == null
      ? "Loading…"
      : balanceStatus === "error"
        ? "Unavailable"
        : `${formatBalanceSol(walletBalance)} SOL`;

  const recovery = hasScanned ? "value" : ("pending" as const);
  const fmt = (sol: number) =>
    recovery === "value" ? `${formatRentSol(sol)} SOL` : "—";

  const rows: Array<{ label: string; value: string; testId: string }> = [
    {
      label: "Empty accounts found",
      value: hasScanned ? String(accounts.length) : "—",
      testId: "status-empty-accounts",
    },
    {
      label: "Recoverable SOL",
      value: fmt(totalRecoverable),
      testId: "status-recoverable",
    },
    {
      label: "Estimated network fees",
      value: fmt(totalFee),
      testId: "status-fees",
    },
    {
      label: "Estimated net receive",
      value: fmt(totalNet),
      testId: "status-net",
    },
  ];

  return (
    <div
      className="border border-border bg-card p-4 sm:p-5 space-y-4"
      data-testid="wallet-status-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 border border-accent/40 flex items-center justify-center flex-shrink-0">
            <Wallet className="w-4 h-4 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Connected wallet
            </div>
            <div
              className="font-mono text-sm text-foreground truncate"
              data-testid="text-wallet-address"
            >
              {owner ? shortAddr(owner, 4) : "—"}
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Balance
          </div>
          <div className="flex items-center justify-end gap-1.5">
            <span
              className={cn(
                "font-mono text-sm",
                balanceStatus === "error"
                  ? "text-muted-foreground"
                  : "text-foreground",
              )}
              data-testid="text-wallet-balance"
            >
              {balanceText}
            </span>
            <button
              type="button"
              onClick={() => void refreshBalance()}
              disabled={balanceStatus === "loading"}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              aria-label="Refresh balance"
              data-testid="button-refresh-balance"
            >
              <RefreshCw
                className={cn(
                  "w-3.5 h-3.5",
                  balanceStatus === "loading" && "animate-spin",
                )}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="border border-border divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 px-3 py-2.5"
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

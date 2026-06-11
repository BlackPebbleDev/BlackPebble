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

function Metric({
  label,
  value,
  sub,
  testId,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  testId: string;
  emphasis?: boolean;
}) {
  return (
    <div className="px-3.5 py-3" data-testid={testId}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div
        className={cn(
          "font-mono",
          emphasis ? "text-lg text-accent" : "text-lg text-foreground",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * Primary SOL Recovery status card: the connected wallet plus the four headline
 * figures — live balance, recoverable SOL, estimated net recovery and a Wallet
 * Health score. Recovery figures read "—" until a scan completes (they are never
 * shown as a misleading 0), and Wallet Health is derived only from the real
 * count of empty accounts found.
 */
export function WalletStatusCard({ cleaner }: { cleaner: UseWalletCleaner }) {
  const {
    status,
    owner,
    walletBalance,
    balanceStatus,
    accounts,
    totalRecoverable,
    totalNet,
    walletHealth,
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

  const fmt = (sol: number) => (hasScanned ? `${formatRentSol(sol)} SOL` : "—");

  return (
    <div
      className="rounded-xl bg-card shadow-card p-4 sm:p-5 space-y-4"
      data-testid="wallet-status-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-accent/12 flex items-center justify-center flex-shrink-0">
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
        <button
          type="button"
          onClick={() => void refreshBalance()}
          disabled={balanceStatus === "loading"}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          aria-label="Refresh balance"
          data-testid="button-refresh-balance"
        >
          <RefreshCw
            className={cn(
              "w-3.5 h-3.5",
              balanceStatus === "loading" && "animate-spin",
            )}
          />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 border border-border divide-border [&>*]:border-border">
        <div className="border-b border-r">
          <Metric
            label="Wallet balance"
            value={balanceText}
            testId="metric-balance"
          />
        </div>
        <div className="border-b">
          <Metric
            label="Recoverable SOL"
            value={fmt(totalRecoverable)}
            sub={hasScanned ? `${accounts.length} empty accounts` : undefined}
            testId="metric-recoverable"
            emphasis={hasScanned && totalRecoverable > 0}
          />
        </div>
        <div className="border-r">
          <Metric
            label="Est. net recovery"
            value={fmt(totalNet)}
            sub="after network fees"
            testId="metric-net"
          />
        </div>
        <div>
          <Metric
            label="Wallet health"
            value={hasScanned ? `${walletHealth} / 100` : "—"}
            sub={
              hasScanned
                ? accounts.length === 0
                  ? "No cleanup needed"
                  : `${accounts.length} cleanup ${
                      accounts.length === 1 ? "opportunity" : "opportunities"
                    }`
                : undefined
            }
            testId="metric-health"
          />
        </div>
      </div>
    </div>
  );
}

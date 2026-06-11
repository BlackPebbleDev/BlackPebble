import { Link } from "wouter";
import { Sparkles, ChevronRight, Loader2 } from "lucide-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useRecoveryDiscovery } from "@/lib/recovery-discovery";
import { formatRentSol } from "@/lib/recovery-scan";

const RECOVERY_PATH = "/utilities/sol-recovery";

/**
 * Passive discovery card for the Portfolio. Surfaces recoverable SOL so the
 * feature is findable, while staying strictly isolated from paper-trading
 * metrics — recoverable SOL is a wallet utility figure, never PnL or equity.
 *
 * Three states:
 *  - no wallet connected (incl. X-only users) → invitation to connect
 *  - connected with recoverable SOL           → live figure + Recover
 *  - connected but clean                       → 0.0000 + Scan again
 */
export function RecoveryDiscoveryCard() {
  const { status, recoverableSol, accountCount } = useRecoveryDiscovery();

  return (
    <div
      className="rounded-xl bg-card shadow-card p-4 sm:p-5"
      data-testid="card-sol-recovery"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-accent/12 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold">SOL Recovery</div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border px-1.5 py-0.5">
              Utility · not PnL
            </span>
          </div>

          {status === "no-wallet" ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect a wallet to check for recoverable SOL locked in unused
                token accounts.
              </p>
              <div data-testid="recovery-connect-wallet">
                <WalletMultiButton />
              </div>
            </div>
          ) : status === "scanning" ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-accent" />
              Checking your wallet…
            </div>
          ) : status === "error" ? (
            <div className="mt-3">
              <p className="text-sm text-muted-foreground mb-3">
                Couldn’t check for recoverable SOL right now.
              </p>
              <Link
                href={RECOVERY_PATH}
                className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                data-testid="link-recovery-open"
              >
                Open SOL Recovery
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : recoverableSol > 0 ? (
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">
                  Recoverable SOL
                </div>
                <div className="font-mono text-xl text-accent">
                  {formatRentSol(recoverableSol)}{" "}
                  <span className="text-sm text-muted-foreground">SOL</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Available · {accountCount}{" "}
                  {accountCount === 1 ? "account" : "accounts"}
                </div>
              </div>
              <Link
                href={RECOVERY_PATH}
                className="inline-flex items-center gap-1 text-sm font-medium text-accent border border-accent/40 hover:bg-accent/10 px-3 py-1.5 transition-colors flex-shrink-0"
                data-testid="button-recover"
              >
                Recover
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">
                  Recoverable SOL
                </div>
                <div className="font-mono text-xl text-foreground">
                  0.0000 <span className="text-sm text-muted-foreground">SOL</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Wallet clean
                </div>
              </div>
              <Link
                href={RECOVERY_PATH}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 transition-colors flex-shrink-0"
                data-testid="button-scan-again-card"
              >
                Scan again
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { Link } from "wouter";
import { Sparkles, X } from "lucide-react";
import { useRecoveryDiscovery } from "@/lib/recovery-discovery";
import { formatRentSol } from "@/lib/recovery-scan";

/**
 * Non-blocking, dismissible discovery notification. After a wallet connects we
 * run a lightweight background scan; if there is recoverable SOL we surface this
 * once per session per wallet. It never interrupts (no modal) and is dismissable.
 */
export function RecoveryNotification() {
  const {
    status,
    owner,
    recoverableSol,
    notificationDismissed,
    dismissNotification,
  } = useRecoveryDiscovery();

  const show =
    status === "ready" &&
    !!owner &&
    recoverableSol > 0 &&
    !notificationDismissed;

  if (!show) return null;

  return (
    <div
      className="fixed z-50 bottom-20 md:bottom-4 right-4 left-4 sm:left-auto sm:w-80 border border-accent/40 bg-card shadow-lg p-4 animate-in fade-in slide-in-from-bottom-2"
      role="status"
      data-testid="recovery-notification"
    >
      <button
        type="button"
        onClick={dismissNotification}
        className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
        data-testid="button-dismiss-notification"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-2.5 pr-5">
        <Sparkles className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
        <div className="space-y-2 min-w-0">
          <div className="text-sm font-semibold">Recoverable SOL available</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-mono text-foreground">
              {formatRentSol(recoverableSol)} SOL
            </span>{" "}
            is available for recovery from unused token accounts.
          </p>
          <div className="flex items-center gap-2 pt-0.5">
            <Link
              href="/utilities/sol-recovery"
              onClick={dismissNotification}
              className="text-xs font-medium text-accent border border-accent/40 hover:bg-accent/10 px-2.5 py-1 transition-colors"
              data-testid="button-recover-now"
            >
              Recover now
            </Link>
            <button
              type="button"
              onClick={dismissNotification}
              className="text-xs text-muted-foreground hover:text-foreground px-2.5 py-1 transition-colors"
              data-testid="button-dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

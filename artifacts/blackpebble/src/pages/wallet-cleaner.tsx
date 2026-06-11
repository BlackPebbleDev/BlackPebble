import { useState } from "react";
import { Link } from "wouter";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Sparkles,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWalletCleaner, formatRentSol } from "@/hooks/use-wallet-cleaner";
import { SafetyBanner } from "@/components/wallet-cleaner/safety-banner";
import { WalletStatusCard } from "@/components/wallet-cleaner/wallet-status-card";
import { RecoverySections } from "@/components/wallet-cleaner/recovery-sections";
import { RecoverySummary } from "@/components/wallet-cleaner/recovery-summary";
import { ClosePreviewDialog } from "@/components/wallet-cleaner/close-preview-dialog";

/** Wallet-balance precision matching the status card. */
function formatBalanceSol(sol: number | null): string {
  if (sol == null || !Number.isFinite(sol)) return "—";
  return sol.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export default function WalletCleaner() {
  const { connected } = useWallet();
  const cleaner = useWalletCleaner();
  const [previewOpen, setPreviewOpen] = useState(false);

  const {
    status,
    error,
    owner,
    walletBalance,
    accounts,
    selectedAccounts,
    selectedRecoverable,
    closedCount,
    recoveredSol,
    scan,
    closeSelected,
    reset,
  } = cleaner;

  async function handleConfirmClose() {
    const ok = await closeSelected();
    // Keep the modal open on failure so the error and progress stay visible.
    if (ok) setPreviewOpen(false);
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:py-10 max-w-3xl mx-auto pb-28 sm:pb-10">
      <div className="space-y-3">
        <Link
          href="/utilities"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-back-utilities"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Utilities
        </Link>
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-accent/12 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold leading-tight">
              SOL Recovery
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Recover trapped SOL from unused token accounts and reclaim locked
              rent safely.
            </p>
          </div>
        </div>
      </div>

      <SafetyBanner />

      {!connected ? (
        <div className="rounded-2xl bg-card shadow-card p-8 text-center space-y-4">
          <Wallet className="w-8 h-8 text-muted-foreground mx-auto" />
          <div className="space-y-1">
            <div className="font-semibold">Connect your wallet to begin</div>
            <p className="text-sm text-muted-foreground">
              SOL Recovery reads your token accounts directly from the Solana
              network. Nothing is signed until you choose to close accounts.
            </p>
          </div>
          <div className="flex justify-center">
            <WalletMultiButton />
          </div>
        </div>
      ) : status === "done" ? (
        <div
          className="rounded-2xl bg-card shadow-card p-6 sm:p-8 text-center space-y-5"
          data-testid="recovery-complete"
        >
          <CheckCircle2 className="w-9 h-9 text-accent mx-auto" />
          <div className="space-y-1">
            <div className="text-lg font-semibold">Recovery complete</div>
            <p className="text-sm text-muted-foreground">
              Your recovered SOL has landed in your connected wallet.
            </p>
          </div>
          <div className="grid grid-cols-3 border border-border divide-x divide-border max-w-md mx-auto">
            <div className="px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                SOL recovered
              </div>
              <div className="font-mono text-sm text-accent">
                {formatRentSol(recoveredSol)}
              </div>
            </div>
            <div className="px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Accounts closed
              </div>
              <div className="font-mono text-sm text-foreground">
                {closedCount}
              </div>
            </div>
            <div className="px-3 py-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Wallet balance
              </div>
              <div className="font-mono text-sm text-foreground">
                {formatBalanceSol(walletBalance)} SOL
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={scan} data-testid="button-scan-again">
              Scan again
            </Button>
            {owner && (
              <a
                href={`https://solscan.io/account/${owner}`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-view-details"
              >
                <Button variant="outline">
                  View details
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </a>
            )}
          </div>
        </div>
      ) : (
        <>
          <WalletStatusCard cleaner={cleaner} />

          {(status === "idle" ||
            (status === "error" && accounts.length === 0)) && (
            <div className="space-y-4">
              <Button
                onClick={scan}
                className="w-full sm:w-auto"
                data-testid="button-scan-wallet"
              >
                {status === "error"
                  ? "Try scanning again"
                  : "Scan for recoverable SOL"}
              </Button>
              {status === "error" && error && (
                <div className="flex items-start gap-2.5 border border-destructive-border bg-destructive/10 px-4 py-3 text-sm text-foreground">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {status === "scanning" && (
            <div className="rounded-2xl bg-card shadow-card p-10 text-center">
              <Loader2 className="w-6 h-6 text-accent animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Scanning your token accounts…
              </p>
            </div>
          )}

          {(status === "scanned" ||
            status === "closing" ||
            status === "error") &&
            accounts.length > 0 && (
              <div className="space-y-5">
                <RecoverySections cleaner={cleaner} />
                {selectedAccounts.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Recovery summary
                    </div>
                    <RecoverySummary cleaner={cleaner} />
                  </div>
                )}
              </div>
            )}

          {status === "scanned" && accounts.length === 0 && (
            <div
              className="rounded-2xl bg-card shadow-card p-10 text-center space-y-3"
              data-testid="wallet-clean"
            >
              <CheckCircle2 className="w-8 h-8 text-accent mx-auto" />
              <div className="space-y-1">
                <div className="font-semibold">Wallet clean</div>
                <p className="text-sm text-muted-foreground">
                  No recoverable token accounts were found. Your current balance
                  is shown above.
                </p>
              </div>
              <Button variant="outline" onClick={scan} data-testid="button-rescan">
                Scan again
              </Button>
            </div>
          )}

          {status === "error" && accounts.length > 0 && error && (
            <div className="flex items-start gap-2.5 border border-destructive-border bg-destructive/10 px-4 py-3 text-sm text-foreground">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </>
      )}

      {/* Sticky action bar — appears when there are selectable accounts. */}
      {connected &&
        (status === "scanned" || status === "closing" || status === "error") &&
        accounts.length > 0 && (
          <div className="fixed bottom-16 md:bottom-0 left-0 right-0 md:pl-[60px] z-30 bg-background/95 backdrop-blur-md border-t border-border px-4 py-3">
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
              <div className="text-xs text-muted-foreground">
                <span className="font-mono text-foreground">
                  {selectedAccounts.length}
                </span>{" "}
                selected ·{" "}
                <span className="font-mono text-foreground">
                  {formatRentSol(selectedRecoverable)} SOL
                </span>
              </div>
              <Button
                onClick={() => setPreviewOpen(true)}
                disabled={selectedAccounts.length === 0}
                data-testid="button-open-preview"
              >
                Preview &amp; recover
              </Button>
            </div>
          </div>
        )}

      <ClosePreviewDialog
        cleaner={cleaner}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onConfirm={handleConfirmClose}
      />

      {/* Keep the unused reset reachable for future flows without dead-code warnings. */}
      <span className="hidden" aria-hidden onClick={reset} />
    </div>
  );
}

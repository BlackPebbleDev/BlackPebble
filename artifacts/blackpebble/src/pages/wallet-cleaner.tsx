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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/error-boundary";
import { useWalletCleaner, formatRentSol } from "@/hooks/use-wallet-cleaner";
import { SafetyBanner } from "@/components/wallet-cleaner/safety-banner";
import { WalletStatusCard } from "@/components/wallet-cleaner/wallet-status-card";
import { WalletHealthDashboard } from "@/components/wallet-cleaner/wallet-health-dashboard";
import { RecoverySections } from "@/components/wallet-cleaner/recovery-sections";
import { RecoverySummary } from "@/components/wallet-cleaner/recovery-summary";
import { RecoverySuccess } from "@/components/wallet-cleaner/recovery-success";
import { RecoveryHistory } from "@/components/wallet-cleaner/recovery-history";
import { ClosePreviewDialog } from "@/components/wallet-cleaner/close-preview-dialog";
import {
  TokenCleanup,
  BurnSuccessBanner,
} from "@/components/wallet-cleaner/token-cleanup";
import { BurnPreviewDialog } from "@/components/wallet-cleaner/burn-preview-dialog";

export default function WalletCleaner() {
  const { connected } = useWallet();
  const cleaner = useWalletCleaner();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [burnPreviewOpen, setBurnPreviewOpen] = useState(false);

  const {
    status,
    error,
    owner,
    accounts,
    tokens,
    intelLoading,
    selectedAccounts,
    selectedRecoverable,
    scan,
    closeSelected,
    executeBurn,
    reset,
  } = cleaner;

  async function handleConfirmClose() {
    const ok = await closeSelected();
    // Keep the modal open on failure so the error and progress stay visible.
    if (ok) setPreviewOpen(false);
  }

  async function handleConfirmBurn() {
    const ok = await executeBurn();
    // Keep the modal open on failure so the error stays visible.
    if (ok) setBurnPreviewOpen(false);
  }

  const scannedView =
    status === "scanned" || status === "closing" || status === "error";
  const hasTokens = tokens.length > 0 || intelLoading;
  const fullyClean =
    status === "scanned" &&
    accounts.length === 0 &&
    tokens.length === 0 &&
    !intelLoading;

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
              Wallet Cleanup
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              See every token you hold, spot scams and inflated value, reclaim
              trapped SOL, and burn junk — safely and on your terms.
            </p>
          </div>
        </div>
      </div>

      <SafetyBanner />

      <ErrorBoundary
        onReset={reset}
        title="Wallet Cleanup hit a snag"
        description="Something went wrong while showing your scan results. Your wallet and funds are safe — nothing was changed. Try scanning again."
        retryLabel="Try again"
      >
      {!connected ? (
        <div className="rounded-3xl bg-card shadow-card p-8 text-center space-y-4">
          <Wallet className="w-8 h-8 text-muted-foreground mx-auto" />
          <div className="space-y-1">
            <div className="font-semibold">Connect your wallet to begin</div>
            <p className="text-sm text-muted-foreground">
              Wallet Cleanup reads your tokens directly from the Solana network.
              Nothing is signed until you choose what to clean up.
            </p>
          </div>
          <div className="flex justify-center">
            <WalletMultiButton />
          </div>
        </div>
      ) : status === "done" ? (
        <RecoverySuccess cleaner={cleaner} />
      ) : (
        <>
          <WalletStatusCard cleaner={cleaner} />

          <WalletHealthDashboard cleaner={cleaner} wallet={owner} />

          {(status === "idle" ||
            (status === "error" && accounts.length === 0)) && (
            <div className="space-y-4">
              <Button
                onClick={scan}
                className="w-full sm:w-auto rounded-2xl"
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
            <div className="rounded-3xl bg-card shadow-card p-10 text-center">
              <Loader2 className="w-6 h-6 text-accent animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Scanning your token accounts…
              </p>
            </div>
          )}

          {scannedView && (
            <div className="space-y-5">
              <BurnSuccessBanner cleaner={cleaner} />

              {accounts.length > 0 && (
                <>
                  <RecoverySections cleaner={cleaner} />
                  {selectedAccounts.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        Recovery summary
                      </div>
                      <RecoverySummary cleaner={cleaner} />
                    </div>
                  )}
                </>
              )}

              {hasTokens && <TokenCleanup cleaner={cleaner} onRequestBurn={() => setBurnPreviewOpen(true)} />}
            </div>
          )}

          {fullyClean && (
            <div
              className="rounded-3xl bg-card shadow-card p-10 text-center space-y-3"
              data-testid="wallet-clean"
            >
              <CheckCircle2 className="w-8 h-8 text-accent mx-auto" />
              <div className="space-y-1">
                <div className="font-semibold">Wallet clean</div>
                <p className="text-sm text-muted-foreground">
                  No recoverable accounts or tokens were found. Your current
                  balance is shown above.
                </p>
              </div>
              <Button variant="outline" onClick={scan} className="rounded-2xl" data-testid="button-rescan">
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

      {/* Permanent per-wallet recovery history — visible in every connected
          state, including the post-recovery success screen. */}
      {connected && owner && <RecoveryHistory wallet={owner} />}

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
                className="rounded-2xl"
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

      <BurnPreviewDialog
        cleaner={cleaner}
        open={burnPreviewOpen}
        onOpenChange={setBurnPreviewOpen}
        onConfirm={handleConfirmBurn}
      />
      </ErrorBoundary>
    </div>
  );
}

import { useRef, useState } from "react";
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
  ChevronDown,
  Coins,
  Activity,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/error-boundary";
import { useWalletCleaner } from "@/hooks/use-wallet-cleaner";
import { SafetyBanner } from "@/components/wallet-cleaner/safety-banner";
import { WalletStatusCard } from "@/components/wallet-cleaner/wallet-status-card";
import { WalletHealthHero } from "@/components/wallet-cleaner/wallet-health-hero";
import { RecommendedActions } from "@/components/wallet-cleaner/recommended-actions";
import { ActionCenter } from "@/components/wallet-cleaner/action-center";
import { WalletHealthDashboard } from "@/components/wallet-cleaner/wallet-health-dashboard";
import { ScanResults } from "@/components/wallet-cleaner/scan-results";
import { RecoverySuccess } from "@/components/wallet-cleaner/recovery-success";
import { RecoveryHistory } from "@/components/wallet-cleaner/recovery-history";
import { ClosePreviewDialog } from "@/components/wallet-cleaner/close-preview-dialog";
import {
  ProtectedAssets,
  ValueSummary,
  AllTokensAnalysis,
  FutureCleanupModules,
  BurnSuccessBanner,
} from "@/components/wallet-cleaner/token-cleanup";
import { BurnPreviewDialog } from "@/components/wallet-cleaner/burn-preview-dialog";

/** A labeled sub-block inside the Advanced Analysis container. */
function AdvancedBlock({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground px-1">
        <span className="text-accent">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function WalletCleaner() {
  const { connected } = useWallet();
  const cleaner = useWalletCleaner();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [burnPreviewOpen, setBurnPreviewOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedRef = useRef<HTMLDivElement>(null);

  const {
    status,
    error,
    owner,
    accounts,
    tokens,
    intelLoading,
    scan,
    selectAll,
    selectAllInBucket,
    closeSelected,
    executeBurn,
    reset,
  } = cleaner;

  async function handleConfirmClose() {
    const ok = await closeSelected();
    if (ok) setPreviewOpen(false);
  }

  async function handleConfirmBurn() {
    const ok = await executeBurn();
    if (ok) setBurnPreviewOpen(false);
  }

  // Recommended-action handlers - turn a tap into the right flow.
  function handleRecover() {
    selectAll();
    setPreviewOpen(true);
  }
  function handleBurn() {
    selectAllInBucket("burn");
    setBurnPreviewOpen(true);
  }
  function handleReview() {
    setAdvancedOpen(true);
    requestAnimationFrame(() =>
      advancedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
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
    <div className="flex flex-col gap-6 px-4 py-6 sm:py-10 max-w-3xl mx-auto pb-32 sm:pb-10">
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
              trapped SOL, and burn junk - safely and on your terms.
            </p>
          </div>
        </div>
      </div>

      <SafetyBanner />

      <ErrorBoundary
        onReset={reset}
        title="Wallet Cleanup hit a snag"
        description="Something went wrong while showing your scan results. Your wallet and funds are safe - nothing was changed. Try scanning again."
        retryLabel="Try again"
      >
        {!connected ? (
          <div className="rounded-xl bg-card shadow-card p-8 text-center space-y-4">
            <Wallet className="w-8 h-8 text-muted-foreground mx-auto" />
            <div className="space-y-1">
              <div className="font-semibold">Connect your wallet to begin</div>
              <p className="text-sm text-muted-foreground">
                Wallet Cleanup reads your tokens directly from the Solana
                network. Nothing is signed until you choose what to clean up.
              </p>
            </div>
            <div className="flex justify-center">
              <WalletMultiButton />
            </div>
          </div>
        ) : status === "done" ? (
          <div className="space-y-6">
            <RecoverySuccess cleaner={cleaner} />
            {owner && <RecoveryHistory wallet={owner} />}
          </div>
        ) : (
          <div className="space-y-6">
            <WalletStatusCard cleaner={cleaner} />

            {/* SECTION 1 - Wallet Health Hero (the centerpiece summary). */}
            <WalletHealthHero cleaner={cleaner} onScan={scan} />

            {status === "scanning" && (
              <div className="rounded-xl bg-card shadow-card p-10 text-center">
                <Loader2 className="w-6 h-6 text-accent animate-spin mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Scanning your token accounts…
                </p>
              </div>
            )}

            {scannedView && (
              <>
                <BurnSuccessBanner cleaner={cleaner} />

                {fullyClean ? (
                  <div
                    className="rounded-xl bg-card shadow-card p-10 text-center space-y-3"
                    data-testid="wallet-clean"
                  >
                    <CheckCircle2 className="w-8 h-8 text-accent mx-auto" />
                    <div className="space-y-1">
                      <div className="font-semibold">Wallet clean</div>
                      <p className="text-sm text-muted-foreground">
                        No recoverable accounts or tokens were found. Your
                        current balance is shown above.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={scan}
                      className="rounded-2xl"
                      data-testid="button-rescan"
                    >
                      Scan again
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* SECTION 2 - Recommended Actions. */}
                    <RecommendedActions
                      cleaner={cleaner}
                      onRecover={handleRecover}
                      onBurn={handleBurn}
                      onReview={handleReview}
                    />

                    {/* SECTION 3 - Protected Assets (always visible, trust). */}
                    <ProtectedAssets cleaner={cleaner} />

                    {/* SECTION 4 - Advanced Analysis (collapsed by default). */}
                    <section
                      ref={advancedRef}
                      className="rounded-xl bg-card shadow-card overflow-hidden"
                      data-testid="advanced-analysis"
                    >
                      <button
                        type="button"
                        onClick={() => setAdvancedOpen((o) => !o)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-secondary/50 transition-colors"
                        aria-expanded={advancedOpen}
                        data-testid="advanced-analysis-toggle"
                      >
                        <div className="w-9 h-9 rounded-full bg-accent/12 flex items-center justify-center flex-shrink-0 text-accent">
                          <Activity className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm">
                            Advanced analysis
                          </div>
                          <div className="text-xs text-muted-foreground leading-snug">
                            All tokens, value & sellability, scam detection,
                            metrics and recovery history
                          </div>
                        </div>
                        <ChevronDown
                          className={cn(
                            "w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform",
                            advancedOpen && "rotate-180",
                          )}
                        />
                      </button>
                      {advancedOpen && (
                        <div className="border-t border-border p-4 space-y-6">
                          <AdvancedBlock
                            icon={<Coins className="w-3.5 h-3.5" />}
                            title="Value analysis"
                          >
                            <ValueSummary cleaner={cleaner} />
                          </AdvancedBlock>

                          {accounts.length > 0 && (
                            <AdvancedBlock
                              icon={<Sparkles className="w-3.5 h-3.5" />}
                              title="Empty accounts · recoverable rent"
                            >
                              <div className="rounded-2xl border border-border overflow-hidden">
                                <ScanResults cleaner={cleaner} />
                              </div>
                            </AdvancedBlock>
                          )}

                          {hasTokens && (
                            <AdvancedBlock
                              icon={<Coins className="w-3.5 h-3.5" />}
                              title="All tokens · risk & sellability"
                            >
                              <div className="rounded-2xl border border-border overflow-hidden">
                                <AllTokensAnalysis cleaner={cleaner} />
                              </div>
                            </AdvancedBlock>
                          )}

                          <WalletHealthDashboard
                            cleaner={cleaner}
                            wallet={owner}
                            variant="detail"
                          />

                          {owner && <RecoveryHistory wallet={owner} />}

                          <AdvancedBlock
                            icon={<Lock className="w-3.5 h-3.5" />}
                            title="More cleanup modules"
                          >
                            <div className="rounded-2xl border border-border">
                              <FutureCleanupModules />
                            </div>
                          </AdvancedBlock>
                        </div>
                      )}
                    </section>
                  </>
                )}

                {status === "error" && accounts.length > 0 && error && (
                  <div className="flex items-start gap-2.5 border border-destructive-border bg-destructive/10 px-4 py-3 text-sm text-foreground rounded-2xl">
                    <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </>
            )}

            {status === "error" && accounts.length === 0 && error && (
              <div className="flex items-start gap-2.5 border border-destructive-border bg-destructive/10 px-4 py-3 text-sm text-foreground rounded-2xl">
                <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* Unified Action Center - single sticky bar for recover + burn. */}
        {connected && scannedView && (
          <ActionCenter
            cleaner={cleaner}
            onRecover={() => setPreviewOpen(true)}
            onBurn={() => setBurnPreviewOpen(true)}
          />
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

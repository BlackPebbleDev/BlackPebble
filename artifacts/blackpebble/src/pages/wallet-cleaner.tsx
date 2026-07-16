import { useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Coins,
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
import { NftAnalysis } from "@/components/wallet-cleaner/nft-analysis";
import {
  ProtectedAssets,
  ValueSummary,
  AllTokensAnalysis,
  BurnSuccessBanner,
} from "@/components/wallet-cleaner/token-cleanup";
import { BurnPreviewDialog } from "@/components/wallet-cleaner/burn-preview-dialog";
import { UtilityPageHeader } from "@/components/utility-page-header";
import { getUtility } from "@/lib/utilities-meta";

const WALLET_CLEANUP = getUtility("wallet_cleanup");
type CleanupTab =
  | "overview"
  | "assets"
  | "recoverable"
  | "junk"
  | "protected"
  | "history"
  | "metrics";

export default function WalletCleaner() {
  const { connected } = useWallet();
  const cleaner = useWalletCleaner();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [burnPreviewOpen, setBurnPreviewOpen] = useState(false);
  const [tab, setTab] = useState<CleanupTab>("overview");
  const tabsRef = useRef<HTMLDivElement>(null);

  const {
    status,
    error,
    owner,
    accounts,
    tokens,
    burnCandidates,
    dustTokens,
    protectedTokens,
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
    goToTab("assets");
  }
  function goToTab(next: CleanupTab) {
    setTab(next);
    requestAnimationFrame(() =>
      tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
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

  const junkCount = burnCandidates.length + dustTokens.length;

  const tabs: { key: CleanupTab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "assets", label: "Assets", count: tokens.length },
    { key: "recoverable", label: "Recoverable", count: accounts.length },
    { key: "junk", label: "Junk Tokens", count: junkCount },
    { key: "protected", label: "Protected", count: protectedTokens.length },
    { key: "history", label: "History" },
    { key: "metrics", label: "Metrics" },
  ];

  return (
    <div className="flex flex-col gap-5 px-4 md:px-6 py-5 sm:py-6 max-w-5xl mx-auto pb-32 sm:pb-10">
      <UtilityPageHeader utility={WALLET_CLEANUP} />

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
            <p className="text-xs text-muted-foreground/80 max-w-sm mx-auto leading-relaxed">
              Connecting lets BlackPebble read public wallet data. It does not
              give permission to move funds. Wallet utility actions require a
              separate signature.
            </p>
          </div>
        ) : status === "done" ? (
          <div className="space-y-6">
            <RecoverySuccess cleaner={cleaner} />
            {owner && <RecoveryHistory wallet={owner} />}
          </div>
        ) : (
          <div className="space-y-6">
            <WalletStatusCard cleaner={cleaner} />

            {/* Wallet Health Hero (the centerpiece summary). */}
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
                  <div ref={tabsRef} className="space-y-4 scroll-mt-4">
                    {/* Section navigation - metrics and history are one tap
                        away instead of buried under long token lists. */}
                    <div
                      role="tablist"
                      aria-label="Wallet cleanup sections"
                      className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1"
                      data-testid="cleanup-tabs"
                    >
                      {tabs.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          role="tab"
                          aria-selected={tab === t.key}
                          onClick={() => setTab(t.key)}
                          className={cn(
                            "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap border flex items-center gap-1.5",
                            tab === t.key
                              ? "bg-accent/15 text-accent border-accent/30"
                              : "bg-surface-2 text-muted-foreground border-white/[0.05] hover:border-white/[0.12]",
                          )}
                          data-testid={`cleanup-tab-${t.key}`}
                        >
                          {t.label}
                          {t.count != null && t.count > 0 && (
                            <span className="font-mono text-[10px] opacity-80">
                              {t.count}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    {tab === "overview" && (
                      <div className="space-y-6">
                        <RecommendedActions
                          cleaner={cleaner}
                          onRecover={handleRecover}
                          onBurn={handleBurn}
                          onReview={handleReview}
                        />
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground px-1">
                            <Coins className="w-3.5 h-3.5 text-accent" />
                            Value analysis
                          </div>
                          <ValueSummary cleaner={cleaner} />
                        </div>
                      </div>
                    )}

                    {tab === "assets" && (
                      <div className="space-y-6">
                        {hasTokens ? (
                          <div className="rounded-xl bg-card shadow-card overflow-hidden">
                            <AllTokensAnalysis cleaner={cleaner} />
                          </div>
                        ) : (
                          <div className="rounded-xl bg-card shadow-card p-6 text-center text-sm text-muted-foreground">
                            No token holdings found in this wallet.
                          </div>
                        )}
                        <NftAnalysis owner={owner} />
                      </div>
                    )}

                    {tab === "recoverable" &&
                      (accounts.length > 0 ? (
                        <div className="rounded-xl bg-card shadow-card overflow-hidden">
                          <ScanResults cleaner={cleaner} />
                        </div>
                      ) : (
                        <div className="rounded-xl bg-card shadow-card p-6 text-center text-sm text-muted-foreground">
                          No empty token accounts - there is no trapped rent to
                          recover right now.
                        </div>
                      ))}

                    {tab === "junk" && (
                      <div className="rounded-xl bg-card shadow-card overflow-hidden">
                        <AllTokensAnalysis cleaner={cleaner} onlyJunk />
                      </div>
                    )}

                    {tab === "protected" && <ProtectedAssets cleaner={cleaner} />}

                    {tab === "history" &&
                      (owner ? (
                        <RecoveryHistory wallet={owner} />
                      ) : null)}

                    {tab === "metrics" && (
                      <WalletHealthDashboard
                        cleaner={cleaner}
                        wallet={owner}
                        variant="detail"
                      />
                    )}
                  </div>
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

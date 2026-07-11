import { useMemo } from "react";
import {
  Loader2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { TokenAvatar } from "@/components/wallet-cleaner/token-avatar";
import { type UseWalletCleaner, formatRentSol } from "@/hooks/use-wallet-cleaner";
import { useTokenMetadata } from "@/hooks/use-token-metadata";
import { healthBandLabel } from "@/lib/recovery-scan";
import { shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Wallet health score before → after the pending close, with band labels. */
function HealthDelta({ before, after }: { before: number; after: number }) {
  const improved = after > before;
  return (
    <div
      className="rounded-xl border border-border bg-secondary/30 px-4 py-3"
      data-testid="close-health-delta"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        Wallet health after cleanup
      </div>
      <div className="flex items-center gap-3">
        <div className="text-center">
          <div className="font-mono text-xl text-muted-foreground">{before}</div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
            {healthBandLabel(before)}
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
        <div className="text-center">
          <div
            className={cn(
              "font-mono text-xl font-semibold",
              improved ? "text-accent" : "text-foreground",
            )}
            data-testid="close-health-after"
          >
            {after}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
            {healthBandLabel(after)}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One compact summary card, matching the Burn modal's stat card style. */
function SummaryCard({
  label,
  value,
  accent,
  testId,
}: {
  label: string;
  value: string;
  accent?: boolean;
  testId: string;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-card px-3 py-2.5"
      data-testid={`row-${testId}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-sm",
          accent ? "text-accent" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Confirmation flow for a SOL recovery run, built on the same structure as the
 * Burn modal: health delta, summary cards, a scrollable account list, a clear
 * safety statement, and sticky footer actions. Max-height constrained so it
 * never clips off-screen - only the account list scrolls.
 */
export function ClosePreviewDialog({
  cleaner,
  open,
  onOpenChange,
  onConfirm,
}: {
  cleaner: UseWalletCleaner;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const {
    selectedAccounts,
    selectedRecoverable,
    estimatedFee,
    estimatedNet,
    txCount,
    status,
    progress,
    error,
    walletHealth,
    projectedHealthAfterClose,
    supportsBatchSigning,
    expectedApprovals,
    closedCount,
    recoveredSol,
  } = cleaner;
  const isClosing = status === "closing";
  const hasError = status === "error";

  const mints = useMemo(
    () => selectedAccounts.map((a) => a.mint),
    [selectedAccounts],
  );
  const { metaByMint, isLoading: metaLoading } = useTokenMetadata(mints);

  const pct =
    progress && progress.totalBatches > 0
      ? Math.round((progress.batchIndex / progress.totalBatches) * 100)
      : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (isClosing ? null : onOpenChange(o))}
    >
      <DialogContent
        className="max-w-md max-h-[85vh] flex flex-col p-0 gap-0"
        data-testid="dialog-close-preview"
      >
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            {isClosing ? "Recovering SOL" : "Confirm SOL recovery"}
          </DialogTitle>
          <DialogDescription>
            {isClosing
              ? supportsBatchSigning
                ? "Transactions are confirming on-chain. Do not close this window."
                : "Approve each transaction in your wallet. Do not close this window."
              : "This closes empty token accounts only. No tokens are sold or burned. Recovered SOL returns to your connected wallet."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 min-h-0">
          {isClosing && progress ? (
            <div className="space-y-4 py-2" data-testid="close-progress">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    Closing accounts {progress.fromIndex}–{progress.toIndex} of{" "}
                    {progress.total}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Transaction {progress.batchIndex} of {progress.totalBatches}
                </div>
              </div>
              <div className="h-1.5 w-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {closedCount > 0 && (
                <div
                  className="flex items-center justify-between text-xs"
                  data-testid="close-live-progress"
                >
                  <span className="text-muted-foreground">
                    {closedCount} account{closedCount === 1 ? "" : "s"} closed
                    so far
                  </span>
                  <span className="font-mono text-accent">
                    +{formatRentSol(recoveredSol)} SOL
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                {supportsBatchSigning
                  ? "Confirming on-chain…"
                  : "Waiting for wallet confirmation…"}
              </div>
            </div>
          ) : (
            <div className="space-y-4 pb-1" data-testid="recovery-summary">
              <HealthDelta
                before={walletHealth}
                after={projectedHealthAfterClose}
              />

              <div className="grid grid-cols-2 gap-2">
                <SummaryCard
                  label="Accounts selected"
                  value={String(selectedAccounts.length)}
                  testId="summary-accounts"
                />
                <SummaryCard
                  label="Recoverable SOL"
                  value={`${formatRentSol(selectedRecoverable)} SOL`}
                  accent
                  testId="summary-recoverable"
                />
                <SummaryCard
                  label="Est. network fees"
                  value={`${formatRentSol(estimatedFee)} SOL`}
                  testId="summary-fees"
                />
                <SummaryCard
                  label="Est. net received"
                  value={`${formatRentSol(estimatedNet)} SOL`}
                  accent
                  testId="summary-net"
                />
              </div>

              <div className="space-y-1.5 px-1">
                <div
                  className="flex items-center justify-between text-xs"
                  data-testid="row-summary-tx-count"
                >
                  <span className="text-muted-foreground">
                    Transactions required
                  </span>
                  <span className="font-mono text-foreground">{txCount}</span>
                </div>
                <div
                  className="flex items-center justify-between text-xs"
                  data-testid="row-summary-approvals"
                >
                  <span className="text-muted-foreground">
                    Wallet approvals
                  </span>
                  <span className="font-mono text-foreground">
                    {expectedApprovals}
                    {supportsBatchSigning && txCount > 1
                      ? " (signed together)"
                      : ""}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-card shadow-card max-h-44 overflow-y-auto divide-y divide-border">
                {selectedAccounts.map((acc) => {
                  const meta = metaByMint.get(acc.mint);
                  const symbol = meta?.symbol?.trim() ?? "";
                  const name = meta?.name?.trim() ?? "";
                  const known = symbol.length > 0;
                  // Still resolving and nothing cached yet - show the short
                  // mint as a neutral placeholder rather than flashing
                  // "Unknown Token".
                  const pending = metaLoading && !meta;
                  const shortMint = shortAddr(acc.mint, 4);
                  const primary = known
                    ? symbol
                    : pending
                      ? shortMint
                      : "Unknown Token";
                  const secondary =
                    known && name && name !== symbol ? name : shortMint;
                  return (
                    <div
                      key={acc.pubkey}
                      className="flex items-center gap-2.5 px-3 py-2"
                      data-testid={`preview-account-${acc.pubkey}`}
                    >
                      <TokenAvatar logo={meta?.logo} symbol={symbol} size={24} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-foreground truncate">
                          {primary}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground truncate">
                          {secondary}
                        </div>
                      </div>
                      <span className="font-mono text-xs text-accent flex-shrink-0">
                        +
                        {acc.sol.toLocaleString("en-US", {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 6,
                        })}{" "}
                        SOL
                      </span>
                    </div>
                  );
                })}
              </div>

              {hasError && error && (
                <div
                  className="flex items-start gap-2.5 border border-destructive-border bg-destructive/10 px-3 py-2.5 text-xs text-foreground"
                  data-testid="preview-error"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-danger flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-start gap-2.5 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2.5">
                <ShieldCheck className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
                <span className="text-[11px] text-foreground leading-relaxed">
                  Only empty token accounts are closed - your tokens, NFTs, and
                  SOL balance are untouched. Closed accounts cannot be reopened,
                  but a token you buy again simply creates a fresh account.{" "}
                  {expectedApprovals <= 1
                    ? txCount > 1
                      ? `Your wallet will ask for one approval covering all ${txCount} transactions.`
                      : "Your wallet will prompt you once to sign."
                    : `Your wallet will prompt you ${expectedApprovals} times - once per transaction.`}
                </span>
              </div>

              <Accordion type="single" collapsible>
                <AccordionItem
                  value="what-am-i-signing"
                  className="rounded-xl border border-border bg-secondary/20 overflow-hidden"
                  data-testid="close-what-signing"
                >
                  <AccordionTrigger className="px-3 py-2.5 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
                      <span className="text-xs font-medium text-foreground">
                        What am I signing?
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3">
                    <ul className="space-y-1.5 pl-5">
                      {[
                        "This transaction closes selected empty token accounts.",
                        "It does not sell tokens.",
                        "It does not burn tokens.",
                        "Recovered SOL returns to your connected wallet.",
                        "Your wallet will prompt you before anything happens.",
                      ].map((line) => (
                        <li
                          key={line}
                          className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground"
                        >
                          <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 border-t border-border px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isClosing}
            data-testid="button-cancel-close"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isClosing || selectedAccounts.length === 0}
            data-testid="button-confirm-close"
          >
            {isClosing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Recovering…
              </>
            ) : hasError ? (
              "Retry"
            ) : (
              `Recover ${formatRentSol(estimatedNet)} SOL`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

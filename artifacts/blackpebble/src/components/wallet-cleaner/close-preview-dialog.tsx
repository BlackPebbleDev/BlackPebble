import { Loader2, AlertTriangle, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RecoverySummary } from "@/components/wallet-cleaner/recovery-summary";
import { type UseWalletCleaner } from "@/hooks/use-wallet-cleaner";

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
  const { selectedAccounts, txCount, status, progress, error } = cleaner;
  const isClosing = status === "closing";
  const hasError = status === "error";

  const pct =
    progress && progress.totalBatches > 0
      ? Math.round((progress.batchIndex / progress.totalBatches) * 100)
      : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (isClosing ? null : onOpenChange(o))}
    >
      <DialogContent className="max-w-md" data-testid="dialog-close-preview">
        <DialogHeader>
          <DialogTitle>
            {isClosing ? "Closing accounts" : "Confirm account closing"}
          </DialogTitle>
          <DialogDescription>
            {isClosing
              ? "Approve each transaction in your wallet. Do not close this window."
              : "Review exactly what will happen before you sign. This only closes empty accounts."}
          </DialogDescription>
        </DialogHeader>

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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
              Waiting for wallet confirmation…
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <RecoverySummary cleaner={cleaner} />

            <div className="border border-border bg-card max-h-40 overflow-y-auto divide-y divide-border">
              {selectedAccounts.map((acc) => (
                <div
                  key={acc.pubkey}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                >
                  <span className="font-mono text-muted-foreground truncate">
                    {acc.mint.slice(0, 6)}…{acc.mint.slice(-6)}
                  </span>
                  <span className="font-mono text-foreground flex-shrink-0">
                    {acc.sol.toLocaleString("en-US", {
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 6,
                    })}{" "}
                    SOL
                  </span>
                </div>
              ))}
            </div>

            {hasError && error && (
              <div
                className="flex items-start gap-2.5 border border-destructive-border bg-destructive/10 px-3 py-2.5 text-xs text-foreground"
                data-testid="preview-error"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-start gap-2.5 text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
              <Info className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
              <span>
                Closed token accounts cannot be recovered.{" "}
                {txCount > 1
                  ? `Your wallet will prompt you ${txCount} times — once per transaction.`
                  : "Your wallet will prompt you once to sign."}{" "}
                All recovered SOL goes to your connected wallet.
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
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
                Closing…
              </>
            ) : hasError ? (
              "Retry"
            ) : (
              `Close ${selectedAccounts.length} ${
                selectedAccounts.length === 1 ? "account" : "accounts"
              }`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

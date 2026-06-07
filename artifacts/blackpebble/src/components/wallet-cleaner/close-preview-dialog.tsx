import { Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { shortAddr } from "@/lib/format";
import { formatRentSol, type UseWalletCleaner } from "@/hooks/use-wallet-cleaner";

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
  const { selectedAccounts, selectedRecoverable, txCount, status } = cleaner;
  const isClosing = status === "closing";

  return (
    <Dialog open={open} onOpenChange={(o) => (isClosing ? null : onOpenChange(o))}>
      <DialogContent className="max-w-md" data-testid="dialog-close-preview">
        <DialogHeader>
          <DialogTitle>Confirm account closing</DialogTitle>
          <DialogDescription>
            Review exactly what will happen before you sign. This action cannot be
            undone, but it only closes empty accounts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-px bg-border border border-border">
            <div className="bg-card px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Accounts
              </div>
              <div className="font-mono text-base text-foreground">
                {selectedAccounts.length}
              </div>
            </div>
            <div className="bg-card px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Recover
              </div>
              <div className="font-mono text-base text-foreground">
                {formatRentSol(selectedRecoverable)}
              </div>
            </div>
            <div className="bg-card px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Signatures
              </div>
              <div className="font-mono text-base text-foreground">
                {txCount}
              </div>
            </div>
          </div>

          <div className="border border-border bg-card max-h-48 overflow-y-auto divide-y divide-border">
            {selectedAccounts.map((acc) => (
              <div
                key={acc.pubkey}
                className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
              >
                <span className="font-mono text-muted-foreground truncate">
                  {shortAddr(acc.mint, 6)}
                </span>
                <span className="font-mono text-foreground flex-shrink-0">
                  {formatRentSol(acc.sol)} SOL
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2.5 text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
            <AlertTriangle className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
            <span>
              {txCount > 1
                ? `Your wallet will prompt you ${txCount} times — once per transaction.`
                : "Your wallet will prompt you once to sign."}{" "}
              A small network fee applies. All recovered SOL goes to your wallet.
            </span>
          </div>
        </div>

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

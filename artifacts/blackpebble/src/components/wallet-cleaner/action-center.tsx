import { Coins, Flame, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRentSol, type UseWalletCleaner } from "@/hooks/use-wallet-cleaner";

/**
 * Unified Action Center - a single sticky bar that replaces the separate
 * rent-recovery and burn action bars. It surfaces whichever selections are
 * pending (reclaimable accounts and/or tokens staged to burn) in one place, so
 * the user never has to hunt for two different action surfaces.
 */
export function ActionCenter({
  cleaner,
  onRecover,
  onBurn,
}: {
  cleaner: UseWalletCleaner;
  onRecover: () => void;
  onBurn: () => void;
}) {
  const {
    selectedAccounts,
    selectedRecoverable,
    clearSelection,
    burnSelectedTokens,
    clearBurnSelection,
  } = cleaner;

  const hasRecover = selectedAccounts.length > 0;
  const hasBurn = burnSelectedTokens.length > 0;
  if (!hasRecover && !hasBurn) return null;

  const burnRent = burnSelectedTokens.reduce((s, t) => s + t.asset.sol, 0);

  return (
    <div
      className="fixed bottom-16 md:bottom-0 left-0 right-0 md:pl-[60px] z-30 bg-background/95 backdrop-blur-md border-t border-border"
      data-testid="action-center"
    >
      <div className="max-w-3xl mx-auto px-4 py-3 space-y-2">
        {hasRecover && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 text-xs text-muted-foreground">
              <Coins className="w-4 h-4 text-accent flex-shrink-0" />
              <span className="truncate">
                <span className="font-mono text-foreground">
                  {selectedAccounts.length}
                </span>{" "}
                selected ·{" "}
                <span className="font-mono text-accent">
                  {formatRentSol(selectedRecoverable)} SOL
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={clearSelection}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear recovery selection"
                data-testid="button-clear-recover"
              >
                <X className="w-4 h-4" />
              </button>
              <Button
                onClick={onRecover}
                className="rounded-2xl"
                data-testid="button-open-preview"
              >
                Recover SOL
              </Button>
            </div>
          </div>
        )}

        {hasBurn && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 text-xs text-muted-foreground">
              <Flame className="w-4 h-4 text-danger flex-shrink-0" />
              <span className="truncate">
                <span className="font-mono text-foreground">
                  {burnSelectedTokens.length}
                </span>{" "}
                to burn ·{" "}
                <span className="font-mono text-accent">
                  {formatRentSol(burnRent)} SOL
                </span>{" "}
                rent back
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={clearBurnSelection}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear burn selection"
                data-testid="button-clear-burn"
              >
                <X className="w-4 h-4" />
              </button>
              <Button
                onClick={onBurn}
                className="rounded-2xl bg-red-500 hover:bg-red-600 text-white"
                data-testid="button-open-burn-preview"
              >
                <Flame className="w-4 h-4" />
                Burn
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle, Flame, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TokenAvatar } from "@/components/wallet-cleaner/token-avatar";
import { type UseWalletCleaner, formatRentSol } from "@/hooks/use-wallet-cleaner";
import { useTokenMetadata } from "@/hooks/use-token-metadata";
import { formatUsd, formatTokenAmount } from "@/lib/recovery-classify";
import { healthBandLabel } from "@/lib/recovery-scan";
import { shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Health score before → after the pending burn, with band labels. */
function HealthDelta({ before, after }: { before: number; after: number }) {
  const improved = after > before;
  return (
    <div
      className="rounded-xl border border-border bg-secondary/30 px-4 py-3"
      data-testid="burn-health-delta"
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
            data-testid="burn-health-after"
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

/**
 * Confirmation flow for an irreversible on-chain burn run. Shows exactly which
 * tokens will be burned (and their accounts closed for rent), the projected
 * health improvement, the rent recovered, and requires an explicit
 * acknowledgement that burning is permanent before the sign button unlocks.
 */
export function BurnPreviewDialog({
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
    burnSelectedTokens,
    burnStatus,
    burnProgress,
    burnError,
    walletHealth,
    projectedHealthAfterBurn,
  } = cleaner;

  const isBurning = burnStatus === "burning";
  const hasError = burnStatus === "error";
  const [ack, setAck] = useState(false);

  // Reset the acknowledgement each time the dialog opens fresh.
  useEffect(() => {
    if (open) setAck(false);
  }, [open]);

  const mints = useMemo(
    () => burnSelectedTokens.map((t) => t.asset.mint),
    [burnSelectedTokens],
  );
  const { metaByMint, isLoading: metaLoading } = useTokenMetadata(mints);

  const rentRecoverable = burnSelectedTokens.reduce(
    (sum, t) => sum + t.asset.sol,
    0,
  );
  const count = burnSelectedTokens.length;

  const pct =
    burnProgress && burnProgress.totalBatches > 0
      ? Math.round((burnProgress.batchIndex / burnProgress.totalBatches) * 100)
      : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => (isBurning ? null : onOpenChange(o))}>
      <DialogContent className="max-w-md" data-testid="dialog-burn-preview">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-danger" />
            {isBurning ? "Burning tokens" : "Confirm token burn"}
          </DialogTitle>
          <DialogDescription>
            {isBurning
              ? "Approve each transaction in your wallet. Do not close this window."
              : "Burning permanently destroys these tokens and closes their accounts to reclaim rent. This cannot be undone."}
          </DialogDescription>
        </DialogHeader>

        {isBurning && burnProgress ? (
          <div className="space-y-4 py-2" data-testid="burn-progress">
            <div className="space-y-1.5">
              <div className="text-sm text-foreground">
                Burning tokens {burnProgress.fromIndex}–{burnProgress.toIndex} of{" "}
                {burnProgress.total}
              </div>
              <div className="text-xs text-muted-foreground">
                Transaction {burnProgress.batchIndex} of {burnProgress.totalBatches}
              </div>
            </div>
            <div className="h-1.5 w-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-red-400 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-danger" />
              Waiting for wallet confirmation…
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <HealthDelta
              before={walletHealth}
              after={projectedHealthAfterBurn}
            />

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-card px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Tokens to burn
                </div>
                <div className="font-mono text-sm text-foreground">{count}</div>
              </div>
              <div className="rounded-xl border border-border bg-card px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Rent reclaimed
                </div>
                <div className="font-mono text-sm text-accent">
                  {formatRentSol(rentRecoverable)} SOL
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-card shadow-card max-h-40 overflow-y-auto divide-y divide-border">
              {burnSelectedTokens.map((t) => {
                const meta = metaByMint.get(t.asset.mint);
                const symbol = meta?.symbol?.trim() ?? "";
                const known = symbol.length > 0;
                const pending = metaLoading && !meta;
                const shortMint = shortAddr(t.asset.mint, 4);
                const primary = known
                  ? symbol
                  : pending
                    ? shortMint
                    : "Unknown Token";
                return (
                  <div
                    key={t.asset.pubkey}
                    className="flex items-center gap-2.5 px-3 py-2"
                    data-testid={`burn-preview-${t.asset.pubkey}`}
                  >
                    <TokenAvatar logo={meta?.logo} symbol={symbol} size={24} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">
                        {primary}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground truncate">
                        {formatTokenAmount(t.asset.uiAmount)} · {formatUsd(t.valueUsd)}
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-accent flex-shrink-0">
                      +{formatRentSol(t.asset.sol)} SOL
                    </span>
                  </div>
                );
              })}
            </div>

            {hasError && burnError && (
              <div
                className="flex items-start gap-2.5 border border-destructive-border bg-destructive/10 px-3 py-2.5 text-xs text-foreground"
                data-testid="burn-preview-error"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-danger flex-shrink-0 mt-0.5" />
                <span>{burnError}</span>
              </div>
            )}

            <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5">
              <Checkbox
                checked={ack}
                onCheckedChange={(v) => setAck(v === true)}
                className="mt-0.5 flex-shrink-0"
                data-testid="checkbox-burn-ack"
              />
              <span className="text-[11px] text-foreground leading-relaxed">
                I understand these tokens will be permanently destroyed and cannot
                be recovered. Only the locked rent returns to my wallet.
              </span>
            </label>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isBurning}
            data-testid="button-cancel-burn"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isBurning || count === 0 || !ack}
            className="bg-red-500 hover:bg-red-600 text-white"
            data-testid="button-confirm-burn"
          >
            {isBurning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Burning…
              </>
            ) : hasError ? (
              "Retry"
            ) : (
              <>
                <Flame className="w-4 h-4" />
                Burn {count} {count === 1 ? "token" : "tokens"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

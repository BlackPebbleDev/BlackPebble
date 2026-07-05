import { CheckCircle2, Share2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatRentSol, type UseWalletCleaner } from "@/hooks/use-wallet-cleaner";
import {
  SignatureRow,
  solscanTx,
} from "@/components/wallet-cleaner/signature-row";

/** One labelled metric row in the recovery breakdown. */
function StatRow({
  label,
  value,
  accent = false,
  hint,
}: {
  label: string;
  value: string;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        {hint && (
          <span className="rounded-md bg-accent/12 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-accent">
            {hint}
          </span>
        )}
        <span
          className={
            accent
              ? "font-mono text-sm font-semibold text-accent"
              : "font-mono text-sm text-foreground"
          }
        >
          {value}
        </span>
      </span>
    </div>
  );
}

/**
 * Premium post-recovery summary: the full SOL breakdown (recovered, network fee,
 * BlackPebble fee = 0, net received), confirmed transaction signatures with
 * Solscan / Solana Explorer links, copy + share, and a way back to Recovery.
 * Display-only - it never re-runs or alters the on-chain recovery flow.
 */
export function RecoverySuccess({ cleaner }: { cleaner: UseWalletCleaner }) {
  const { recoveredSol, closedCount, recoveredFee, recoveredNet, signatures, scan, reset } =
    cleaner;
  const { toast } = useToast();

  const sigCount = signatures.length;

  // Only expose Share when a safe mechanism actually exists: the native share
  // sheet, or a clipboard fallback. If neither is available we hide the button
  // entirely rather than offering a dead action.
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const canClipboardShare =
    typeof navigator !== "undefined" &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function";
  const canShare = canNativeShare || canClipboardShare;

  async function copyToClipboardShare(payload: string) {
    try {
      await navigator.clipboard.writeText(payload);
      toast({ title: "Result copied" });
    } catch {
      toast({ title: "Couldn't share result", variant: "destructive" });
    }
  }

  async function shareResult() {
    const text = `I just recovered ${formatRentSol(recoveredNet)} SOL from ${closedCount} empty token account${
      closedCount === 1 ? "" : "s"
    } with BlackPebble SOL Recovery.`;
    const url = signatures[0] ? solscanTx(signatures[0]) : undefined;
    const payload = url ? `${text} ${url}` : text;

    if (canNativeShare) {
      try {
        await navigator.share({
          title: "SOL Recovery",
          text,
          ...(url ? { url } : {}),
        });
      } catch (err) {
        // User dismissed the native share sheet - not an error.
        if ((err as Error)?.name === "AbortError") return;
        // A real native-share failure: fall back to clipboard if we can.
        if (canClipboardShare) await copyToClipboardShare(payload);
      }
      return;
    }

    await copyToClipboardShare(payload);
  }

  return (
    <div
      className="rounded-xl bg-card shadow-card p-6 sm:p-8 space-y-6"
      data-testid="recovery-complete"
    >
      <div className="text-center space-y-2">
        <CheckCircle2 className="w-10 h-10 text-accent mx-auto" />
        <div className="space-y-1">
          <div className="text-lg font-semibold">Recovery complete</div>
          <p className="text-sm text-muted-foreground">
            Your recovered SOL has landed in your connected wallet.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
        <StatRow
          label="Recovered SOL"
          value={`${formatRentSol(recoveredSol)} SOL`}
        />
        <StatRow label="Accounts closed" value={String(closedCount)} />
        <StatRow
          label="Network fee"
          value={`${formatRentSol(recoveredFee)} SOL`}
        />
        <StatRow
          label="BlackPebble fee"
          value={`${formatRentSol(0)} SOL`}
          hint="Free"
        />
        <StatRow
          label="Net received"
          value={`${formatRentSol(recoveredNet)} SOL`}
          accent
        />
      </div>

      {sigCount > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {sigCount === 1 ? "Transaction" : `Transactions (${sigCount})`}
          </div>
          <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
            {signatures.map((sig) => (
              <SignatureRow key={sig} sig={sig} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch gap-2">
        <Button
          onClick={reset}
          className="rounded-2xl flex-1"
          data-testid="button-recovery-done"
        >
          Done
        </Button>
        <Button
          variant="outline"
          onClick={scan}
          className="rounded-2xl flex-1"
          data-testid="button-scan-again"
        >
          <RotateCw className="w-3.5 h-3.5" />
          Scan again
        </Button>
        {sigCount > 0 && canShare && (
          <Button
            variant="outline"
            onClick={shareResult}
            className="rounded-2xl flex-1"
            data-testid="button-share-result"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share result
          </Button>
        )}
      </div>
    </div>
  );
}

import { ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatUsd, type EnrichedToken } from "@/lib/recovery-classify";

/**
 * Extra confirmation before removing protection from an asset that is protected
 * by default (a verified token or one with meaningful realizable value).
 * Removing protection makes the token eligible to appear as a burn/dust
 * candidate, so we require an explicit, informed second step.
 */
export function ProtectConfirmDialog({
  token,
  open,
  onOpenChange,
  onConfirm,
}: {
  token: EnrichedToken | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="dialog-protect-confirm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            Remove protection?
          </DialogTitle>
          <DialogDescription>
            {token?.intel?.verified
              ? "This is a verified token, protected by default."
              : "This asset has meaningful realizable value, so it's protected by default."}{" "}
            Removing protection lets it be selected for cleanup.
          </DialogDescription>
        </DialogHeader>

        {token && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Displayed value</span>
              <span className="font-mono text-sm text-foreground">
                {formatUsd(token.valueUsd)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Realizable value</span>
              <span className="font-mono text-sm text-foreground">
                {formatUsd(token.realizableUsd)}
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-unprotect"
          >
            Keep protected
          </Button>
          <Button
            onClick={onConfirm}
            className="bg-amber-500 hover:bg-amber-600 text-white"
            data-testid="button-confirm-unprotect"
          >
            Remove protection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

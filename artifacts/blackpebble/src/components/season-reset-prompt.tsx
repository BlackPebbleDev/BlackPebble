import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Loader2, Sparkles } from "lucide-react";
import { useAccount } from "@/hooks/use-account";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Mirror of the server-side RESET_THRESHOLD: a paper account counts as depleted
// once total equity (cash + open positions) falls below 1 SOL.
const DEPLETED_THRESHOLD = 1.0;

/**
 * Surfaces a one-tap "start a new season" reset when the signed-in account is
 * effectively wiped out (equity < 1 SOL). Confirmation-gated, and dismissible
 * for the current browser session so it never nags mid-trade. Identity, links
 * and watchlist are preserved by the backend reset.
 */
export function SeasonResetPrompt() {
  const { wallet, isGuest, refresh } = useAccount();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { data: portfolio } = useQuery({
    queryKey: ["portfolio", wallet],
    queryFn: () => api.portfolio(wallet!),
    enabled: !!wallet && !isGuest,
    refetchInterval: 30_000,
  });

  const equity = portfolio?.equitySol;
  const depleted = equity != null && equity < DEPLETED_THRESHOLD;

  useEffect(() => {
    if (depleted && !dismissed) setOpen(true);
  }, [depleted, dismissed]);

  const newSeason = useMutation({
    mutationFn: () => api.newSeason(wallet!),
    onSuccess: (r) => {
      toast({
        title: `Season ${r.season ?? ""} started`.trim(),
        description: "Your paper balance is back to 100 SOL. Good luck!",
      });
      setOpen(false);
      setDismissed(true);
      refresh();
      qc.invalidateQueries();
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't start a new season", description: e.message, variant: "destructive" }),
  });

  if (!depleted) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setDismissed(true);
      }}
    >
      <DialogContent data-testid="dialog-season-reset">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-accent" />
            Paper account depleted
          </DialogTitle>
          <DialogDescription>
            Your equity is down to{" "}
            <span className="font-mono text-foreground">
              {equity?.toFixed(3)} SOL
            </span>
            . Start a fresh season to reset your paper balance back to{" "}
            <span className="font-mono text-foreground">100 SOL</span> and trade again.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-background/40 p-3 text-sm text-muted-foreground">
          This clears your open positions, pending orders and current-season P&amp;L
          history. Your account, wallet / X links and watchlist are kept.
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false);
              setDismissed(true);
            }}
            data-testid="button-season-later"
          >
            Not now
          </Button>
          <Button
            onClick={() => newSeason.mutate()}
            disabled={newSeason.isPending}
            data-testid="button-season-start"
          >
            {newSeason.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Start new season
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

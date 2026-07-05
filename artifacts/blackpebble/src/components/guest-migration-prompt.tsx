import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useAccount } from "@/hooks/use-account";
import { useToast } from "@/hooks/use-toast";
import {
  useGuestStore,
  hasGuestActivity,
  isMigrationDismissed,
  dismissMigration,
  clearGuest,
  removeGuestPositions,
  getGuestState,
} from "@/lib/guest-store";
import { trackGuestConverted } from "@/lib/analytics";

/**
 * Shown once when a wallet connects while local guest activity exists.
 *
 * "Save" re-runs each guest position as a real server buy (sized by the SOL
 * originally spent, capped to live balance) and migrates the watchlist. Guest
 * trade history and realized P&L are intentionally NOT imported - doing so would
 * let anyone fabricate a leaderboard record locally and "save" it. "Start Fresh"
 * permanently discards ALL local guest state (positions, balance, history,
 * watchlist) and drops the user onto their authenticated account with its
 * default starting balance.
 */
export function GuestMigrationPrompt() {
  const { wallet } = useAccount();
  const guest = useGuestStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const show =
    !!wallet &&
    hasGuestActivity(guest) &&
    !isMigrationDismissed(wallet);

  if (!show) return null;

  async function handleSave() {
    if (!wallet) return;
    setBusy(true);
    const migratedMints: string[] = [];
    let failed = 0;
    try {
      // Sequential so the server balance is debited in order and later buys see
      // the reduced balance (a buy that would overdraw simply fails server-side).
      for (const p of guest.positions) {
        const res = await api.execute({
          wallet,
          mint: p.token_mint,
          side: "buy",
          solAmount: p.total_sol_spent,
          name: p.token_name,
          symbol: p.token_symbol,
          logo: p.token_logo,
        });
        if (res.ok) migratedMints.push(p.token_mint);
        else failed += 1;
      }
      for (const w of guest.watchlist) {
        try {
          await api.watchlistAdd({
            wallet,
            mint: w.mint,
            name: w.name,
            symbol: w.symbol,
            logo: w.logo,
          });
        } catch {
          /* non-fatal: a watchlist row failing shouldn't block migration */
        }
      }

      // Funnel beacon: count a conversion only when the guest actually carried
      // positions over to their wallet (full or partial success). A run where
      // nothing migrated is not a conversion. Captured before clearGuest() wipes
      // the anon_id.
      if (migratedMints.length > 0) {
        trackGuestConverted(getGuestState().anon_id);
      }

      if (failed === 0) {
        // Everything transferred - safe to wipe local guest state entirely.
        clearGuest();
      } else {
        // Drop only the positions that actually moved to the wallet; keep the
        // rest locally so nothing is silently lost, and stop nagging this wallet.
        removeGuestPositions(migratedMints);
        dismissMigration(wallet);
      }

      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["pf"] });
      qc.invalidateQueries({ queryKey: ["pf-stats"] });
      qc.invalidateQueries({ queryKey: ["account"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      toast({
        title: failed > 0 ? "Guest portfolio partially saved" : "Guest portfolio saved",
        description:
          failed > 0
            ? `${migratedMints.length} position${migratedMints.length === 1 ? "" : "s"} saved. ${failed} couldn't fit your balance and stayed on this device.`
            : `${migratedMints.length} position${migratedMints.length === 1 ? "" : "s"} migrated to your wallet.`,
        variant: failed > 0 ? "destructive" : undefined,
      });
    } catch (e) {
      toast({
        title: "Couldn't save guest portfolio",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  function handleStartFresh() {
    if (!wallet) return;
    // Discard EVERY trace of guest state (positions, balance, history,
    // watchlist) so nothing carries over, then mark this account so the prompt
    // never reappears. Clearing makes hasGuestActivity() false, which also hides
    // this modal immediately.
    clearGuest();
    dismissMigration(wallet);
    // Re-pull the authenticated account so the UI shows its default balance and
    // empty portfolio instead of the now-discarded guest data.
    qc.invalidateQueries({ queryKey: ["positions"] });
    qc.invalidateQueries({ queryKey: ["pf"] });
    qc.invalidateQueries({ queryKey: ["pf-stats"] });
    qc.invalidateQueries({ queryKey: ["account"] });
    qc.invalidateQueries({ queryKey: ["history"] });
    qc.invalidateQueries({ queryKey: ["watchlist"] });
    toast({
      title: "Started fresh",
      description: "Guest data cleared. You're now trading on your account.",
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
      <div
        data-testid="modal-guest-migration"
        className="w-full max-w-md rounded-2xl bg-card shadow-elevated p-6"
      >
        <div className="flex items-center gap-3 mb-3">
          <Wallet className="w-6 h-6 text-accent" />
          <h2 className="text-lg font-semibold">Save your portfolio?</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5">
          You have {guest.positions.length} open position
          {guest.positions.length === 1 ? "" : "s"}
          {guest.watchlist.length > 0
            ? ` and ${guest.watchlist.length} watchlist item${
                guest.watchlist.length === 1 ? "" : "s"
              }`
            : ""}{" "}
          on this device. Save them to your account to keep trading, build your
          reputation, and become leaderboard-eligible. Earlier trade history
          isn't carried over.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="button-migration-save"
            disabled={busy}
            onClick={handleSave}
            className="flex-1 h-11 rounded-xl bg-accent text-accent-foreground text-sm font-semibold shadow-card hover:bg-accent/90 active:scale-[.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
          <button
            type="button"
            data-testid="button-migration-start-fresh"
            disabled={busy}
            onClick={handleStartFresh}
            className="flex-1 h-11 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors disabled:opacity-50"
          >
            Start Fresh
          </button>
        </div>
      </div>
    </div>
  );
}

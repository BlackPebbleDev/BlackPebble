import { Button } from "@/components/ui/button";
import { AccountRow } from "@/components/wallet-cleaner/account-row";
import { formatRentSol, type UseWalletCleaner } from "@/hooks/use-wallet-cleaner";

export function ScanResults({ cleaner }: { cleaner: UseWalletCleaner }) {
  const {
    accounts,
    selected,
    totalRecoverable,
    selectAll,
    clearSelection,
    toggle,
  } = cleaner;

  const allSelected = accounts.length > 0 && selected.size === accounts.length;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Recoverable rent
          </div>
          <div className="font-mono text-2xl text-foreground">
            {formatRentSol(totalRecoverable)}{" "}
            <span className="text-sm text-muted-foreground">SOL</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {accounts.length} empty token{" "}
            {accounts.length === 1 ? "account" : "accounts"} found
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={allSelected ? clearSelection : selectAll}
          data-testid="button-select-all"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </Button>
      </div>

      <div className="border border-border bg-card divide-y divide-border">
        {accounts.map((account) => (
          <AccountRow
            key={account.pubkey}
            account={account}
            checked={selected.has(account.pubkey)}
            onToggle={() => toggle(account.pubkey)}
          />
        ))}
      </div>
    </div>
  );
}

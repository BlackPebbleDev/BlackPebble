import { Checkbox } from "@/components/ui/checkbox";
import { shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  formatRentSol,
  type CloseableAccount,
} from "@/hooks/use-wallet-cleaner";

export function AccountRow({
  account,
  checked,
  onToggle,
}: {
  account: CloseableAccount;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 px-4 min-h-[56px] cursor-pointer transition-colors",
        checked ? "bg-accent/10" : "hover:bg-secondary",
      )}
      data-testid={`row-account-${account.pubkey}`}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        className="flex-shrink-0"
        data-testid={`checkbox-account-${account.pubkey}`}
      />
      <div className="flex-1 min-w-0">
        <div className="font-mono text-sm text-foreground truncate">
          {shortAddr(account.mint, 6)}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground truncate">
          acct {shortAddr(account.pubkey, 4)}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="font-mono text-sm text-foreground">
          {formatRentSol(account.sol)}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          SOL
        </div>
      </div>
    </label>
  );
}

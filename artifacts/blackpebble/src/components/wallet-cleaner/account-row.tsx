import { Checkbox } from "@/components/ui/checkbox";
import { shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  formatRentSol,
  type CloseableAccount,
} from "@/hooks/use-wallet-cleaner";
import { TokenAvatar } from "@/components/wallet-cleaner/token-avatar";
import type { RecoveryTokenMeta } from "@/lib/api";

export function AccountRow({
  account,
  checked,
  onToggle,
  meta,
  metaLoading = false,
}: {
  account: CloseableAccount;
  checked: boolean;
  onToggle: () => void;
  meta?: RecoveryTokenMeta;
  metaLoading?: boolean;
}) {
  const symbol = meta?.symbol?.trim() ?? "";
  const name = meta?.name?.trim() ?? "";
  const known = symbol.length > 0;
  const shortMint = shortAddr(account.mint, 4);

  // While the batch lookup is still in flight and we have nothing for this mint,
  // show the short mint as a neutral placeholder rather than flashing
  // "Unknown Token" prematurely.
  const pending = metaLoading && !meta;

  const primary = known ? symbol : pending ? shortMint : "Unknown Token";
  // Secondary line: token name when known; short mint as the fallback subtitle
  // for the Unknown case. Hidden entirely while pending.
  const secondary = known
    ? name && name !== symbol
      ? name
      : ""
    : pending
      ? ""
      : shortMint;

  return (
    <label
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 min-h-[56px] cursor-pointer transition-colors",
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

      <TokenAvatar logo={meta?.logo} symbol={symbol} size={32} />

      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium text-foreground truncate"
          data-testid={`text-token-symbol-${account.pubkey}`}
        >
          {primary}
        </div>
        {secondary && (
          <div className="text-xs text-muted-foreground truncate">
            {secondary}
          </div>
        )}
        {known && (
          <div className="font-mono text-[10px] text-muted-foreground/70 truncate">
            {shortMint}
          </div>
        )}
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

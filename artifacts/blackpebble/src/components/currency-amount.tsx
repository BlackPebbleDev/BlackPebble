import { fmtSol, fmtUsd } from "@/lib/format";
import { usePnlCurrency } from "@/lib/pnl-currency";
import { cn } from "@/lib/utils";

/**
 * A non-signed balance value (equity, cash, etc.) that the trader can tap to
 * switch between SOL and USD. It shares the exact same global currency context
 * as <PnlAmount/>, so one tap flips every balance AND every P&L on screen
 * together, and the choice persists for the session.
 *
 * Rendered as a span (not a button) so it can live inside clickable cards/rows
 * without nesting interactive elements; the click is stopped from propagating.
 */
export function CurrencyAmount({
  sol,
  solUsd,
  unit = true,
  className,
}: {
  sol: number | null | undefined;
  solUsd: number | null | undefined;
  /** Show the "SOL" suffix in SOL mode (USD mode always shows "$"). */
  unit?: boolean;
  className?: string;
}) {
  const { mode, toggle } = usePnlCurrency();

  const usdReady = solUsd != null && Number.isFinite(solUsd) && solUsd > 0;
  const showUsd = mode === "USD" && usdReady;

  const display =
    sol == null || !Number.isFinite(sol)
      ? "—"
      : showUsd
        ? fmtUsd(sol * (solUsd as number))
        : `${fmtSol(sol)}${unit ? " SOL" : ""}`;

  const activate = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    toggle();
  };

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate(e);
        }
      }}
      title={`Showing ${showUsd ? "USD" : "SOL"} - tap to switch`}
      aria-label={`${display} (showing ${showUsd ? "USD" : "SOL"}, tap to switch currency)`}
      data-testid="currency-toggle"
      className={cn(
        "cursor-pointer underline decoration-dotted decoration-current/40 underline-offset-2 hover:decoration-current/80 focus-visible:ring-1 focus-visible:ring-current/40 outline-none transition-colors",
        className,
      )}
    >
      {display}
    </span>
  );
}

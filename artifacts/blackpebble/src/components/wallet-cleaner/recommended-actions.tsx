import { useMemo } from "react";
import { Coins, Flame, Search, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRentSol, type UseWalletCleaner } from "@/hooks/use-wallet-cleaner";

function ActionRow({
  icon,
  tone,
  title,
  subtitle,
  cta,
  disabled,
  onClick,
  testId,
}: {
  icon: React.ReactNode;
  tone: "accent" | "danger";
  title: string;
  subtitle: string;
  cta: string;
  disabled: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors",
        "hover:bg-secondary/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent",
      )}
      data-testid={testId}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
          tone === "danger"
            ? "bg-red-500/12 text-red-400"
            : "bg-accent/12 text-accent",
        )}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-muted-foreground leading-snug">
          {subtitle}
        </div>
      </div>
      {!disabled && (
        <span
          className={cn(
            "flex items-center gap-1 text-xs font-medium flex-shrink-0",
            tone === "danger" ? "text-red-400" : "text-accent",
          )}
        >
          <span className="hidden xs:inline">{cta}</span>
          <ChevronRight className="w-4 h-4" />
        </span>
      )}
    </button>
  );
}

/**
 * SECTION 2 — Recommended Actions. An action-focused workflow that turns the
 * scan results into one-tap next steps: reclaim trapped SOL, burn confirmed
 * junk, or review everything that needs a human look. Each action is gated on
 * real counts and disabled (with an explicit reason) when there's nothing to do.
 */
export function RecommendedActions({
  cleaner,
  onRecover,
  onBurn,
  onReview,
}: {
  cleaner: UseWalletCleaner;
  onRecover: () => void;
  onBurn: () => void;
  onReview: () => void;
}) {
  const {
    accounts,
    totalRecoverable,
    burnCandidates,
    dustTokens,
    allTokens,
  } = cleaner;

  const reviewCount = useMemo(
    () =>
      allTokens.filter(
        (t) => !t.isProtected && t.suggestedAction === "Review",
      ).length,
    [allTokens],
  );

  const recoverDisabled = accounts.length === 0;
  const burnDisabled = burnCandidates.length === 0;
  const reviewDisabled = reviewCount === 0 && dustTokens.length === 0;

  return (
    <section className="space-y-2.5" data-testid="recommended-actions">
      <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground px-1">
        Recommended actions
      </h2>
      <div className="rounded-3xl bg-card shadow-card overflow-hidden divide-y divide-border">
        <ActionRow
          icon={<Coins className="w-5 h-5" />}
          tone="accent"
          title="Recover SOL"
          subtitle={
            recoverDisabled
              ? "No empty accounts to reclaim"
              : `${accounts.length} empty ${accounts.length === 1 ? "account" : "accounts"} · ${formatRentSol(totalRecoverable)} SOL`
          }
          cta="Recover"
          disabled={recoverDisabled}
          onClick={onRecover}
          testId="action-recover-sol"
        />
        <ActionRow
          icon={<Flame className="w-5 h-5" />}
          tone="danger"
          title="Burn junk tokens"
          subtitle={
            burnDisabled
              ? "No burn candidates found"
              : `${burnCandidates.length} spam / unsellable ${burnCandidates.length === 1 ? "token" : "tokens"}`
          }
          cta="Review & burn"
          disabled={burnDisabled}
          onClick={onBurn}
          testId="action-burn-junk"
        />
        <ActionRow
          icon={<Search className="w-5 h-5" />}
          tone="accent"
          title="Review assets"
          subtitle={
            reviewDisabled
              ? "Nothing needs a closer look"
              : `${reviewCount + dustTokens.length} ${reviewCount + dustTokens.length === 1 ? "asset" : "assets"} worth a closer look`
          }
          cta="Review"
          disabled={reviewDisabled}
          onClick={onReview}
          testId="action-review-assets"
        />
      </div>
    </section>
  );
}

import { useMemo } from "react";
import { ShieldCheck, Coins, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatRentSol, type UseWalletCleaner } from "@/hooks/use-wallet-cleaner";

/** Map a real 0–100 health score to a human label + accent treatment. */
function healthBand(score: number): { label: string; tone: string } {
  if (score >= 90) return { label: "Excellent", tone: "text-accent" };
  if (score >= 75) return { label: "Good", tone: "text-accent" };
  if (score >= 60) return { label: "Fair", tone: "text-foreground" };
  return { label: "Needs cleanup", tone: "text-amber-400" };
}

/** A single compact hero metric. Falls back to "—" — never fabricated. */
function HeroStat({
  icon,
  label,
  value,
  tone = "text-foreground",
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
  testId: string;
}) {
  return (
    <div
      className="rounded-2xl border border-border bg-secondary/30 px-3 py-2.5"
      data-testid={testId}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        <span className="text-accent">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("font-mono text-base font-semibold leading-none", tone)}>
        {value}
      </div>
    </div>
  );
}

/**
 * SECTION 1 — Wallet Health Hero. The centerpiece summary: a real 0–100 health
 * score plus the three figures a holder acts on (recoverable SOL, assets that
 * need a look, and protected assets). Every value is derived from the live scan
 * via the cleaner hook — nothing is fabricated, and "—" shows until a scan runs.
 */
export function WalletHealthHero({
  cleaner,
  onScan,
}: {
  cleaner: UseWalletCleaner;
  onScan: () => void;
}) {
  const {
    status,
    accounts,
    totalRecoverable,
    walletHealth,
    healthExplanation,
    allTokens,
    protectedTokens,
    intelLoading,
  } = cleaner;

  const hasScanned =
    status === "scanned" ||
    status === "closing" ||
    status === "done" ||
    (status === "error" && accounts.length > 0);

  // "Needs review" = everything not protected that warrants a human look: burn
  // candidates, dust, and tokens whose market couldn't be confidently resolved.
  // Single pass over allTokens so a token counted once even if it matches more
  // than one signal (e.g. a dust-bucket token also suggested for review).
  const reviewCount = useMemo(
    () =>
      allTokens.filter(
        (t) =>
          !t.isProtected &&
          (t.suggestedAction === "Review" ||
            t.bucket === "dust" ||
            t.bucket === "burn"),
      ).length,
    [allTokens],
  );

  const band = healthBand(walletHealth);
  const scanning = status === "scanning";

  return (
    <section
      className="rounded-3xl bg-card shadow-card p-5 sm:p-6 space-y-5"
      data-testid="wallet-health-hero"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Wallet health
          </div>
          {hasScanned ? (
            <div className="flex items-baseline gap-1.5">
              <span
                className="font-mono text-4xl sm:text-5xl font-semibold text-accent leading-none"
                data-testid="hero-health-score"
              >
                {walletHealth}
              </span>
              <span className="font-mono text-sm text-muted-foreground">
                / 100
              </span>
            </div>
          ) : (
            <div className="font-mono text-4xl sm:text-5xl font-semibold text-muted-foreground leading-none">
              —
            </div>
          )}
        </div>
        {hasScanned && (
          <span
            className={cn(
              "rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-medium flex-shrink-0",
              band.tone,
            )}
            data-testid="hero-health-band"
          >
            {band.label}
          </span>
        )}
      </div>

      {hasScanned && (
        <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${Math.max(0, Math.min(100, walletHealth))}%` }}
          />
        </div>
      )}

      {hasScanned ? (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <HeroStat
              icon={<Coins className="w-3 h-3" />}
              label="Recoverable"
              value={`${formatRentSol(totalRecoverable)}`}
              tone={totalRecoverable > 0 ? "text-accent" : "text-foreground"}
              testId="hero-recoverable-sol"
            />
            <HeroStat
              icon={<AlertTriangle className="w-3 h-3" />}
              label="Needs review"
              value={String(reviewCount)}
              tone={reviewCount > 0 ? "text-amber-400" : "text-foreground"}
              testId="hero-needs-review"
            />
            <HeroStat
              icon={<ShieldCheck className="w-3 h-3" />}
              label="Protected"
              value={
                intelLoading && protectedTokens.length === 0
                  ? "…"
                  : String(protectedTokens.length)
              }
              testId="hero-protected"
            />
          </div>
          <p
            className="text-[11px] text-muted-foreground leading-relaxed"
            data-testid="hero-health-explanation"
          >
            {healthExplanation}
          </p>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Scan your wallet to calculate your health score, find recoverable
            SOL, and surface scam or inflated-value tokens.
          </p>
          <Button
            onClick={onScan}
            disabled={scanning}
            className="w-full sm:w-auto rounded-2xl"
            data-testid="button-scan-wallet"
          >
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning…
              </>
            ) : status === "error" ? (
              "Try scanning again"
            ) : (
              "Scan wallet"
            )}
          </Button>
        </div>
      )}
    </section>
  );
}

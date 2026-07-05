import { useQuery } from "@tanstack/react-query";
import { Activity, Sparkles, Clock, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { formatRentSol, type UseWalletCleaner } from "@/hooks/use-wallet-cleaner";

/** Map a real 0–100 health score to a human label + accent treatment. */
function healthBand(score: number): { label: string; tone: string } {
  if (score >= 90) return { label: "Excellent", tone: "text-accent" };
  if (score >= 75) return { label: "Good", tone: "text-accent" };
  if (score >= 60) return { label: "Fair", tone: "text-foreground" };
  return { label: "Needs cleanup", tone: "text-foreground" };
}

/** A single metric cell. Values fall back to "—" - never a fabricated number. */
function Tile({
  label,
  value,
  sub,
  accent = false,
  soon = false,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  soon?: boolean;
  testId: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card px-3.5 py-3",
        soon && "opacity-70",
      )}
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {soon && (
          <span className="rounded-md bg-muted-foreground/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Soon
          </span>
        )}
      </div>
      <div
        className={cn(
          "font-mono text-sm",
          accent ? "text-accent font-semibold" : "text-foreground",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
      )}
    </div>
  );
}

/** Small grouping label above a metric grid. */
function GroupLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
      <span className="text-accent">{icon}</span>
      {children}
    </div>
  );
}

/**
 * Expanded Wallet Health Dashboard. Surfaces the real 0–100 health score
 * alongside the live scan breakdown and lifetime recovery totals. Every figure
 * comes from real data - the live wallet scan (via the cleaner hook) or the
 * stored recovery history (via the shared react-query cache). Cleanup modules
 * that are not built yet (dust / burn / small-balance) are shown explicitly as
 * "coming soon" and never given a fabricated count.
 */
export function WalletHealthDashboard({
  cleaner,
  wallet,
  variant = "full",
}: {
  cleaner: UseWalletCleaner;
  wallet: string | null;
  /** "detail" omits the score hero (shown in the Section 1 hero) for Advanced. */
  variant?: "full" | "detail";
}) {
  const {
    status,
    accounts,
    totalRecoverable,
    walletHealth,
    healthExplanation,
    tokens,
    dustTokens,
    burnCandidates,
    protectedTokens,
    intelLoading,
  } = cleaner;

  const fakeValueCount = tokens.filter((t) => t.fakeValue).length;

  const hasScanned =
    status === "scanned" ||
    status === "closing" ||
    status === "done" ||
    (status === "error" && accounts.length > 0);

  // Reuses the exact query key the history section uses, so this never triggers
  // a second network request - it reads from the shared cache.
  const { data: history } = useQuery({
    queryKey: ["recovery-history", wallet],
    queryFn: () => api.recovery.history(wallet as string),
    enabled: !!wallet,
  });

  const lifetime = history?.lifetime;
  const band = healthBand(walletHealth);
  const emptyCount = accounts.length;

  return (
    <section
      className="rounded-xl bg-card shadow-card p-4 sm:p-5 space-y-4"
      data-testid="wallet-health-dashboard"
    >
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold">
          {variant === "detail" ? "Wallet metrics" : "Wallet health"}
        </h2>
      </div>

      {/* Health score hero - derived only from the real empty-account count.
          Hidden in "detail" mode because Section 1 already shows the score. */}
      {variant === "full" && (
      <div className="rounded-2xl border border-border bg-secondary/30 px-4 py-4">
        {hasScanned ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Health score
                </div>
                <div className="flex items-baseline gap-1">
                  <span
                    className="font-mono text-3xl font-semibold text-accent"
                    data-testid="health-score-value"
                  >
                    {walletHealth}
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">
                    / 100
                  </span>
                </div>
              </div>
              <span className={cn("text-xs font-medium", band.tone)}>
                {band.label}
              </span>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.max(0, Math.min(100, walletHealth))}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed" data-testid="health-explanation">
              {healthExplanation}
            </p>
          </>
        ) : (
          <div className="text-center py-2 space-y-1">
            <div className="font-mono text-3xl font-semibold text-muted-foreground">
              —
            </div>
            <p className="text-xs text-muted-foreground">
              Scan your wallet to calculate your health score.
            </p>
          </div>
        )}
      </div>
      )}

      {/* Live scan breakdown - real on-chain figures, "—" until a scan runs. */}
      <div className="space-y-2">
        <GroupLabel icon={<Sparkles className="w-3 h-3" />}>
          From your latest scan
        </GroupLabel>
        <div className="grid grid-cols-2 gap-2">
          <Tile
            label="Recoverable SOL"
            value={hasScanned ? `${formatRentSol(totalRecoverable)} SOL` : "—"}
            accent={hasScanned && totalRecoverable > 0}
            testId="health-recoverable-sol"
          />
          <Tile
            label="Empty accounts"
            value={hasScanned ? String(emptyCount) : "—"}
            testId="health-empty-accounts"
          />
          <Tile
            label="Tokens held"
            value={hasScanned ? String(tokens.length) : intelLoading ? "…" : "—"}
            testId="health-tokens-held"
          />
          <Tile
            label="Protected assets"
            value={hasScanned ? String(protectedTokens.length) : "—"}
            testId="health-protected-assets"
          />
        </div>
      </div>

      {/* Cleanup opportunities - real, derived from token intelligence. */}
      <div className="space-y-2">
        <GroupLabel icon={<Clock className="w-3 h-3" />}>
          Cleanup opportunities
        </GroupLabel>
        <div className="grid grid-cols-2 gap-2">
          <Tile
            label="Dust tokens"
            value={hasScanned ? String(dustTokens.length) : "—"}
            testId="health-dust-tokens"
          />
          <Tile
            label="Burn candidates"
            value={hasScanned ? String(burnCandidates.length) : "—"}
            accent={hasScanned && burnCandidates.length > 0}
            testId="health-burn-candidates"
          />
          <Tile
            label="Inflated-value tokens"
            value={hasScanned ? String(fakeValueCount) : "—"}
            sub={hasScanned && fakeValueCount > 0 ? "Shown value can't be sold" : undefined}
            testId="health-fake-value"
          />
        </div>
      </div>

      {/* Lifetime totals - real stored recovery history (shared cache). */}
      <div className="space-y-2">
        <GroupLabel icon={<History className="w-3 h-3" />}>Lifetime</GroupLabel>
        <div className="grid grid-cols-2 gap-2">
          <Tile
            label="Lifetime SOL recovered"
            value={
              lifetime ? `${formatRentSol(lifetime.sol_recovered)} SOL` : "—"
            }
            accent={!!lifetime && lifetime.sol_recovered > 0}
            testId="health-lifetime-sol"
          />
          <Tile
            label="Lifetime accounts closed"
            value={lifetime ? String(lifetime.accounts_closed) : "—"}
            testId="health-lifetime-accounts"
          />
          <Tile
            label="Lifetime tokens burned"
            value={lifetime ? String(lifetime.tokens_burned ?? 0) : "—"}
            testId="health-lifetime-burned"
          />
        </div>
      </div>
    </section>
  );
}

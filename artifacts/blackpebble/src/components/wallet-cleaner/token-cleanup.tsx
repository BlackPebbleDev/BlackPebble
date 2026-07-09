import { useMemo, useState } from "react";
import {
  Coins,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type UseWalletCleaner, formatRentSol } from "@/hooks/use-wallet-cleaner";
import { useTokenMetadata } from "@/hooks/use-token-metadata";
import { TokenCard } from "@/components/wallet-cleaner/token-card";
import { ProtectConfirmDialog } from "@/components/wallet-cleaner/protect-confirm-dialog";
import { formatUsd, type EnrichedToken } from "@/lib/recovery-classify";

/** Sort priority for the unified holdings list - things needing attention first. */
function reviewRank(t: EnrichedToken): number {
  if (t.bucket === "burn") return 0;
  if (t.bucket === "dust") return 1;
  if (t.suggestedAction === "Review") return 2;
  return 3;
}

/** Shared protect/unprotect handler used by every token list. */
function useProtectToggle(cleaner: UseWalletCleaner) {
  const { protectToken, unprotectToken } = cleaner;
  const [pendingUnprotect, setPendingUnprotect] =
    useState<EnrichedToken | null>(null);

  function handleProtectToggle(token: EnrichedToken) {
    if (token.isProtected) {
      // Removing default (verified/valuable) protection needs an extra confirm;
      // user-added protection toggles off immediately.
      if (token.protectedByDefault) {
        setPendingUnprotect(token);
        return;
      }
      unprotectToken(token.asset.mint);
      return;
    }
    protectToken(token.asset.mint);
  }

  function confirmUnprotect() {
    if (pendingUnprotect) unprotectToken(pendingUnprotect.asset.mint);
    setPendingUnprotect(null);
  }

  return { pendingUnprotect, setPendingUnprotect, handleProtectToggle, confirmUnprotect };
}

/**
 * Displayed vs realizable wallet value - the core "is this value real?" signal.
 * Lives inside Advanced Analysis in V2.
 */
export function ValueSummary({ cleaner }: { cleaner: UseWalletCleaner }) {
  const { walletValueUsd, walletRealizableUsd } = cleaner;
  return (
    <div className="grid grid-cols-2 gap-3" data-testid="value-summary">
      <div className="rounded-2xl border border-border bg-secondary/30 px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
          Displayed value
        </div>
        <div
          className="font-mono text-lg text-foreground"
          data-testid="wallet-displayed-value"
        >
          {formatUsd(walletValueUsd)}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-secondary/30 px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
          Realizable value
        </div>
        <div
          className={cn(
            "font-mono text-lg",
            walletRealizableUsd < walletValueUsd * 0.8
              ? "text-warning"
              : "text-accent",
          )}
          data-testid="wallet-realizable-value"
        >
          {formatUsd(walletRealizableUsd)}
        </div>
      </div>
    </div>
  );
}

/**
 * SECTION 3 - Protected Assets. Always visible to build trust: verified or
 * valuable tokens that can never be selected for cleanup. Each token appears
 * here once and is excluded from the Advanced holdings list (no duplicates).
 */
export function ProtectedAssets({ cleaner }: { cleaner: UseWalletCleaner }) {
  const { protectedTokens, intelLoading, burnSelected, toggleBurn } = cleaner;
  const mints = useMemo(
    () => protectedTokens.map((t) => t.asset.mint),
    [protectedTokens],
  );
  const { metaByMint, isLoading: metaLoading } = useTokenMetadata(mints);
  const { pendingUnprotect, setPendingUnprotect, handleProtectToggle, confirmUnprotect } =
    useProtectToggle(cleaner);

  return (
    <section className="space-y-2.5" data-testid="protected-assets">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 text-accent" />
          Protected assets
        </h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          {protectedTokens.length}
        </span>
      </div>
      <div className="rounded-xl bg-card shadow-card overflow-hidden">
        {protectedTokens.length > 0 ? (
          <div className="divide-y divide-border">
            {protectedTokens.map((token) => (
              <TokenCard
                key={token.asset.pubkey}
                token={token}
                meta={metaByMint.get(token.asset.mint)}
                metaLoading={metaLoading}
                selectable={false}
                checked={burnSelected.has(token.asset.pubkey)}
                onToggle={() => toggleBurn(token.asset.pubkey)}
                onProtectToggle={() => handleProtectToggle(token)}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground p-4">
            <Lock className="w-4 h-4" />
            {intelLoading
              ? "Checking which assets to protect…"
              : "No protected tokens yet. Verified or valuable tokens appear here automatically."}
          </div>
        )}
      </div>

      <ProtectConfirmDialog
        token={pendingUnprotect}
        open={pendingUnprotect !== null}
        onOpenChange={(o) => !o && setPendingUnprotect(null)}
        onConfirm={confirmUnprotect}
      />
    </section>
  );
}

/**
 * The single deduped holdings list shown inside Advanced Analysis. Every
 * non-protected token appears exactly once (protected tokens live in their own
 * Section 3), ordered with burn candidates and dust first. Burn selectability
 * is per-token - only confirmed dust/burn rows are selectable, so a valuable
 * "keep" token can never be staged for burning from here.
 */
export function AllTokensAnalysis({
  cleaner,
  onlyJunk = false,
}: {
  cleaner: UseWalletCleaner;
  /** Junk Tokens tab: restrict to burn/dust buckets only. */
  onlyJunk?: boolean;
}) {
  const {
    allTokens,
    burnCandidates,
    intelLoading,
    burnSelected,
    toggleBurn,
    selectAllInBucket,
  } = cleaner;

  const unprotected = useMemo(
    () =>
      allTokens
        .filter((t) => !t.isProtected)
        .filter((t) => !onlyJunk || t.bucket === "burn" || t.bucket === "dust")
        .sort((a, b) => reviewRank(a) - reviewRank(b)),
    [allTokens, onlyJunk],
  );
  const mints = useMemo(
    () => unprotected.map((t) => t.asset.mint),
    [unprotected],
  );
  const { metaByMint, isLoading: metaLoading } = useTokenMetadata(mints);
  const { pendingUnprotect, setPendingUnprotect, handleProtectToggle, confirmUnprotect } =
    useProtectToggle(cleaner);

  const burnable = burnCandidates.length > 0;
  const burnSelectedInList = burnCandidates.filter((t) =>
    burnSelected.has(t.asset.pubkey),
  ).length;
  const allBurnSelected =
    burnable && burnSelectedInList === burnCandidates.length;

  if (unprotected.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground" data-testid="no-tokens">
        {intelLoading
          ? "Analyzing your tokens…"
          : onlyJunk
            ? "No junk tokens detected - nothing here is a burn or dust candidate."
            : "No unprotected tokens - everything you hold is protected."}
      </div>
    );
  }

  return (
    <div data-testid="all-tokens-analysis">
      {burnable && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-secondary/30 border-b border-border">
          <span className="text-[11px] text-muted-foreground">
            {burnSelectedInList} of {burnCandidates.length} burn candidates
            selected
          </span>
          <button
            type="button"
            onClick={() => selectAllInBucket("burn")}
            className="text-xs text-danger hover:text-danger transition-colors"
            data-testid="button-select-all-burn"
          >
            {allBurnSelected ? "Deselect all" : "Select all"}
          </button>
        </div>
      )}
      <div className="divide-y divide-border">
        {unprotected.map((token) => (
          <TokenCard
            key={token.asset.pubkey}
            token={token}
            meta={metaByMint.get(token.asset.mint)}
            metaLoading={metaLoading}
            selectable={token.bucket === "dust" || token.bucket === "burn"}
            checked={burnSelected.has(token.asset.pubkey)}
            onToggle={() => toggleBurn(token.asset.pubkey)}
            onProtectToggle={() => handleProtectToggle(token)}
          />
        ))}
      </div>

      <ProtectConfirmDialog
        token={pendingUnprotect}
        open={pendingUnprotect !== null}
        onOpenChange={(o) => !o && setPendingUnprotect(null)}
        onConfirm={confirmUnprotect}
      />
    </div>
  );
}

/** A compact success banner shown after a burn run completes. */
export function BurnSuccessBanner({ cleaner }: { cleaner: UseWalletCleaner }) {
  const { burnStatus, burnedCount, burnRecoveredSol } = cleaner;
  if (burnStatus !== "done" || burnedCount === 0) return null;
  return (
    <div
      className="rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 flex items-center gap-3"
      data-testid="burn-success-banner"
    >
      <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0" />
      <p className="text-sm text-foreground">
        Burned <span className="font-semibold">{burnedCount}</span>{" "}
        {burnedCount === 1 ? "token" : "tokens"} and reclaimed{" "}
        <span className="font-mono text-accent">
          {formatRentSol(burnRecoveredSol)} SOL
        </span>{" "}
        in rent.
      </p>
    </div>
  );
}

export { Loader2, Coins };

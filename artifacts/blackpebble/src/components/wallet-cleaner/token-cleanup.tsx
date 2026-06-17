import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Coins,
  Sparkles,
  Flame,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type UseWalletCleaner, formatRentSol } from "@/hooks/use-wallet-cleaner";
import { useTokenMetadata } from "@/hooks/use-token-metadata";
import { TokenCard } from "@/components/wallet-cleaner/token-card";
import { BurnPreviewDialog } from "@/components/wallet-cleaner/burn-preview-dialog";
import { ProtectConfirmDialog } from "@/components/wallet-cleaner/protect-confirm-dialog";
import {
  formatUsd,
  type CleanupBucket,
  type EnrichedToken,
} from "@/lib/recovery-classify";

function Section({
  icon,
  title,
  subtitle,
  badge,
  defaultOpen = false,
  testId,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  defaultOpen?: boolean;
  testId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-3xl bg-card shadow-card overflow-hidden" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-secondary/50 transition-colors"
        aria-expanded={open}
        data-testid={`${testId}-toggle`}
      >
        <div className="w-9 h-9 rounded-full bg-accent/12 flex items-center justify-center flex-shrink-0 text-accent">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-muted-foreground leading-snug">
            {subtitle}
          </div>
        </div>
        {badge && (
          <span className="font-mono text-xs text-foreground flex-shrink-0">
            {badge}
          </span>
        )}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </div>
  );
}

export function TokenCleanup({
  cleaner,
  onRequestBurn,
}: {
  cleaner: UseWalletCleaner;
  onRequestBurn: () => void;
}) {
  const {
    tokens,
    allTokens,
    dustTokens,
    burnCandidates,
    protectedTokens,
    walletValueUsd,
    walletRealizableUsd,
    intelLoading,
    burnSelected,
    burnSelectedTokens,
    toggleBurn,
    selectAllInBucket,
    protectToken,
    unprotectToken,
  } = cleaner;

  const mints = useMemo(() => tokens.map((t) => t.asset.mint), [tokens]);
  const { metaByMint, isLoading: metaLoading } = useTokenMetadata(mints);

  // Confirm dialog state for removing default protection.
  const [pendingUnprotect, setPendingUnprotect] = useState<EnrichedToken | null>(
    null,
  );

  // Clicking the protect control toggles protection. Removing protection from a
  // default-protected (verified/valuable) asset requires an extra confirm step;
  // every other transition applies immediately.
  function handleProtectToggle(token: EnrichedToken) {
    if (token.isProtected) {
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

  if (tokens.length === 0) {
    return (
      <div
        className="rounded-3xl bg-card shadow-card p-6 text-center space-y-2"
        data-testid="no-tokens"
      >
        <Coins className="w-7 h-7 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">
          {intelLoading
            ? "Analyzing your tokens…"
            : "No SPL tokens are held in this wallet."}
        </p>
      </div>
    );
  }

  const renderList = (
    list: EnrichedToken[],
    opts: { selectable: boolean; bucket?: CleanupBucket },
  ) => (
    <div className="divide-y divide-border">
      {list.map((token) => (
        <TokenCard
          key={token.asset.pubkey}
          token={token}
          meta={metaByMint.get(token.asset.mint)}
          metaLoading={metaLoading}
          selectable={opts.selectable}
          checked={burnSelected.has(token.asset.pubkey)}
          onToggle={() => toggleBurn(token.asset.pubkey)}
          onProtectToggle={() => handleProtectToggle(token)}
        />
      ))}
    </div>
  );

  // A small select-all / burn-selected footer for a burnable bucket.
  const burnFooter = (bucket: CleanupBucket, list: EnrichedToken[]) => {
    const selectablePubkeys = list
      .filter((t) => !t.isProtected)
      .map((t) => t.asset.pubkey);
    const selectedInBucket = selectablePubkeys.filter((p) =>
      burnSelected.has(p),
    ).length;
    const allSelected =
      selectablePubkeys.length > 0 && selectedInBucket === selectablePubkeys.length;
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-secondary/30">
        <button
          type="button"
          onClick={() => selectAllInBucket(bucket)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid={`button-select-all-${bucket}`}
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
        <span className="text-[11px] text-muted-foreground">
          {selectedInBucket} selected
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-3" data-testid="token-cleanup">
      {/* Wallet value safety summary. */}
      <div className="rounded-2xl border border-border bg-card px-4 py-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
            Displayed value
          </div>
          <div className="font-mono text-lg text-foreground" data-testid="wallet-displayed-value">
            {formatUsd(walletValueUsd)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
            Realizable value
          </div>
          <div
            className={cn(
              "font-mono text-lg",
              walletRealizableUsd < walletValueUsd * 0.8
                ? "text-amber-400"
                : "text-accent",
            )}
            data-testid="wallet-realizable-value"
          >
            {formatUsd(walletRealizableUsd)}
          </div>
        </div>
      </div>

      <Section
        icon={<Coins className="w-4 h-4" />}
        title="All tokens"
        subtitle="Every token this wallet holds, with risk & sellability"
        badge={String(allTokens.length)}
        defaultOpen
        testId="section-all-tokens"
      >
        {renderList(allTokens, { selectable: false })}
      </Section>

      <Section
        icon={<Sparkles className="w-4 h-4" />}
        title="Dust"
        subtitle="Tiny-value leftovers with a real market"
        badge={String(dustTokens.length)}
        testId="section-dust"
      >
        {dustTokens.length > 0 ? (
          <>
            {renderList(dustTokens, { selectable: true, bucket: "dust" })}
            {burnFooter("dust", dustTokens)}
          </>
        ) : (
          <p className="text-sm text-muted-foreground p-4">No dust tokens found.</p>
        )}
      </Section>

      <Section
        icon={<Flame className="w-4 h-4" />}
        title="Burn candidates"
        subtitle="Spam, high-risk or unsellable tokens you may want to destroy"
        badge={String(burnCandidates.length)}
        testId="section-burn-candidates"
      >
        {burnCandidates.length > 0 ? (
          <>
            {renderList(burnCandidates, { selectable: true, bucket: "burn" })}
            {burnFooter("burn", burnCandidates)}
          </>
        ) : (
          <p className="text-sm text-muted-foreground p-4">
            No burn candidates found.
          </p>
        )}
      </Section>

      <Section
        icon={<ShieldCheck className="w-4 h-4" />}
        title="Protected assets"
        subtitle="Verified or valuable — never selectable for cleanup"
        badge={String(protectedTokens.length)}
        testId="section-protected-assets"
      >
        {protectedTokens.length > 0 ? (
          renderList(protectedTokens, { selectable: false })
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
            <Lock className="w-4 h-4" />
            No protected tokens yet.
          </div>
        )}
      </Section>

      {/* Coming-soon advanced cleanup modules — never fabricated counts. */}
      <Section
        icon={<Lock className="w-4 h-4" />}
        title="Advanced cleanup"
        subtitle="More cleanup modules are on the way"
        testId="section-advanced-soon"
      >
        <ul className="space-y-2 p-4">
          {[
            "NFTs & collectibles",
            "Compressed NFTs (cNFT)",
            "LP positions",
            "Advanced recovery",
          ].map((item) => (
            <li
              key={item}
              className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
            >
              <span className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                {item}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-muted-foreground/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
                <Lock className="w-2.5 h-2.5" />
                Soon
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Burn action — only when at least one token is selected. */}
      {burnSelectedTokens.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            <span className="font-mono text-foreground">
              {burnSelectedTokens.length}
            </span>{" "}
            selected ·{" "}
            <span className="font-mono text-accent">
              {formatRentSol(
                burnSelectedTokens.reduce((s, t) => s + t.asset.sol, 0),
              )}{" "}
              SOL
            </span>{" "}
            rent
          </div>
          <Button
            onClick={onRequestBurn}
            className="rounded-2xl bg-red-500 hover:bg-red-600 text-white"
            data-testid="button-open-burn-preview"
          >
            <Flame className="w-4 h-4" />
            Burn selected
          </Button>
        </div>
      )}

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
        Burned{" "}
        <span className="font-semibold">{burnedCount}</span>{" "}
        {burnedCount === 1 ? "token" : "tokens"} and reclaimed{" "}
        <span className="font-mono text-accent">
          {formatRentSol(burnRecoveredSol)} SOL
        </span>{" "}
        in rent.
      </p>
    </div>
  );
}

export { Loader2 };

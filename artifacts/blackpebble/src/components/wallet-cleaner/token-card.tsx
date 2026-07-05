import { useState } from "react";
import { ChevronDown, Lock, LockOpen, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { shortAddr } from "@/lib/format";
import { TokenAvatar } from "@/components/wallet-cleaner/token-avatar";
import {
  RiskBadge,
  SellabilityBadge,
  RiskFactors,
} from "@/components/wallet-cleaner/token-badges";
import {
  formatUsd,
  formatTokenAmount,
  type EnrichedToken,
  type SuggestedAction,
} from "@/lib/recovery-classify";
import type { RecoveryTokenMeta, TokenRiskClass } from "@/lib/api";

const ELEVATED_RISK: readonly TokenRiskClass[] = [
  "suspicious",
  "spam",
  "high_risk",
];

const ACTION_STYLES: Record<SuggestedAction, string> = {
  Keep: "bg-secondary text-muted-foreground",
  Review: "bg-warning/10 text-warning",
  "Burn candidate": "bg-danger/10 text-danger",
  Protected: "bg-accent/12 text-accent",
};

/**
 * One held token in the cleanup suite. Shows real on-chain balance, displayed
 * USD value vs realistically-realizable value (the core of fake-value
 * detection), the risk verdict + structured factors + reasons, sellability, and
 * the user-protect control. Optionally selectable when it sits in a burnable
 * bucket. Purely presentational - never closes, burns, hides or auto-selects.
 */
export function TokenCard({
  token,
  meta,
  metaLoading = false,
  selectable = false,
  checked = false,
  onToggle,
  onProtectToggle,
}: {
  token: EnrichedToken;
  meta?: RecoveryTokenMeta;
  metaLoading?: boolean;
  selectable?: boolean;
  checked?: boolean;
  onToggle?: () => void;
  onProtectToggle?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { asset, intel } = token;

  const symbol = meta?.symbol?.trim() ?? "";
  const name = meta?.name?.trim() ?? "";
  const known = symbol.length > 0;
  const shortMint = shortAddr(asset.mint, 4);
  const pending = metaLoading && !meta;
  const primary = known ? symbol : pending ? shortMint : "Unknown Token";

  const elevated = !!intel && ELEVATED_RISK.includes(intel.risk);
  // Defensive: treat reasons/factors as arrays even if a malformed/stale intel
  // payload omits them, so a missing field can never crash the card.
  const riskReasons = intel?.riskReasons ?? [];
  const riskFactors = intel?.riskFactors ?? [];
  // Reasons surface inline for elevated-risk tokens; "Details" only adds the
  // structured factor pills (and reasons for non-elevated tokens, if any).
  const hasDetails = riskFactors.length > 0;

  return (
    <div
      className={cn(
        "px-4 py-3 transition-colors",
        checked ? "bg-accent/10" : "",
      )}
      data-testid={`token-card-${asset.pubkey}`}
    >
      <div className="flex items-center gap-3">
        {selectable && (
          <Checkbox
            checked={checked}
            onCheckedChange={onToggle}
            className="flex-shrink-0"
            data-testid={`checkbox-token-${asset.pubkey}`}
          />
        )}

        <TokenAvatar logo={meta?.logo} symbol={symbol} size={36} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate max-w-[140px]">
              {primary}
            </span>
            {token.isLikelyNft && (
              <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                NFT / Collectible
              </span>
            )}
            {intel && <RiskBadge risk={intel.risk} />}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {name && name !== symbol && (
              <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                {name}
              </span>
            )}
            <span className="font-mono text-[10px] text-muted-foreground/70">
              {shortMint}
            </span>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="font-mono text-sm text-foreground">
            {formatUsd(token.valueUsd)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {formatTokenAmount(asset.uiAmount)}
          </div>
        </div>
      </div>

      {/* Secondary row: realizable value + sellability + protection state. */}
      <div className="flex items-center justify-between gap-2 mt-2 pl-0 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <SellabilityBadge rating={token.sellability} />
          <span
            className={cn(
              "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              token.fakeValue
                ? "bg-danger/10 text-danger"
                : "bg-secondary text-muted-foreground",
            )}
            data-testid={`realizable-${asset.pubkey}`}
          >
            Realizable {formatUsd(token.realizableUsd)}
          </span>
          {token.fakeValue && (
            <span className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
              <Info className="w-3 h-3" />
              Inflated value
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              ACTION_STYLES[token.suggestedAction],
            )}
            data-testid={`suggested-action-${asset.pubkey}`}
          >
            {token.suggestedAction}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {onProtectToggle && (
            <button
              type="button"
              onClick={onProtectToggle}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                token.isProtected
                  ? "bg-accent/12 text-accent hover:bg-accent/20"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
              data-testid={`button-protect-${asset.pubkey}`}
            >
              {token.isProtected ? (
                <>
                  <Lock className="w-3 h-3" />
                  {token.protectedByDefault ? "Protected" : "Protected"}
                </>
              ) : (
                <>
                  <LockOpen className="w-3 h-3" />
                  Protect
                </>
              )}
            </button>
          )}
          {hasDetails && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={expanded}
              data-testid={`button-token-details-${asset.pubkey}`}
            >
              Details
              <ChevronDown
                className={cn(
                  "w-3 h-3 transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </button>
          )}
        </div>
      </div>

      {/* Always-visible market facts so liquidity + market cap are never hidden. */}
      {intel && intel.hasMarket !== null && (
        <div className="grid grid-cols-3 gap-2 mt-2.5">
          <Stat label="Price" value={formatUsd(intel.priceUsd)} />
          <Stat label="Liquidity" value={formatUsd(intel.liquidityUsd)} />
          <Stat label="Market cap" value={formatUsd(intel.marketCapUsd)} />
        </div>
      )}

      {/* Unresolved tokens (no intel at all, or a market-data outage) that we
          kept for review carry an explicit, honest "can't assess" note so the
          user understands why they aren't flagged for cleanup. */}
      {(!intel || intel.hasMarket === null) &&
        !token.isLikelyNft &&
        token.bucket === "keep" && (
          <div
            className="mt-2 flex items-start gap-1.5 rounded-lg bg-secondary/40 p-2 text-[11px] text-muted-foreground leading-snug"
            data-testid={`analysis-unavailable-${asset.pubkey}`}
          >
            <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
            Analysis unavailable - we couldn't confirm a market or risk for this
            token, so it's kept for your review, never flagged for cleanup.
          </div>
        )}

      {/* Elevated-risk reasons surface inline - never buried behind a toggle. */}
      {elevated && riskReasons.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-lg bg-red-500/[0.06] p-2">
          {riskReasons.map((reason) => (
            <li
              key={reason}
              className="flex items-start gap-1.5 text-[11px] text-danger/90 leading-snug"
            >
              <span className="w-1 h-1 rounded-full bg-red-400/60 flex-shrink-0 mt-1.5" />
              {reason}
            </li>
          ))}
        </ul>
      )}

      {expanded && intel && (
        <div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
          <RiskFactors factors={riskFactors} />
          {!elevated && riskReasons.length > 0 && (
            <ul className="space-y-1">
              {riskReasons.map((reason) => (
                <li
                  key={reason}
                  className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-snug"
                >
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/50 flex-shrink-0 mt-1.5" />
                  {reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-[11px] text-foreground">{value}</div>
    </div>
  );
}

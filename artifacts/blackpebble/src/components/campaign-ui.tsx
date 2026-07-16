/**
 * Shared Community Campaigns UI primitives.
 *
 * ONE source of truth for every campaign surface (browse card, detail page,
 * duplicate-detection panel, activation modal). Edit here and every surface
 * updates together — do not re-implement TokenIdentity / StatusBadge /
 * CreatorRow / TrustBadge / Escrow / TokenContract / Progress elsewhere.
 */
import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { useLocation } from "wouter";
import { Check, Copy, Shield, ShieldCheck } from "lucide-react";
import { ProviderLogo } from "@/components/provider-logo";
import { deriveTokenIdentity, tokenPageHref } from "@/lib/campaign-identity";
import type { CampaignState, CampaignSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

const ACCENT = "bg-accent/15 text-accent";
const SUCCESS = "bg-success/15 text-success";
const WARNING = "bg-warning/15 text-warning";
const DANGER = "bg-danger/15 text-danger";
const MUTED = "bg-white/[0.06] text-muted-foreground";

const STATE_META: Record<CampaignState, { label: string; className: string }> = {
  draft: { label: "Draft", className: MUTED },
  awaiting_initial_contribution: { label: "Awaiting launch", className: WARNING },
  live: { label: "Live", className: ACCENT },
  funded: { label: "Funded", className: SUCCESS },
  awaiting_execution: { label: "Awaiting exec", className: ACCENT },
  executing: { label: "Executing", className: ACCENT },
  completed: { label: "Completed", className: SUCCESS },
  expired: { label: "Expired", className: WARNING },
  execution_failed: { label: "Exec failed", className: DANGER },
  refunding: { label: "Refunding", className: WARNING },
  refunded: { label: "Refunded", className: MUTED },
  frozen: { label: "Frozen", className: DANGER },
  cancelled: { label: "Cancelled", className: MUTED },
  settled: { label: "Completed", className: SUCCESS },
  failed: { label: "Refunding", className: WARNING },
};

/**
 * Compact, single-line lifecycle chip. One sizing system for every state so no
 * status steals width from the token identity or wraps to two lines.
 */
export function StateBadge({ state }: { state: CampaignState }) {
  const meta = STATE_META[state];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-none",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

/** Compact trust chip — lives beside the creator, not floating alone. */
export function TrustBadge({ score }: { score: number }) {
  const tone =
    score >= 70
      ? "text-success bg-success/10"
      : score >= 40
        ? "text-accent bg-accent/10"
        : "text-warning bg-warning/10";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none",
        tone,
      )}
      title="Campaign trust score — creator reputation, campaign history, account age, and campaign completeness"
    >
      <ShieldCheck className="w-3 h-3" />
      Trust {score}
    </span>
  );
}

/**
 * Token-first identity. Identical on browse card and detail page:
 * logo → name → $TICKER · MC $X. Clickable to the in-app token page.
 * No `large` variant — one typography / truncation system everywhere.
 */
export function TokenIdentity({
  c,
  size = 48,
}: {
  c: CampaignSummary;
  size?: number;
}) {
  const { name, ticker, hasToken, hasMeta, isMintFallback, mcLabel } =
    deriveTokenIdentity(c);
  const [, navigate] = useLocation();
  const mint = c.tokenMint;

  const logo = c.imageUrl ? (
    <img
      src={c.imageUrl}
      alt=""
      className="rounded-full object-cover shrink-0 ring-1 ring-white/10"
      style={{ width: size, height: size }}
    />
  ) : (
    <ProviderLogo
      typeKey={c.typeKey}
      size={size}
      className="ring-1 ring-white/10"
    />
  );

  const textBlock = (
    <div className="min-w-0 flex-1">
      <div
        className={cn(
          "font-bold truncate leading-tight text-base transition-colors group-hover:text-accent",
          isMintFallback && "font-mono text-sm",
        )}
      >
        {name}
      </div>
      {hasToken ? (
        <div className="flex items-center gap-1.5 min-w-0 mt-0.5 text-[11px] text-muted-foreground">
          {ticker ? (
            <>
              <span className="font-semibold text-foreground/70 shrink-0">
                {ticker}
              </span>
              <span className="text-muted-foreground/40 shrink-0">·</span>
            </>
          ) : !hasMeta ? (
            <>
              <span className="shrink-0">Metadata unavailable</span>
              <span className="text-muted-foreground/40 shrink-0">·</span>
            </>
          ) : null}
          <span
            className={cn(
              "shrink-0 tabular-nums",
              c.tokenMarketCapUsd == null && "text-muted-foreground/60",
            )}
          >
            {mcLabel}
          </span>
        </div>
      ) : (
        <div className="text-muted-foreground truncate mt-0.5 text-[11px]">
          Community campaign
        </div>
      )}
    </div>
  );

  const href = tokenPageHref(mint);
  if (hasToken && href) {
    const go = (e: MouseEvent | KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      navigate(href);
    };
    return (
      <div
        role="link"
        tabIndex={0}
        aria-label={`View ${name} token page`}
        onClick={go}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") go(e);
        }}
        className="group flex items-center gap-3 min-w-0 flex-1 -m-1 p-1 rounded-lg cursor-pointer transition-colors hover:bg-white/[0.03] active:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {logo}
        {textBlock}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      {logo}
      {textBlock}
    </div>
  );
}

/**
 * Creator row: avatar + @username + trust as one tight information group.
 * Trust sits immediately beside the handle (not pushed to the far right).
 * Links to the BlackPebble profile (`/u/:handle`), never X.
 */
export function CreatorRow({
  creator,
  trustScore,
}: {
  creator: CampaignSummary["creator"];
  trustScore: number;
}) {
  const [, navigate] = useLocation();
  const username = creator.username;
  const profileHref = username ? `/u/${username}` : null;
  const label = username
    ? `@${username}`
    : creator.displayName || "Campaign creator";
  const initials = (username || creator.displayName || "?")
    .replace(/^@/, "")
    .slice(0, 1)
    .toUpperCase();

  const avatar = creator.avatarUrl ? (
    <img
      src={creator.avatarUrl.replace(
        /_normal(\.[a-zA-Z0-9]+)(\?.*)?$/,
        "_200x200$1$2",
      )}
      alt=""
      className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-white/10"
    />
  ) : (
    <div className="w-7 h-7 rounded-full bg-surface-2 border border-white/[0.08] flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
      {initials}
    </div>
  );

  const inner = (
    <>
      {avatar}
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80 leading-none">
          Created by
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
          <span className="text-[12px] font-semibold text-foreground/90 truncate leading-tight group-hover/creator:text-accent transition-colors">
            {label}
          </span>
          <TrustBadge score={trustScore} />
        </div>
      </div>
    </>
  );

  const rowClass =
    "group/creator inline-flex items-center gap-2.5 max-w-full rounded-lg -mx-1 px-1 py-0.5";

  if (profileHref) {
    const go = (e: MouseEvent | KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      navigate(profileHref);
    };
    return (
      <div
        role="link"
        tabIndex={0}
        aria-label={`View ${label} profile`}
        onClick={go}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") go(e);
        }}
        className={cn(
          rowClass,
          "cursor-pointer hover:bg-white/[0.03] active:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        )}
      >
        {inner}
      </div>
    );
  }

  return <div className={rowClass}>{inner}</div>;
}

/**
 * Address row — Token Contract (neutral) or Escrow Wallet (emerald + shield).
 * Prefer the TokenContract / EscrowWallet wrappers so copy stays consistent.
 */
export function AddressRow({
  label,
  address,
  variant,
  tooltip,
  subtitle,
  stopClicks,
}: {
  label: string;
  address: string;
  variant: "token" | "escrow";
  tooltip?: string;
  subtitle?: string;
  stopClicks?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isEscrow = variant === "escrow";
  const copy = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2.5 flex items-start justify-between gap-2 border",
        isEscrow
          ? "bg-emerald-500/[0.10] border-emerald-400/40 ring-1 ring-emerald-400/20 shadow-[0_0_0_1px_rgba(16,185,129,0.06)]"
          : "bg-surface-2 border-white/[0.05]",
      )}
      title={tooltip}
    >
      <div className="min-w-0">
        <div
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1.5 flex-wrap",
            isEscrow ? "text-emerald-300" : "text-muted-foreground",
          )}
        >
          {isEscrow && <Shield className="w-3.5 h-3.5 shrink-0" />}
          {label}
        </div>
        <div
          className={cn(
            "font-mono text-[11px] truncate mt-1",
            isEscrow ? "text-emerald-50" : "text-foreground",
          )}
        >
          {address.slice(0, 10)}…{address.slice(-8)}
        </div>
        {subtitle && (
          <div
            className={cn(
              "text-[10px] font-medium mt-1 leading-snug",
              isEscrow ? "text-emerald-300/90" : "text-muted-foreground/80",
            )}
          >
            {subtitle}
          </div>
        )}
      </div>
      <button
        type="button"
        className={cn(
          "shrink-0 transition-colors mt-0.5",
          isEscrow
            ? "text-emerald-300 hover:text-emerald-200"
            : "text-muted-foreground hover:text-accent",
        )}
        onClick={copy}
        title={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
        data-stop-clicks={stopClicks ? "true" : undefined}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

/** Neutral token-contract card — never send SOL here. */
export function TokenContract({
  address,
  stopClicks,
}: {
  address: string;
  stopClicks?: boolean;
}) {
  return (
    <AddressRow
      label="Token Contract"
      address={address}
      variant="token"
      subtitle="Never send SOL to this address."
      tooltip="The token's contract address — never send funds here."
      stopClicks={stopClicks}
    />
  );
}

/** Emerald escrow destination — the only contribution wallet. */
export function EscrowWallet({
  address,
  stopClicks,
}: {
  address: string;
  stopClicks?: boolean;
}) {
  return (
    <AddressRow
      label="Escrow Wallet"
      address={address}
      variant="escrow"
      subtitle="This is the only wallet that accepts campaign contributions."
      tooltip="Every contribution goes to this dedicated escrow wallet — nowhere else."
      stopClicks={stopClicks}
    />
  );
}

export function ProgressBar({ progress }: { progress: number }) {
  const pct = Math.min(100, Math.round(progress * 100));
  return (
    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          progress >= 1 ? "bg-emerald-400" : "bg-accent",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Campaign title as intentional metadata — user-generated, never auto-rewritten,
 * never competing with the token name. Small label + clearer title.
 */
export function CampaignTitle({ title }: { title: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 leading-none">
        Campaign Title
      </div>
      <div
        className="text-sm font-semibold text-foreground/85 leading-snug line-clamp-2 break-words"
        title={title}
      >
        {title}
      </div>
    </div>
  );
}

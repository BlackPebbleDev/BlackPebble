import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  AlertCircle,
  BadgeCheck,
  Check,
  ChevronLeft,
  CircleCheck,
  Copy,
  Loader2,
  Crown,
  ExternalLink,
  Flame,
  HandCoins,
  Megaphone,
  Plus,
  Radar,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Users,
  Zap,
} from "lucide-react";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { useXAuth } from "@/hooks/use-x-auth";
import { ProviderLogo, providerDisclosure } from "@/components/provider-logo";
import {
  providerForTypeKey,
  serviceBrand,
  type ProviderBrand,
} from "@/lib/provider-branding";
import {
  campaignFormIssues,
  issueForField,
  CAMPAIGN_DEADLINE_OPTIONS,
  type CampaignFormIssue,
  type CampaignField,
} from "@/lib/campaign-form";
import {
  api,
  type CampaignLedgerEntry,
  type CampaignState,
  type CampaignSummary,
  type CampaignTokenValidation,
  type CampaignTypeDef,
} from "@/lib/api";
import { MetricTile } from "@/components/metric-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UtilityPageHeader } from "@/components/utility-page-header";
import { getUtility } from "@/lib/utilities-meta";

const CAMPAIGNS = getUtility("campaigns");
const CAMPAIGNS_SUBTITLE =
  "Escrow-backed community funding with a fully public money trail. Goal not met - automatic refunds, no platform fee. Overfunding goes back to contributors, never kept.";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Community Campaigns - escrow-backed goal campaigns (Phase 1).
 *
 * Every campaign shows a live, public money trail: deposited, remaining, paid
 * out, refunded - every row backed by a tx signature. Overfunding is returned
 * to contributors, and failed campaigns refund automatically (network fee
 * only, no platform fee).
 */

const SOL = LAMPORTS_PER_SOL;

const TYPE_LABELS: Record<string, string> = {
  dex_listing: "DEX Screener Listing",
  dex_boost: "DEX Screener Boost",
  dex_ads: "DEX Screener Ads",
  dex_trending: "DEX Screener Trending Bar",
  dextools_listing: "DEXTools Listing",
  dextools_nitro: "DEXTools Nitro",
  dextools_ads: "DEXTools Ads",
  community_takeover: "Community Takeover",
  // Legacy keys from early campaigns.
  listing: "DEX Listing",
  marketing: "Token Advertising",
  community_event: "Community Event",
  other: "Custom Campaign",
};

/** "Requires custom icon and banner", built from the type's asset list. */
function requirementNote(assets: string[]): string | null {
  if (assets.length === 0) return null;
  const names: Record<string, string> = {
    icon: "custom icon",
    banner: "custom banner",
    title: "title",
    pitch: "pitch",
  };
  const parts = assets.map((a) => names[a] ?? a);
  const text =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Requires ${text}`;
}

/** Inline validation message shown directly under a form field. */
function FieldError({ issue }: { issue?: CampaignFormIssue }) {
  if (!issue) return null;
  return (
    <p
      className="flex items-start gap-1.5 text-[11px] text-danger leading-relaxed"
      role="alert"
    >
      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
      <span>{issue.message}</span>
    </p>
  );
}

const ACCENT = "bg-accent/15 text-accent";
const SUCCESS = "bg-success/15 text-success";
const WARNING = "bg-warning/15 text-warning";
const DANGER = "bg-danger/15 text-danger";
const MUTED = "bg-white/[0.06] text-muted-foreground";

const STATE_META: Record<
  CampaignState,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: MUTED },
  awaiting_initial_contribution: { label: "Awaiting launch", className: WARNING },
  live: { label: "Live", className: ACCENT },
  funded: { label: "Funded", className: SUCCESS },
  awaiting_execution: { label: "Queued", className: ACCENT },
  executing: { label: "Executing", className: ACCENT },
  completed: { label: "Completed", className: SUCCESS },
  expired: { label: "Expired", className: WARNING },
  execution_failed: { label: "Execution failed", className: DANGER },
  refunding: { label: "Refunding", className: WARNING },
  refunded: { label: "Refunded", className: MUTED },
  frozen: { label: "Frozen", className: DANGER },
  cancelled: { label: "Cancelled", className: MUTED },
  // Legacy Phase 1 rows.
  settled: { label: "Completed", className: SUCCESS },
  failed: { label: "Refunding", className: WARNING },
};

const EXECUTION_MODE_LABEL: Record<string, string> = {
  automatic: "Automatic provider integration",
  operator_fulfilled: "BlackPebble operator fulfillment",
  external_provider: "External provider",
};

function fmtSol(lamports: number): string {
  const sol = lamports / SOL;
  return sol.toLocaleString("en-US", {
    minimumFractionDigits: sol >= 100 ? 0 : 2,
    maximumFractionDigits: sol >= 100 ? 1 : 3,
  });
}

function fmtUsd(usd: number): string {
  return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Compact market-cap style, e.g. $2.3M / $48.2K / $1.2B. */
function fmtCompactUsd(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(usd >= 1e10 ? 0 : 1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(usd >= 1e7 ? 0 : 1)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(usd >= 1e4 ? 0 : 1)}K`;
  return `$${Math.round(usd)}`;
}

function timeLeft(deadlineAt: number): string {
  const s = deadlineAt - Math.floor(Date.now() / 1000);
  if (s <= 0) return "Ended";
  if (s < 3600) return `${Math.ceil(s / 60)}m left`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m left`;
  return `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h left`;
}

function StateBadge({ state }: { state: CampaignState }) {
  const meta = STATE_META[state];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

function TrustBadge({ score }: { score: number }) {
  const tone =
    score >= 70
      ? "text-success bg-success/10"
      : score >= 40
        ? "text-accent bg-accent/10"
        : "text-warning bg-warning/10";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        tone,
      )}
      title="Campaign trust score - creator reputation, campaign history, account age, and campaign completeness"
    >
      <ShieldCheck className="w-3 h-3" />
      Trust {score}
    </span>
  );
}

type ActivateStage =
  | "idle"
  | "preparing"
  | "signing"
  | "confirming"
  | "activating"
  | "timeout";

const ACTIVATE_STEPS: { key: ActivateStage; label: string; hint?: string }[] = [
  { key: "preparing", label: "Preparing transaction" },
  { key: "signing", label: "Waiting for your wallet signature" },
  {
    key: "confirming",
    label: "Confirming on the blockchain",
    hint: "This normally takes 5–20 seconds.",
  },
  { key: "activating", label: "Finalizing your campaign" },
];

/**
 * Token-first identity block used on both the browse card and the detail
 * header. Hierarchy: logo → token name → ticker · market cap. Market cap space
 * is reserved now (enrichment deferred) so a future value drops in without any
 * layout change. Non-token (community) campaigns fall back to the title.
 */
function TokenIdentity({
  c,
  size = 48,
  large = false,
}: {
  c: CampaignSummary;
  size?: number;
  large?: boolean;
}) {
  const hasToken = !!c.tokenMint;
  const name = c.tokenName
    ? c.tokenName
    : c.tokenSymbol
      ? `$${c.tokenSymbol}`
      : hasToken
        ? "Token campaign"
        : c.title;
  const ticker = c.tokenSymbol ? `$${c.tokenSymbol}` : null;
  const mc = c.tokenMarketCapUsd;
  return (
    <div className="flex items-center gap-3 min-w-0">
      {c.imageUrl ? (
        <img
          src={c.imageUrl}
          alt=""
          className={cn(
            "rounded-full object-cover shrink-0 ring-1 ring-white/10",
            large ? "w-14 h-14" : "w-12 h-12",
          )}
          style={{ width: size, height: size }}
        />
      ) : (
        <ProviderLogo typeKey={c.typeKey} size={size} className="ring-1 ring-white/10" />
      )}
      <div className="min-w-0">
        <div
          className={cn(
            "font-bold truncate leading-tight",
            large ? "text-2xl md:text-3xl tracking-tight" : "text-base",
          )}
        >
          {name}
        </div>
        {hasToken ? (
          <div
            className={cn(
              "flex items-center gap-1.5 min-w-0 mt-0.5 text-muted-foreground",
              large ? "text-xs" : "text-[11px]",
            )}
          >
            {ticker && (
              <span className="font-semibold text-foreground/70 truncate">
                {ticker}
              </span>
            )}
            {ticker && <span className="text-muted-foreground/40">·</span>}
            <span
              className={cn(
                "truncate tabular-nums",
                mc == null && "text-muted-foreground/60",
              )}
              title={mc == null ? "Live market cap coming soon" : undefined}
            >
              {mc != null ? `${fmtCompactUsd(mc)} MC` : "Market cap —"}
            </span>
          </div>
        ) : (
          <div
            className={cn(
              "text-muted-foreground truncate mt-0.5",
              large ? "text-xs" : "text-[11px]",
            )}
          >
            Community campaign
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Address row used to visually separate the token contract from the escrow
 * wallet. The escrow variant is shield-marked and accented so contributors
 * never confuse where to send funds. `stopClicks` prevents the copy button
 * from triggering a parent <Link> navigation on the browse card.
 */
function AddressRow({
  label,
  address,
  variant,
  tooltip,
  sublabel,
  stopClicks,
}: {
  label: string;
  address: string;
  variant: "token" | "escrow";
  tooltip?: string;
  sublabel?: string;
  stopClicks?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isEscrow = variant === "escrow";
  const copy = (e: ReactMouseEvent) => {
    if (stopClicks) {
      e.preventDefault();
      e.stopPropagation();
    }
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2 flex items-center justify-between gap-2 border",
        isEscrow
          ? "bg-emerald-500/[0.07] border-emerald-400/25"
          : "bg-surface-2 border-white/[0.05]",
      )}
      title={tooltip}
    >
      <div className="min-w-0">
        <div
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1",
            isEscrow ? "text-emerald-300" : "text-muted-foreground",
          )}
        >
          {isEscrow && <Shield className="w-3 h-3" />}
          {label}
        </div>
        <div className="font-mono text-[11px] truncate mt-0.5">
          {address.slice(0, 10)}…{address.slice(-8)}
        </div>
        {sublabel && (
          <div
            className={cn(
              "text-[10px] font-medium mt-0.5 flex items-center gap-1",
              isEscrow ? "text-emerald-300/80" : "text-muted-foreground/70",
            )}
          >
            {isEscrow && <Shield className="w-2.5 h-2.5" />}
            {sublabel}
          </div>
        )}
      </div>
      <button
        type="button"
        className={cn(
          "shrink-0 transition-colors",
          isEscrow
            ? "text-emerald-300 hover:text-emerald-200"
            : "text-muted-foreground hover:text-accent",
        )}
        onClick={copy}
        title={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function ProgressBar({ progress }: { progress: number }) {
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

// ── Campaign card (browse grid) ──────────────────────────────────────────────

function CampaignCard({ c }: { c: CampaignSummary }) {
  const pct = Math.min(100, Math.round(c.accounting.progress * 100));
  const brand = providerForTypeKey(c.typeKey);
  const service = serviceBrand(c.typeKey);
  const ServiceIcon = service.icon;
  const neededUsd =
    c.goalUsd != null
      ? Math.max(0, c.goalUsd * (1 - Math.min(1, c.accounting.progress)))
      : null;
  const raisedUsd =
    c.goalUsd != null
      ? c.goalUsd * Math.min(1, c.accounting.progress)
      : null;
  return (
    <Link
      href={`/campaigns/${c.publicId}`}
      className="group card-interactive relative overflow-hidden rounded-2xl bg-card shadow-card flex flex-col"
      data-testid={`card-campaign-${c.publicId}`}
    >
      {/* Soft accent wash behind the header for depth */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-accent/[0.07] to-transparent" />

      <div className="relative p-5 pb-5 flex flex-col gap-3.5 flex-1">
        {/* Token identity leads — users fund a TOKEN, not a form title. */}
        <div className="flex items-start justify-between gap-2">
          <TokenIdentity c={c} size={48} />
          <StateBadge state={c.state} />
        </div>

        {/* Provider-branded service + tier (secondary) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-1 text-[11px] font-semibold",
              brand.accentBg,
              brand.accentText,
            )}
          >
            <ServiceIcon className="w-3 h-3" />
            {brand.name} {service.short}
          </span>
          {c.goalLabel && (
            <span className="inline-flex items-center rounded-full bg-surface-2 border border-white/[0.06] px-2.5 py-1 text-[11px] font-semibold">
              {c.goalLabel}
            </span>
          )}
          {c.state === "live" && (
            <span className="inline-flex items-center rounded-full bg-warning/10 text-warning px-2.5 py-1 text-[11px] font-semibold">
              {timeLeft(c.deadlineAt)}
            </span>
          )}
        </div>

        {/* Campaign title + creator — tertiary supporting line */}
        <div className="text-[13px] text-muted-foreground/90 truncate">
          {c.title}
          {c.creator.username ? ` · @${c.creator.username}` : ""}
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Progress
            </span>
            {neededUsd != null && c.state === "live" && (
              <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
                {fmtUsd(neededUsd)} needed
              </span>
            )}
          </div>
          <ProgressBar progress={c.accounting.progress} />
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold tabular-nums">
              {raisedUsd != null
                ? fmtUsd(raisedUsd)
                : `${fmtSol(c.accounting.depositedLamports)} SOL`}
              <span className="text-xs text-muted-foreground font-medium">
                {" "}of{" "}
                {c.goalUsd != null
                  ? fmtUsd(c.goalUsd)
                  : `${fmtSol(c.goalLamports)} SOL`}
              </span>
            </span>
            <span
              className={cn(
                "text-xs font-bold tabular-nums",
                pct >= 100 ? "text-success" : "text-accent",
              )}
            >
              {pct}% funded
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 border border-white/[0.05] px-3 py-2">
            <div className="flex items-center justify-center gap-1 text-sm font-bold tabular-nums">
              <Users className="w-3.5 h-3.5 text-accent" />
              {c.accounting.contributorCount}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Contributor{c.accounting.contributorCount === 1 ? "" : "s"}
            </div>
          </div>
          <div className="rounded-xl bg-surface-2 border border-white/[0.05] px-3 py-2">
            <div className="text-sm font-bold tabular-nums">
              {fmtSol(c.accounting.depositedLamports)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              SOL Raised
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {c.tokenMint && (
            <AddressRow
              label="Token Contract"
              address={c.tokenMint}
              variant="token"
              tooltip="The token's contract address — do not send funds here."
              stopClicks
            />
          )}
          <AddressRow
            label="Escrow Wallet"
            address={c.escrowAddress}
            variant="escrow"
            sublabel="Funding Wallet"
            tooltip="This is the only wallet used for campaign funding."
            stopClicks
          />
        </div>

        <div className="mt-auto space-y-2.5">
          <div className="flex items-center justify-between">
            <TrustBadge score={c.trustScore} />
          </div>
          <div
            className={cn(
              "rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition-colors",
              c.state === "live"
                ? "bg-accent text-accent-foreground group-hover:bg-accent/90"
                : "bg-surface-2 text-muted-foreground border border-white/[0.05]",
            )}
          >
            {c.state === "live" ? "Fund This Campaign" : "View Campaign"}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Create campaign flow ─────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, typeof Megaphone> = {
  dex_listing: BadgeCheck,
  dex_boost: Flame,
  dex_ads: Megaphone,
  dex_trending: Radar,
  dextools_listing: BadgeCheck,
  dextools_nitro: Zap,
  dextools_ads: Megaphone,
  community_takeover: Crown,
  // Legacy keys.
  listing: Radar,
  marketing: Megaphone,
};

function goalChip(def: CampaignTypeDef): string {
  const opts = def.goalOptions;
  if (!opts || opts.length === 0) return "";
  if (opts.length === 1) return fmtUsd(opts[0].usd);
  return `${fmtUsd(opts[0].usd)} – ${fmtUsd(opts[opts.length - 1].usd)}`;
}

const SAFETY_META: Record<
  CampaignTokenValidation["safety"],
  { label: string; className: string }
> = {
  ok: { label: "Safe", className: "bg-success/15 text-success" },
  warning: { label: "Warning", className: "bg-warning/15 text-warning" },
  danger: { label: "Dangerous", className: "bg-danger/15 text-danger" },
  unknown: {
    label: "Scan unavailable",
    className: "bg-white/[0.06] text-muted-foreground",
  },
};

const DEADLINE_OPTIONS = [12, 24, 48, 72];
const OPENING_MIN_SOL = 0.05;

function CreateCampaignDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"type" | "details" | "review" | "activate">(
    "type",
  );
  const [typeKey, setTypeKey] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [goalUsd, setGoalUsd] = useState<number | null>(null);
  const [durationHours, setDurationHours] = useState("24");
  const [linkUrl, setLinkUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [mintInput, setMintInput] = useState("");
  const [token, setToken] = useState<CampaignTokenValidation | null>(null);
  const [showRisks, setShowRisks] = useState(false);
  // Activation (opening contribution) step.
  const [created, setCreated] = useState<CampaignSummary | null>(null);
  const [openingSig, setOpeningSig] = useState("");
  const [openingSol, setOpeningSol] = useState("");
  const [ackRefund, setAckRefund] = useState(false);
  const [ackGoalLock, setAckGoalLock] = useState(false);
  const [sending, setSending] = useState(false);
  // Activation progress stages (Part 8) — clear step-by-step feedback + a
  // recovery path if confirmation times out (never re-send funds).
  const [activateStage, setActivateStage] = useState<ActivateStage>("idle");
  // Duplicate campaign detection (Part 5): if an active campaign already exists
  // for this token + service the user must explicitly choose to create anyway.
  const [dupAcknowledged, setDupAcknowledged] = useState(false);
  // Only reveal validation messaging after the user tries to advance, so the
  // form doesn't shout errors before they've had a chance to fill it in.
  const [showValidation, setShowValidation] = useState(false);
  const fieldRefs = useRef<Partial<Record<CampaignField, HTMLDivElement | null>>>(
    {},
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { loggedIn } = useXAuth();

  const { data: config } = useQuery({
    queryKey: ["campaigns-config"],
    queryFn: () => api.campaigns.config(),
    enabled: open,
    staleTime: 60_000,
  });
  const dupMint = token?.valid ? token.mint : null;
  const { data: dupData } = useQuery({
    queryKey: ["campaign-dup", dupMint, typeKey],
    queryFn: () => api.campaigns.activeFor(dupMint!, typeKey!),
    enabled: open && !!dupMint && !!typeKey,
    staleTime: 30_000,
  });
  const duplicate = dupData?.campaign ?? null;

  const types = config?.types ?? [];
  const solPrice = config?.solPriceUsd ?? 0;
  const feeBps = config?.feeBps ?? 0;
  const selectedType = types.find((t) => t.key === typeKey) ?? null;
  const selectedTier =
    selectedType?.goalOptions.find((o) => o.usd === goalUsd) ?? null;

  const usdToSol = (usd: number) => (solPrice > 0 ? usd / solPrice : null);

  function reset() {
    setStep("type");
    setTypeKey(null);
    setTitle("");
    setBrief("");
    setGoalUsd(null);
    setDurationHours("24");
    setLinkUrl("");
    setBannerUrl("");
    setMintInput("");
    setToken(null);
    setShowRisks(false);
    setCreated(null);
    setOpeningSig("");
    setOpeningSol("");
    setAckRefund(false);
    setAckGoalLock(false);
    setSending(false);
    setShowValidation(false);
    setActivateStage("idle");
    setDupAcknowledged(false);
  }

  function pickType(def: CampaignTypeDef) {
    setTypeKey(def.key);
    // Single-tier types lock the goal immediately; multi-tier starts unselected.
    setGoalUsd(def.goalOptions.length === 1 ? def.goalOptions[0].usd : null);
    setToken(null);
    setMintInput("");
    setBannerUrl("");
    setStep("details");
  }

  const validate = useMutation({
    mutationFn: () => api.campaigns.validateToken(mintInput.trim()),
    onSuccess: (res) => {
      setToken(res.token);
      setShowRisks(false);
      if (res.token.safety === "danger") {
        toast({
          title: "Token failed the safety scan",
          description:
            "Dangerous tokens are blocked from campaigns to protect contributors.",
          variant: "destructive",
        });
      } else if (!res.token.valid) {
        toast({
          title: "Token not recognized",
          description: "Check the contract address and try again.",
          variant: "destructive",
        });
      }
    },
    onError: (e: Error) =>
      toast({
        title: "Validation failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  const create = useMutation({
    mutationFn: () =>
      api.campaigns.create({
        typeKey: typeKey!,
        title,
        brief,
        goalUsd,
        goalSol: null,
        durationHours: Number(durationHours),
        tokenMint: token?.valid ? token.mint : null,
        bannerUrl: bannerUrl.trim() || null,
        linkUrl: linkUrl.trim() || null,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      // The campaign is created but NOT public yet. It stays in
      // awaiting_initial_contribution until the creator sends and we verify the
      // opening contribution, so move to the activation step instead of leaving.
      setCreated(res.campaign);
      const minSol = res.campaign.openingMinLamports / LAMPORTS_PER_SOL;
      setOpeningSol(String(Number(minSol.toFixed(4))));
      setStep("activate");
      toast({
        title: "Campaign created",
        description: "Send your opening contribution to launch it publicly.",
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Could not create campaign",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  // Creator opening contribution: sign a real SOL transfer to the dedicated
  // escrow, then submit the signature for on-chain verification. The campaign
  // only becomes public after the backend verifies sender, destination, and
  // amount and transitions it to live.
  const activate = useMutation({
    mutationFn: async () => {
      if (!created) throw new Error("Campaign not created yet");
      if (!publicKey) throw new Error("Connect your wallet to launch");
      const amount = Number(openingSol);
      const minSol = created.openingMinLamports / LAMPORTS_PER_SOL;
      const maxSol = created.openingMaxLamports / LAMPORTS_PER_SOL;
      if (!Number.isFinite(amount) || amount < minSol) {
        throw new Error(`Minimum opening contribution is ${minSol} SOL`);
      }
      if (created.openingMaxLamports > 0 && amount > maxSol) {
        throw new Error(`Maximum opening contribution is ${maxSol} SOL`);
      }
      let signature = openingSig.trim();
      // Reuse an already-sent signature on retry; only sign a new transfer once.
      if (!signature) {
        // Build with an explicit fee payer + recent blockhash so Phantom can
        // simulate a clean, previewable SOL transfer (Part 7) and so we can
        // confirm against the blockhash window rather than a bare signature.
        setActivateStage("preparing");
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("finalized");
        const tx = new Transaction({
          feePayer: publicKey,
          blockhash,
          lastValidBlockHeight,
        }).add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(created.escrowAddress),
            lamports: Math.round(amount * LAMPORTS_PER_SOL),
          }),
        );
        setActivateStage("signing");
        signature = await sendTransaction(tx, connection);
        // Persist immediately so a timeout never asks the user to re-send.
        setOpeningSig(signature);
        setActivateStage("confirming");
        try {
          await connection.confirmTransaction(
            { signature, blockhash, lastValidBlockHeight },
            "confirmed",
          );
        } catch {
          // Confirmation window elapsed — the transfer may still land. Do NOT
          // resend. Surface a recovery path that verifies on-chain instead.
          setActivateStage("timeout");
          throw new Error(
            "Your transaction may still confirm. Use Verify on-chain to finish activation without re-sending funds.",
          );
        }
      }
      setActivateStage("activating");
      return api.campaigns.activate(created.publicId, {
        senderWallet: publicKey.toBase58(),
        txSignature: signature,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      const id = res.campaign.publicId;
      setActivateStage("idle");
      setOpen(false);
      reset();
      toast({
        title: "Campaign activated",
        description: "Your campaign is now live and publicly discoverable.",
      });
      navigate(`/campaigns/${id}`);
    },
    onError: (e: Error) => {
      // Keep the timeout stage (recovery UI) visible; otherwise reset to idle.
      setActivateStage((s) => (s === "timeout" ? "timeout" : "idle"));
      toast({
        title: "Activation failed",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const needsBanner = selectedType?.requiredAssets.includes("banner") ?? false;
  const brand: ProviderBrand | null = selectedType
    ? providerForTypeKey(selectedType.key)
    : null;
  const selectedSol =
    goalUsd != null ? usdToSol(goalUsd) : null;
  // Single source of truth for "can this be reviewed/created?" — mirrors the
  // backend POST /campaigns contract exactly (see lib/campaign-form.ts).
  const issues = campaignFormIssues({
    hasType: !!selectedType,
    requiresToken: selectedType?.requiresToken ?? false,
    requiresBanner: needsBanner,
    tierRequired: (selectedType?.goalOptions.length ?? 0) > 1,
    goalSelected: goalUsd != null,
    tokenValidated: token != null,
    tokenValid: token?.valid ?? false,
    tokenSafety: token?.safety ?? null,
    bannerUrl,
    title,
    brief,
    durationHours: Number(durationHours),
    loggedIn,
  });
  const canSubmit = issues.length === 0;
  // Config still loading is the only reason the Review button is disabled up
  // front; every other problem is surfaced as an explained validation issue.
  const configLoading = !config;
  const shownIssue = (field: CampaignField) =>
    showValidation ? issueForField(issues, field) : undefined;

  function handleReview() {
    if (issues.length > 0) {
      setShowValidation(true);
      const first = issues[0].field;
      const el = fieldRefs.current[first];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const input = el.querySelector<HTMLElement>("input, textarea, button");
        input?.focus({ preventScroll: true });
      }
      return;
    }
    setShowValidation(false);
    setStep("review");
  }

  const groups = useMemo(() => {
    const out: { group: string; defs: CampaignTypeDef[] }[] = [];
    for (const def of types) {
      const existing = out.find((g) => g.group === def.group);
      if (existing) existing.defs.push(def);
      else out.push({ group: def.group, defs: [def] });
    }
    return out;
  }, [types]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button data-testid="button-create-campaign">
          <Plus className="w-4 h-4 mr-1.5" />
          Start a Campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto overflow-x-hidden no-scrollbar">
        {step === "type" ? (
          <>
            <DialogHeader>
              <DialogTitle>Choose Campaign Type</DialogTitle>
              <DialogDescription>
                Every goal is priced to the real cost of the service.
                Escrow-backed with automatic refunds if the goal isn't met.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              {groups.map(({ group, defs }) => (
                <div key={group} className="space-y-2">
                  <div className="stat-label">{group}</div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {defs.map((def) => {
                      const Icon = TYPE_ICONS[def.key] ?? Megaphone;
                      const note = requirementNote(def.requiredAssets);
                      const b = providerForTypeKey(def.key);
                      return (
                        <button
                          key={def.key}
                          type="button"
                          onClick={() => pickType(def)}
                          className="text-left rounded-xl bg-surface-2 border border-white/[0.05] hover:border-white/[0.18] hover:bg-surface-2/80 transition-colors p-4 flex flex-col gap-2 group"
                          data-testid={`type-${def.key}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <ProviderLogo
                                typeKey={def.key}
                                fallbackIcon={Icon}
                                size={32}
                              />
                              <span className="font-bold text-sm leading-snug min-w-0 truncate">
                                {def.label}
                              </span>
                            </div>
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold shrink-0",
                                b.accentBg,
                                b.accentText,
                              )}
                            >
                              {goalChip(def)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                            {def.description}
                          </p>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-muted-foreground/70">
                              {def.goalOptions.length}{" "}
                              {def.goalOptions.length === 1 ? "tier" : "tiers"}
                            </span>
                            {note && (
                              <span className="text-[10px] font-semibold text-warning/80">
                                {note}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {types.length === 0 && (
                <div className="rounded-xl bg-surface-2 h-24 animate-pulse" />
              )}
            </div>
          </>
        ) : step === "details" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setStep("type")}
                  className="text-muted-foreground hover:text-accent transition-colors shrink-0"
                  aria-label="Back to services"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {selectedType && (
                  <ProviderLogo
                    typeKey={selectedType.key}
                    fallbackIcon={TYPE_ICONS[selectedType.key] ?? Megaphone}
                    size={24}
                  />
                )}
                <span className="min-w-0 truncate">{selectedType?.label}</span>
              </DialogTitle>
              <DialogDescription>{selectedType?.description}</DialogDescription>
            </DialogHeader>

            {selectedType && (
              <div className="flex items-start gap-1.5 text-[10.5px] text-muted-foreground/80 leading-relaxed -mt-1">
                <Shield className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground/60" />
                <span>{providerDisclosure(selectedType.key)}</span>
              </div>
            )}

            <div className="space-y-3">
              {selectedType?.requiresToken && (
                <div
                  ref={(el) => {
                    fieldRefs.current.token = el;
                  }}
                  className="rounded-xl bg-surface-2 border border-white/[0.05] p-3.5 space-y-2.5"
                >
                  <div className="stat-label">Token</div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Token contract address"
                      value={mintInput}
                      onChange={(e) => {
                        setMintInput(e.target.value);
                        setToken(null);
                      }}
                      className="font-mono text-xs"
                      data-testid="input-token-mint"
                    />
                    <Button
                      variant="outline"
                      onClick={() => validate.mutate()}
                      disabled={validate.isPending || mintInput.trim().length < 32}
                      data-testid="button-validate-token"
                    >
                      {validate.isPending ? "Checking…" : "Validate"}
                    </Button>
                  </div>

                  {token && (
                    <div className="rounded-lg bg-background/40 p-3 space-y-2">
                      <div className="flex items-center gap-2.5">
                        {token.logo ? (
                          <img
                            src={token.logo}
                            alt=""
                            className="w-9 h-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-accent/12" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-sm truncate">
                            {token.name ?? "Unknown token"}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {token.symbol ?? "—"}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold shrink-0",
                            SAFETY_META[token.safety].className,
                          )}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          {SAFETY_META[token.safety].label}
                        </span>
                      </div>
                      {token.risks.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setShowRisks((v) => !v)}
                            className="text-[11px] text-muted-foreground hover:text-accent transition-colors"
                          >
                            {showRisks ? "▾" : "▸"} View safety analysis (
                            {token.risks.length})
                          </button>
                          {showRisks && (
                            <ul className="space-y-1">
                              {token.risks.map((r, i) => (
                                <li
                                  key={i}
                                  className="text-[11px] leading-relaxed"
                                >
                                  <span
                                    className={cn(
                                      "font-semibold",
                                      r.level === "danger"
                                        ? "text-danger"
                                        : r.level === "warn"
                                          ? "text-warning"
                                          : "text-muted-foreground",
                                    )}
                                  >
                                    {r.name}
                                  </span>
                                  {r.description && (
                                    <span className="text-muted-foreground">
                                      {" "}
                                      - {r.description}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <FieldError issue={shownIssue("token")} />
                </div>
              )}

              <div
                ref={(el) => {
                  fieldRefs.current.tier = el;
                }}
                className="rounded-xl bg-surface-2 border border-white/[0.05] p-3.5 space-y-2.5"
              >
                <div className="stat-label">
                  {selectedType && selectedType.goalOptions.length > 1
                    ? "Select tier"
                    : "Funding goal"}
                </div>
                {selectedType &&
                  (selectedType.goalOptions.length === 1 ? (
                    <div className="rounded-xl bg-background/40 border border-accent/25 px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold">
                          {selectedType.goalOptions[0].label}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          {selectedType.goalOptions[0].description}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold tabular-nums">
                          {fmtUsd(selectedType.goalOptions[0].usd)}
                        </div>
                        {usdToSol(selectedType.goalOptions[0].usd) != null && (
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            ≈{" "}
                            {usdToSol(
                              selectedType.goalOptions[0].usd,
                            )!.toFixed(3)}{" "}
                            SOL
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedType.goalOptions.map((opt) => {
                        const active = goalUsd === opt.usd;
                        const ServiceIcon = serviceBrand(selectedType.key).icon;
                        return (
                          <button
                            key={opt.usd}
                            type="button"
                            onClick={() => setGoalUsd(opt.usd)}
                            aria-pressed={active}
                            className={cn(
                              "rounded-xl px-3 py-3 text-left transition-all border min-h-[92px] flex flex-col justify-between gap-1.5",
                              active
                                ? cn(
                                    "bg-background/60",
                                    brand?.accentBorder,
                                    brand?.accentGlow,
                                  )
                                : "bg-background/40 border-white/[0.05] hover:border-white/[0.18] active:scale-[0.99]",
                            )}
                            data-testid={`tier-${opt.usd}`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <ServiceIcon
                                className={cn(
                                  "w-4 h-4 shrink-0",
                                  active ? brand?.accentText : "text-muted-foreground",
                                )}
                              />
                              <span
                                className={cn(
                                  "text-sm font-bold truncate",
                                  active && brand?.accentText,
                                )}
                              >
                                {opt.label}
                              </span>
                            </div>
                            <div>
                              <div className="text-base font-bold tabular-nums leading-none">
                                {fmtUsd(opt.usd)}
                              </div>
                              <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                                {usdToSol(opt.usd) != null
                                  ? `≈ ${usdToSol(opt.usd)!.toFixed(2)} SOL`
                                  : "goal locks at launch"}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}

                {/* Live selection summary — updates instantly, no scrolling. */}
                {selectedType && selectedType.goalOptions.length > 1 && (
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-xs transition-colors",
                      goalUsd != null
                        ? cn(brand?.accentBg, "text-foreground")
                        : "bg-background/40 text-muted-foreground",
                    )}
                  >
                    {goalUsd != null ? (
                      <>
                        <span className="font-semibold truncate">
                          {selectedType.goalOptions.find((o) => o.usd === goalUsd)?.label}
                        </span>
                        <span className="tabular-nums shrink-0 font-bold">
                          {fmtUsd(goalUsd)}
                          {selectedSol != null && (
                            <span className="text-muted-foreground font-medium">
                              {" "}≈ {selectedSol.toFixed(2)} SOL
                            </span>
                          )}
                        </span>
                      </>
                    ) : (
                      <span>Select a tier to see the goal in SOL.</span>
                    )}
                  </div>
                )}
                {typeKey === "dex_listing" && (
                  <p className="text-[11px] text-accent/90 leading-relaxed">
                    Bundle tiers fund the listing and boost together so
                    supporters do not need to start two separate campaigns.
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Priced to the real service cost plus processing, converted to
                  SOL at the live price when the campaign launches. Funded
                  campaigns are fulfilled by BlackPebble; contributors are
                  refunded automatically if the goal isn't reached.
                </p>
                <FieldError issue={shownIssue("tier")} />
              </div>

              {needsBanner && (
                <div
                  ref={(el) => {
                    fieldRefs.current.banner = el;
                  }}
                  className="rounded-xl bg-surface-2 border border-white/[0.05] p-3.5 space-y-2"
                >
                  <div className="stat-label">Custom banner</div>
                  <Input
                    placeholder="Banner image URL (3:1 ratio, 1500x500px recommended)"
                    value={bannerUrl}
                    onChange={(e) => setBannerUrl(e.target.value)}
                    data-testid="input-campaign-banner"
                  />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {requirementNote(selectedType?.requiredAssets ?? [])}. The
                    icon is taken from your validated token automatically; the
                    banner is used when BlackPebble fulfills the purchase.
                  </p>
                  <FieldError issue={shownIssue("banner")} />
                </div>
              )}

              <div
                ref={(el) => {
                  fieldRefs.current.title = el;
                }}
                className="space-y-1"
              >
                <Input
                  placeholder="Campaign title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  data-testid="input-campaign-title"
                />
                <FieldError issue={shownIssue("title")} />
              </div>
              <div
                ref={(el) => {
                  fieldRefs.current.brief = el;
                }}
                className="space-y-1"
              >
                <Textarea
                  placeholder="What is being funded, and what happens when the goal is met? Be specific - complete briefs earn a higher trust score."
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  data-testid="input-campaign-brief"
                />
                <div className="flex items-center justify-between gap-2">
                  <FieldError issue={shownIssue("brief")} />
                  <span className="text-[10px] text-muted-foreground/70 ml-auto tabular-nums shrink-0">
                    {brief.trim().length}/20 min
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  ref={(el) => {
                    fieldRefs.current.duration = el;
                  }}
                  className="space-y-1"
                >
                  <label className="stat-label">Funding deadline</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CAMPAIGN_DEADLINE_OPTIONS.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setDurationHours(String(h))}
                        className={cn(
                          "rounded-lg px-2 py-2 text-xs font-semibold transition-colors border",
                          Number(durationHours) === h
                            ? "bg-accent/15 border-accent/40 text-accent"
                            : "bg-background/40 border-white/[0.05] hover:border-white/[0.12] text-foreground",
                        )}
                        data-testid={`duration-${h}`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                  <FieldError issue={shownIssue("duration")} />
                </div>
                <div className="space-y-1">
                  <label className="stat-label">Link (optional)</label>
                  <Input
                    placeholder="Proof / details URL"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                  />
                </div>
              </div>

              {showValidation && issues.length > 0 && (
                <div className="rounded-xl bg-danger/[0.07] border border-danger/20 p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-danger">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Complete these items to continue
                  </div>
                  <ul className="space-y-1">
                    {issues.map((issue) => (
                      <li
                        key={`${issue.field}-${issue.kind}`}
                        className="text-[11px] text-foreground/80 leading-relaxed flex items-start gap-1.5"
                      >
                        <span className="text-danger/70 mt-0.5">•</span>
                        <span>{issue.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                className="w-full"
                disabled={configLoading}
                onClick={handleReview}
                data-testid="button-review-campaign"
              >
                {configLoading ? "Loading…" : "Review Campaign"}
              </Button>
              {!loggedIn ? (
                <p className="text-[11px] text-warning/90 leading-relaxed">
                  Sign in with X to create a campaign. Your platform reputation
                  determines the campaign's starting trust score.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Your platform reputation determines the campaign's starting
                  trust score.
                </p>
              )}
            </div>
          </>
        ) : step === "review" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep("details")}
                  className="text-muted-foreground hover:text-accent transition-colors"
                  data-testid="button-back-to-details"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                Review &amp; Confirm
              </DialogTitle>
              <DialogDescription>
                Check every detail before your campaign goes live - the goal
                and tier are locked once created.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3" data-testid="campaign-review">
              <div className="rounded-xl bg-surface-2 border border-white/[0.05] overflow-hidden divide-y divide-white/[0.05]">
                {[
                  {
                    label: "Campaign type",
                    value: selectedType
                      ? (TYPE_LABELS[selectedType.key] ?? selectedType.label)
                      : "—",
                  },
                  { label: "Selected tier", value: selectedTier?.label ?? "—" },
                  {
                    label: "Service funded",
                    value: selectedTier?.description ?? "—",
                  },
                  {
                    label: "Goal (USD)",
                    value: goalUsd != null ? fmtUsd(goalUsd) : "—",
                  },
                  {
                    label: "Estimated SOL",
                    value:
                      goalUsd != null && usdToSol(goalUsd) != null
                        ? `≈ ${usdToSol(goalUsd)!.toFixed(3)} SOL at the live price`
                        : "Converted at the live price on launch",
                  },
                  { label: "Duration", value: `${durationHours} hours` },
                  ...(token?.valid
                    ? [
                        {
                          label: "Token",
                          value: `${token.symbol ?? token.name ?? "Token"} · ${token.mint.slice(0, 6)}…${token.mint.slice(-6)}`,
                        },
                      ]
                    : []),
                  { label: "Title", value: title },
                  ...(linkUrl.trim()
                    ? [{ label: "Proof / details URL", value: linkUrl.trim() }]
                    : []),
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-start justify-between gap-4 px-4 py-2.5"
                  >
                    <span className="text-xs text-muted-foreground shrink-0">
                      {row.label}
                    </span>
                    <span className="text-xs font-medium text-right break-words min-w-0">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-2">
                <div className="stat-label text-accent">
                  What happens after launch
                </div>
                <ul className="space-y-1.5 text-[11px] text-muted-foreground leading-relaxed list-none">
                  <li className="flex gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                    <span>
                      A dedicated escrow address is created. Every deposit,
                      payout, and refund is recorded in a public append-only
                      ledger with on-chain signatures.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <CircleCheck className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                    <span>
                      If the goal is reached, BlackPebble purchases{" "}
                      {selectedTier
                        ? `"${selectedTier.label}"`
                        : "the service"}{" "}
                      directly from the provider and posts fulfillment proof on
                      the campaign page.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <RefreshCw className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                    <span>
                      If the goal is not reached by the deadline, every
                      contribution is automatically refunded in full to the
                      sending wallet (network fee only, no platform fee).
                      Overfunding is returned pro-rata.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Shield className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                    <span>
                      {feeBps > 0
                        ? `BlackPebble takes a ${(feeBps / 100).toFixed(1).replace(/\.0$/, "")}% platform fee from the goal at settlement - already included in the tier price, only on successful campaigns.`
                        : "No platform fee is charged on this campaign."}
                    </span>
                  </li>
                </ul>
              </div>

              {/* Duplicate detection (Part 5): an active campaign already
                  exists for this token + service. */}
              {duplicate && !dupAcknowledged && (
                <div
                  className="rounded-xl border border-warning/30 bg-warning/10 p-4 space-y-3"
                  data-testid="duplicate-warning"
                >
                  {/* Existing campaign shown first — it is the default path. */}
                  <div className="rounded-lg bg-background/50 border border-white/[0.08] p-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <TokenIdentity c={duplicate} size={40} />
                      <StateBadge state={duplicate.state} />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-[10px] font-semibold",
                          providerForTypeKey(duplicate.typeKey).accentBg,
                          providerForTypeKey(duplicate.typeKey).accentText,
                        )}
                      >
                        {providerForTypeKey(duplicate.typeKey).name}{" "}
                        {serviceBrand(duplicate.typeKey).short}
                      </span>
                      {duplicate.goalLabel && (
                        <span className="inline-flex items-center rounded-full bg-surface-2 border border-white/[0.06] px-2 py-0.5 text-[10px] font-semibold">
                          {duplicate.goalLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Funding</span>
                      <span className="text-muted-foreground tabular-nums">
                        {Math.min(
                          100,
                          Math.round(duplicate.accounting.progress * 100),
                        )}
                        % funded
                      </span>
                    </div>
                    <ProgressBar progress={duplicate.accounting.progress} />
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
                      <span>
                        Raised{" "}
                        <span className="text-foreground font-medium tabular-nums">
                          {duplicate.goalUsd != null
                            ? fmtUsd(
                                duplicate.goalUsd *
                                  Math.min(1, duplicate.accounting.progress),
                              )
                            : `${fmtSol(duplicate.accounting.depositedLamports)} SOL`}
                        </span>
                      </span>
                      <span className="text-right">
                        Remaining{" "}
                        <span className="text-foreground font-medium tabular-nums">
                          {duplicate.goalUsd != null
                            ? fmtUsd(
                                Math.max(
                                  0,
                                  duplicate.goalUsd *
                                    (1 -
                                      Math.min(
                                        1,
                                        duplicate.accounting.progress,
                                      )),
                                ),
                              )
                            : "—"}
                        </span>
                      </span>
                      <span>
                        {duplicate.accounting.contributorCount} contributor
                        {duplicate.accounting.contributorCount === 1 ? "" : "s"}
                      </span>
                      <span className="text-right">
                        Ends{" "}
                        <span className="text-foreground font-medium">
                          {timeLeft(duplicate.deadlineAt)}
                        </span>
                      </span>
                      <span className="col-span-2 truncate">
                        by{" "}
                        <span className="text-foreground font-medium">
                          {duplicate.creator.username
                            ? `@${duplicate.creator.username}`
                            : "Anonymous"}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <div className="text-[12px] leading-relaxed">
                      <span className="font-semibold text-warning">
                        This campaign already exists.
                      </span>{" "}
                      Contributing to the existing campaign keeps all funding in
                      one place. Creating a duplicate splits contributors.
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => {
                      const id = duplicate.publicId;
                      setOpen(false);
                      reset();
                      navigate(`/campaigns/${id}`);
                    }}
                    data-testid="button-contribute-instead"
                  >
                    Contribute to Existing Campaign
                  </Button>
                  <button
                    type="button"
                    className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
                    onClick={() => setDupAcknowledged(true)}
                    data-testid="button-create-separate"
                  >
                    Create New Campaign Anyway
                  </button>
                </div>
              )}

              {!(duplicate && !dupAcknowledged) && (
                <Button
                  className="w-full"
                  disabled={create.isPending || !canSubmit}
                  onClick={() => create.mutate()}
                  data-testid="button-submit-campaign"
                >
                  {create.isPending
                    ? "Creating…"
                    : "Create & Continue to Launch"}
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground leading-relaxed text-center">
                Next you will send a small opening contribution. Your campaign
                becomes public only after that transaction confirms. Campaign
                funding pays for a real third-party service, it never buys
                tokens or generates trading activity.
              </p>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <HandCoins className="w-5 h-5 text-accent" />
                Launch your campaign
              </DialogTitle>
              <DialogDescription>
                Send your opening contribution to the dedicated escrow. Your
                campaign becomes public only after this transaction confirms.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-xl bg-surface-2 border border-white/[0.05] p-3.5 space-y-2">
                <div className="stat-label">Dedicated escrow address</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs break-all min-w-0">
                    {created?.escrowAddress}
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-accent transition-colors shrink-0"
                    onClick={() => {
                      if (created) {
                        navigator.clipboard.writeText(created.escrowAddress);
                        toast({ title: "Escrow address copied" });
                      }
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-surface-2 border border-white/[0.05] p-3.5 space-y-2">
                <label className="stat-label">Opening contribution (SOL)</label>
                <Input
                  type="number"
                  min={
                    created
                      ? created.openingMinLamports / LAMPORTS_PER_SOL
                      : OPENING_MIN_SOL
                  }
                  step="0.05"
                  value={openingSol}
                  onChange={(e) => setOpeningSol(e.target.value)}
                  data-testid="input-opening-amount"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Minimum{" "}
                  {created
                    ? created.openingMinLamports / LAMPORTS_PER_SOL
                    : OPENING_MIN_SOL}{" "}
                  SOL. This counts toward your funding goal. The SOL target and
                  deadline lock in the moment this transaction confirms.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.05] bg-surface-2 p-3.5 space-y-2.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ackGoalLock}
                    onChange={(e) => setAckGoalLock(e.target.checked)}
                    className="mt-0.5 accent-[var(--accent)]"
                    data-testid="ack-goal-lock"
                  />
                  <span className="text-[11px] text-muted-foreground leading-relaxed">
                    I understand the SOL target becomes fixed when the campaign
                    launches and the funding deadline begins immediately.
                  </span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ackRefund}
                    onChange={(e) => setAckRefund(e.target.checked)}
                    className="mt-0.5 accent-[var(--accent)]"
                    data-testid="ack-refund"
                  />
                  <span className="text-[11px] text-muted-foreground leading-relaxed">
                    I understand that if the goal is not reached by the deadline,
                    contributions are refunded to the sending wallets minus only
                    the necessary network fee, and fulfillment is completed by
                    BlackPebble operator with public proof.
                  </span>
                </label>
              </div>

              {!publicKey && (
                <div className="rounded-lg bg-warning/10 border border-warning/20 p-2.5 text-[11px] text-warning leading-relaxed">
                  Connect the wallet you want to launch from. Your opening
                  contribution must come from your connected wallet.
                </div>
              )}

              {/* Live activation progress (Part 8) */}
              {(activate.isPending || activateStage === "timeout") &&
                activateStage !== "idle" && (
                  <div className="rounded-xl border border-white/[0.06] bg-surface-2 p-3.5 space-y-2.5">
                    <div className="flex items-center gap-2 text-[12px] font-semibold">
                      <CircleCheck className="w-4 h-4 text-success shrink-0" />
                      Campaign created
                    </div>
                    <div className="h-px bg-white/[0.06]" />
                    {ACTIVATE_STEPS.map((s) => {
                      const order = ACTIVATE_STEPS.findIndex(
                        (x) => x.key === s.key,
                      );
                      const current = ACTIVATE_STEPS.findIndex(
                        (x) => x.key === activateStage,
                      );
                      const done =
                        current > order ||
                        (activateStage === "timeout" && s.key !== "confirming");
                      const active = activateStage === s.key;
                      return (
                        <div key={s.key} className="flex items-start gap-2.5">
                          {done ? (
                            <CircleCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
                          ) : active ? (
                            <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0 mt-0.5" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-white/15 shrink-0 mt-0.5" />
                          )}
                          <div className="text-[12px]">
                            <div
                              className={cn(
                                done
                                  ? "text-muted-foreground"
                                  : active
                                    ? "font-semibold"
                                    : "text-muted-foreground/60",
                              )}
                            >
                              {s.label}
                            </div>
                            {active && s.hint && (
                              <div className="text-[11px] text-muted-foreground/70 mt-0.5">
                                {s.hint}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              {activateStage === "timeout" ? (
                <div className="rounded-xl border border-warning/25 bg-warning/10 p-3.5 space-y-2.5">
                  <div className="flex items-start gap-2 text-[12px] text-warning leading-relaxed">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Confirmation is taking longer than expected. Your
                      transaction may still confirm on-chain — we will not ask
                      you to send funds again.
                    </span>
                  </div>
                  {openingSig && (
                    <a
                      href={`https://solscan.io/tx/${openingSig}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline break-all"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      Verify transaction on Solscan
                    </a>
                  )}
                  <Button
                    className="w-full"
                    disabled={activate.isPending}
                    onClick={() => activate.mutate()}
                    data-testid="button-retry-activation"
                  >
                    {activate.isPending ? "Verifying…" : "Retry verification"}
                  </Button>
                </div>
              ) : (
                <>
                  {openingSig && (
                    <div className="rounded-lg bg-surface-2 border border-white/[0.05] p-2.5 text-[11px] text-muted-foreground leading-relaxed break-all">
                      Opening transaction sent: {openingSig}. If verification did
                      not complete, use Verify &amp; Launch to retry safely
                      without sending again.
                    </div>
                  )}
                  <Button
                    className="w-full"
                    disabled={
                      activate.isPending ||
                      !publicKey ||
                      !ackRefund ||
                      !ackGoalLock
                    }
                    onClick={() => activate.mutate()}
                    data-testid="button-activate-campaign"
                  >
                    {activate.isPending ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Please wait…
                      </span>
                    ) : openingSig ? (
                      "Verify & Launch"
                    ) : (
                      "Sign Opening Contribution & Launch"
                    )}
                  </Button>
                  <p className="text-[11px] text-muted-foreground leading-relaxed text-center">
                    Your campaign is saved and stays private until the opening
                    contribution confirms. You can safely retry if the wallet
                    popup closes.
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Browse page ──────────────────────────────────────────────────────────────

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "funded", label: "Funded" },
  { key: "settled", label: "Completed" },
];

export default function CampaignsPage() {
  const flags = useFeatureFlags();
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState("all");

  // Only bounce once the server has answered — never on the loading defaults.
  useEffect(() => {
    if (flags.ready && !flags.community_campaigns) navigate("/utilities");
  }, [flags.ready, flags.community_campaigns, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["campaigns", filter],
    queryFn: () => api.campaigns.list(filter),
    enabled: flags.community_campaigns,
    refetchInterval: 30_000,
  });
  // Stats always reflect the full catalogue regardless of the active filter.
  const { data: allData } = useQuery({
    queryKey: ["campaigns", "all"],
    queryFn: () => api.campaigns.list("all"),
    enabled: flags.community_campaigns,
    refetchInterval: 60_000,
  });

  if (!flags.community_campaigns) return null;

  const campaigns = data?.campaigns ?? [];
  const all = allData?.campaigns ?? [];
  const totalRaised = all.reduce(
    (sum, c) => sum + c.accounting.depositedLamports,
    0,
  );
  const liveCount = all.filter((c) => c.state === "live").length;
  const completedCount = all.filter((c) => c.state === "settled").length;
  const totalContributors = all.reduce(
    (sum, c) => sum + c.accounting.contributorCount,
    0,
  );

  return (
    <div className="flex flex-col gap-6 px-4 md:px-6 py-6 sm:py-10 w-full max-w-6xl mx-auto">
      <UtilityPageHeader
        utility={CAMPAIGNS}
        subtitle={CAMPAIGNS_SUBTITLE}
        actions={<CreateCampaignDialog />}
      />

      <div className="relative overflow-hidden rounded-2xl bg-card shadow-card">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent/[0.06] via-transparent to-accent/[0.04]" />
        <div className="relative grid grid-cols-2 md:grid-cols-4 divide-x divide-white/[0.05]">
          {[
            {
              label: "Total Raised",
              value: `${fmtSol(totalRaised)} SOL`,
            },
            { label: "Live Campaigns", value: String(liveCount) },
            { label: "Completed", value: String(completedCount) },
            { label: "Contributors", value: String(totalContributors) },
          ].map((s) => (
            <div key={s.label} className="px-5 py-4">
              <div className="stat-label">{s.label}</div>
              <div className="text-lg md:text-xl font-bold tabular-nums mt-1">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border",
              filter === f.key
                ? "bg-accent/15 text-accent border-accent/30"
                : "bg-surface-2 text-muted-foreground border-white/[0.05] hover:border-white/[0.12]",
            )}
            data-testid={`filter-${f.key}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-card shadow-card h-48 animate-pulse"
            />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl bg-card shadow-card p-10 text-center space-y-2">
          <HandCoins className="w-8 h-8 text-muted-foreground mx-auto" />
          <div className="font-semibold">No campaigns yet</div>
          <p className="text-sm text-muted-foreground">
            Be the first - start a campaign for your community.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <CampaignCard key={c.publicId} c={c} />
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 text-[11px] text-muted-foreground/70 leading-relaxed">
        <Shield className="w-3 h-3 shrink-0 mt-0.5" />
        <span>
          Every campaign has a dedicated escrow address and an append-only
          public ledger - every deposit, payout, and refund carries an on-chain
          transaction signature. BlackPebble never asks for keys, signing
          authority, or approvals beyond the SOL you choose to contribute.
        </span>
      </div>
    </div>
  );
}

// ── Detail page ──────────────────────────────────────────────────────────────

export function CampaignDetailPage() {
  const flags = useFeatureFlags();
  const [, params] = useRoute("/campaigns/:id");
  const publicId = params?.id ?? "";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [amountSol, setAmountSol] = useState("");
  const [contributing, setContributing] = useState(false);
  const [ackRefund, setAckRefund] = useState(false);

  // Only bounce once the server has answered — never on the loading defaults.
  useEffect(() => {
    if (flags.ready && !flags.community_campaigns) navigate("/utilities");
  }, [flags.ready, flags.community_campaigns, navigate]);

  const { data } = useQuery({
    queryKey: ["campaign", publicId],
    queryFn: () => api.campaigns.get(publicId),
    enabled: flags.community_campaigns && !!publicId,
    refetchInterval: 20_000,
  });
  const { data: ledgerData } = useQuery({
    queryKey: ["campaign-ledger", publicId],
    queryFn: () => api.campaigns.ledger(publicId),
    enabled: flags.community_campaigns && !!publicId,
    refetchInterval: 30_000,
  });
  const { data: adminMe } = useQuery({
    queryKey: ["admin-me"],
    queryFn: () => api.admin.me(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const c = data?.campaign ?? null;
  const ledger = ledgerData?.ledger ?? [];

  const refresh = useMutation({
    mutationFn: () => api.campaigns.refresh(publicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", publicId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ledger", publicId] });
    },
  });

  async function contribute() {
    if (!c || !publicKey) return;
    const amount = Number(amountSol);
    if (!Number.isFinite(amount) || amount < 0.01) {
      toast({
        title: "Enter an amount",
        description: "Minimum contribution is 0.01 SOL.",
        variant: "destructive",
      });
      return;
    }
    if (!ackRefund) {
      toast({
        title: "Please acknowledge the refund policy",
        description:
          "Confirm you are contributing from a wallet you control before signing.",
        variant: "destructive",
      });
      return;
    }
    setContributing(true);
    try {
      // Explicit fee payer + recent blockhash → clean Phantom preview and a
      // deterministic confirmation window (Part 7).
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("finalized");
      const tx = new Transaction({
        feePayer: publicKey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(c.escrowAddress),
          lamports: Math.round(amount * SOL),
        }),
      );
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      // Submit the signature for on-chain verification and exactly-once credit.
      // The backend verifies destination + amount and never trusts the client.
      try {
        const res = await api.campaigns.contribute(publicId, {
          txSignature: signature,
        });
        toast({
          title: res.credited ? "Contribution credited" : "Contribution received",
          description: res.credited
            ? "Your contribution is verified and on the public ledger."
            : "It will appear on the ledger within ~30 seconds.",
        });
      } catch {
        // The deposit sweeper is a backstop if verification did not complete.
        toast({
          title: "Contribution sent",
          description: "It will be credited to the ledger within ~30 seconds.",
        });
      }
      setAmountSol("");
      queryClient.invalidateQueries({ queryKey: ["campaign", publicId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ledger", publicId] });
      setTimeout(() => refresh.mutate(), 4_000);
    } catch (e) {
      toast({
        title: "Contribution failed",
        description: e instanceof Error ? e.message : "Transaction rejected",
        variant: "destructive",
      });
    } finally {
      setContributing(false);
    }
  }

  const acct = c?.accounting;
  const canContribute = c?.state === "live";

  const explorer = (sig: string) => `https://solscan.io/tx/${sig}`;

  const ledgerRows = useMemo(
    () => [...ledger].reverse(),
    [ledger],
  );

  if (!flags.community_campaigns) return null;

  if (!c) {
    return (
      <div className="px-4 md:px-6 py-10 w-full max-w-4xl mx-auto">
        <div className="rounded-2xl bg-card shadow-card h-64 animate-pulse" />
      </div>
    );
  }

  const detailBrand = providerForTypeKey(c.typeKey);
  const detailService = serviceBrand(c.typeKey);
  const DetailServiceIcon = detailService.icon;

  return (
    <div className="flex flex-col gap-6 px-4 md:px-6 py-6 sm:py-10 w-full max-w-4xl mx-auto">
      <div className="space-y-2">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Campaigns
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <TokenIdentity c={c} size={56} large />
          <div className="flex items-center gap-2">
            <TrustBadge score={c.trustScore} />
            <StateBadge state={c.state} />
          </div>
        </div>
        {/* Provider-branded service + tier + campaign title (secondary). */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-1 text-[11px] font-semibold",
              detailBrand.accentBg,
              detailBrand.accentText,
            )}
          >
            <DetailServiceIcon className="w-3 h-3" />
            {detailBrand.name} {detailService.short}
          </span>
          {c.goalLabel && (
            <span className="inline-flex items-center rounded-full bg-surface-2 border border-white/[0.06] px-2.5 py-1 text-[11px] font-semibold">
              {c.goalLabel}
              {c.goalUsd != null ? ` · ${fmtUsd(c.goalUsd)}` : ""}
            </span>
          )}
        </div>
        <div className="text-sm text-foreground/90 font-medium pt-0.5">
          {c.title}
          {c.creator.username ? (
            <>
              {" · by "}
              <Link
                href={`/u/${c.creator.username}`}
                className="text-accent hover:underline font-normal"
              >
                @{c.creator.username}
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {/* Escrow clarity (Part 4): token contract vs escrow wallet, never mixed. */}
      <div className="grid sm:grid-cols-2 gap-2.5">
        {c.tokenMint && (
          <AddressRow
            label="Token Contract"
            address={c.tokenMint}
            variant="token"
            tooltip="The token's contract address — do not send funds here."
          />
        )}
        <AddressRow
          label="Escrow Wallet"
          address={c.escrowAddress}
          variant="escrow"
          sublabel="Funding Wallet"
          tooltip="This is the only wallet used for campaign funding."
        />
      </div>

      {c.state === "funded" && (
        <div className="rounded-xl bg-emerald-500/[0.07] border border-success/15 px-4 py-3 flex items-start gap-2.5">
          <CircleCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <span className="font-semibold text-success">
              Goal reached - queued for fulfillment.
            </span>{" "}
            <span className="text-muted-foreground">
              BlackPebble purchases the service and posts proof here. The
              payout, platform fee, and any pro-rata overfunding refunds will
              appear in the ledger below with transaction signatures.
            </span>
          </div>
        </div>
      )}

      {c.state === "frozen" && (
        <div className="rounded-xl bg-danger/10 border border-danger/20 px-4 py-3 text-xs text-danger leading-relaxed">
          This campaign is frozen: an escrow accounting check failed and all
          fund movement is locked pending review. No contributions or payouts
          will process.
        </div>
      )}

      <div className="rounded-2xl bg-card shadow-card p-5 md:p-6 space-y-4">
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {c.brief}
        </p>
        {c.linkUrl && (
          <a
            href={c.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            Campaign link <ExternalLink className="w-3 h-3" />
          </a>
        )}

        <div className="space-y-2">
          <ProgressBar progress={acct?.progress ?? 0} />
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold">
              {fmtSol(acct?.depositedLamports ?? 0)} /{" "}
              {fmtSol(c.goalLamports)} SOL
            </span>
            <span className="text-muted-foreground text-xs">
              {c.state === "live" ? timeLeft(c.deadlineAt) : ""}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <MetricTile
            label="Raised"
            value={`${fmtSol(acct?.depositedLamports ?? 0)} SOL`}
            hint="Total SOL deposited into this campaign's escrow, verified on-chain."
          />
          <MetricTile
            label="Remaining in Escrow"
            value={`${fmtSol(acct?.remainingLamports ?? 0)} SOL`}
            hint="What the escrow currently holds after payouts, refunds, and fees. Must always match the on-chain balance - mismatches freeze the campaign."
          />
          <MetricTile
            label="Contributors"
            value={acct?.contributorCount ?? 0}
            hint="Unique wallets that have contributed."
          />
          <MetricTile
            label="Paid / Refunded"
            value={`${fmtSol((acct?.paidOutLamports ?? 0) + (acct?.refundedLamports ?? 0))} SOL`}
            hint="SOL that has left escrow as fulfillment payouts or contributor refunds - every transfer carries a transaction signature in the ledger below."
          />
        </div>

        {canContribute && (
          <div className="rounded-xl bg-surface-2 border border-white/[0.05] p-4 space-y-3">
            <div className="stat-label">Contribute</div>

            <div className="rounded-lg bg-background/40 border border-white/[0.05] p-3 space-y-1.5 text-[11px] text-muted-foreground leading-relaxed">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  <Shield className="w-3 h-3" />
                  Escrow wallet (only destination)
                </span>
                <span className="font-mono text-foreground/80 truncate max-w-[150px]">
                  {c.escrowAddress.slice(0, 6)}…{c.escrowAddress.slice(-6)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Estimated network fee</span>
                <span className="text-foreground/80">~0.000005 SOL</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Deadline</span>
                <span className="text-foreground/80">{timeLeft(c.deadlineAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Execution method</span>
                <span className="text-foreground/80">
                  {EXECUTION_MODE_LABEL[c.executionMode] ?? "Operator fulfillment"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Refund policy</span>
                <span className="text-foreground/80">
                  Full refund if goal missed
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-amber-500/[0.07] border border-amber-500/20 p-2.5">
              <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Refunds are returned to the contributing wallet. Contributions
                from exchanges, custodial platforms, multisigs, or
                program-controlled wallets may require manual review. Contribute
                only from a self-custody wallet you control.
              </p>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={ackRefund}
                onChange={(e) => setAckRefund(e.target.checked)}
                className="mt-0.5 accent-[var(--accent)]"
                data-testid="ack-contribute-refund"
              />
              <span className="text-[11px] text-muted-foreground leading-relaxed">
                I am contributing from a self-custody wallet I control and
                understand the refund and fulfillment policy above.
              </span>
            </label>

            {publicKey ? (
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0.01"
                  step="0.05"
                  placeholder="Amount (SOL)"
                  value={amountSol}
                  onChange={(e) => setAmountSol(e.target.value)}
                  className="max-w-[160px]"
                  data-testid="input-contribute-amount"
                />
                <Button
                  onClick={contribute}
                  disabled={contributing || !ackRefund}
                  data-testid="button-contribute"
                >
                  {contributing ? "Sending…" : "Contribute"}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Connect your Solana wallet to contribute. No BlackPebble account
                is required.
              </p>
            )}
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">
                Escrow: <span className="font-mono">{c.escrowAddress}</span>
              </span>
              <button
                type="button"
                className="hover:text-accent transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(c.escrowAddress);
                  toast({ title: "Escrow address copied" });
                }}
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {c.state === "settled" && c.fulfillmentNote && (
          <div className="rounded-xl bg-emerald-500/[0.06] border border-success/15 p-4 space-y-1">
            <div className="stat-label text-success">
              Fulfillment proof
            </div>
            <p className="text-xs text-foreground/90 leading-relaxed">
              {c.fulfillmentNote}
            </p>
            {c.fulfillmentUrl && (
              <a
                href={c.fulfillmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                View proof <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Transparency: every campaign answers the six trust questions. */}
      <div className="rounded-2xl bg-card shadow-card p-5 md:p-6 space-y-3">
        <h2 className="font-bold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-accent" />
          How this campaign works
        </h2>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {[
            {
              q: "What is being funded?",
              a: c.goalLabel
                ? `${TYPE_LABELS[c.typeKey] ?? c.typeKey} - "${c.goalLabel}"${c.goalUsd != null ? ` (${fmtUsd(c.goalUsd)})` : ""}, a real third-party service. Funding never buys tokens or creates trading activity.`
                : "A real third-party service priced at the campaign goal. Funding never buys tokens or creates trading activity.",
            },
            {
              q: "Who fulfills it?",
              a: "BlackPebble purchases the service directly from the provider once the goal is reached - the creator never touches the funds.",
            },
            {
              q: "What proves completion?",
              a: "A fulfillment note and proof link are posted on this page, and the payout appears in the ledger below with an on-chain signature.",
            },
            {
              q: "What if it fails?",
              a: "If the goal isn't reached by the deadline, the campaign fails and no service is purchased. Escrow never pays out on a failed campaign.",
            },
            {
              q: "What gets refunded?",
              a: "Failed campaigns refund every contribution in full to the sending wallet automatically (network fee only). Overfunding on successful campaigns is returned pro-rata.",
            },
            {
              q: "Are there platform fees?",
              a: "Only on success: a small platform fee (included in the tier price) is taken from the goal at settlement and recorded in the ledger. Failed campaigns pay no fee.",
            },
          ].map((item) => (
            <div
              key={item.q}
              className="rounded-xl bg-surface-2 border border-white/[0.05] p-3.5 space-y-1"
            >
              <div className="text-xs font-semibold">{item.q}</div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </div>

      <CampaignTimeline publicId={publicId} />

      <div className="rounded-2xl bg-card shadow-card p-5 md:p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold">Escrow Ledger</h2>
            <p className="text-xs text-muted-foreground">
              The complete money trail - append-only, every transfer signed
              on-chain.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            data-testid="button-refresh-ledger"
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5 mr-1.5", refresh.isPending && "animate-spin")}
            />
            Refresh
          </Button>
        </div>

        {ledgerRows.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No ledger entries yet - the first contribution starts the trail.
          </p>
        ) : (
          <div className="space-y-1.5">
            {ledgerRows.map((e, i) => (
              <LedgerRow key={i} entry={e} explorer={explorer} />
            ))}
          </div>
        )}
      </div>

      {adminMe?.admin && c.state === "funded" && (
        <AdminSettlePanel publicId={publicId} />
      )}
    </div>
  );
}

const TIMELINE_LABELS: Record<string, string> = {
  launched: "Campaign created",
  milestone_25: "25% funded",
  milestone_50: "50% funded",
  milestone_75: "75% funded",
  milestone_100: "100% funded",
  funded: "Goal reached",
  failed: "Funding failed",
  completed: "Settlement completed",
  refunded: "Contributors refunded",
};

/**
 * Real, data-backed campaign timeline. Rendered only when the backend has
 * recorded lifecycle events (never a fabricated progression).
 */
function CampaignTimeline({ publicId }: { publicId: string }) {
  const { data } = useQuery({
    queryKey: ["campaign-timeline", publicId],
    queryFn: () => api.campaigns.timeline(publicId),
    refetchInterval: 60_000,
  });
  const entries = data?.timeline ?? [];
  if (entries.length === 0) return null;

  return (
    <div className="rounded-2xl bg-card shadow-card p-5 md:p-6 space-y-3">
      <div>
        <h2 className="font-bold">Timeline</h2>
        <p className="text-xs text-muted-foreground">
          Every recorded lifecycle milestone for this campaign.
        </p>
      </div>
      <ol className="relative space-y-3 pl-5">
        {entries.map((e, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-5 top-1 flex h-3 w-3 items-center justify-center">
              <span className="h-2 w-2 rounded-full bg-accent" />
            </span>
            {i < entries.length - 1 && (
              <span className="absolute -left-[15px] top-3 h-full w-px bg-white/10" />
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-foreground">
                {TIMELINE_LABELS[e.eventKey] ?? e.eventKey}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(e.createdAt * 1000).toLocaleString()}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LedgerRow({
  entry,
  explorer,
}: {
  entry: CampaignLedgerEntry;
  explorer: (sig: string) => string;
}) {
  const kindMeta: Record<string, { label: string; tone: string }> = {
    deposit: { label: "Deposit", tone: "text-success" },
    payout: { label: "Payout", tone: "text-accent" },
    refund: { label: "Refund", tone: "text-warning" },
    fee: { label: "Fee", tone: "text-muted-foreground" },
  };
  const meta = kindMeta[entry.kind] ?? {
    label: entry.kind,
    tone: "text-muted-foreground",
  };
  return (
    <div className="flex items-center gap-3 rounded-full bg-surface-2 border border-white/[0.05] px-3.5 py-2 text-xs">
      <span className={cn("font-semibold w-16 shrink-0", meta.tone)}>
        {meta.label}
      </span>
      <span className="font-mono font-semibold shrink-0">
        {fmtSol(entry.lamports)} SOL
      </span>
      <span className="text-muted-foreground truncate flex-1">
        {entry.note ??
          (entry.counterparty
            ? `${entry.counterparty.slice(0, 4)}…${entry.counterparty.slice(-4)}`
            : "")}
      </span>
      <span className="text-muted-foreground/70 shrink-0 hidden sm:inline">
        {new Date(entry.createdAt * 1000).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}
      </span>
      {entry.txSignature && (
        <a
          href={explorer(entry.txSignature)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline shrink-0"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

function AdminSettlePanel({ publicId }: { publicId: string }) {
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const settle = useMutation({
    mutationFn: () =>
      api.campaigns.settle(publicId, {
        payoutDestination: destination.trim(),
        fulfillmentNote: note.trim(),
        fulfillmentUrl: url.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", publicId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ledger", publicId] });
      toast({ title: "Campaign settled" });
    },
    onError: (e: Error) =>
      toast({
        title: "Settlement failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  return (
    <div className="rounded-2xl bg-card shadow-card p-5 space-y-3 border border-accent/20">
      <div>
        <h2 className="font-bold text-sm">Admin - Settle Campaign</h2>
        <p className="text-xs text-muted-foreground">
          Pays the fulfillment destination, takes the platform fee, and returns
          any overfunding to contributors pro-rata. Requires a proof note.
        </p>
      </div>
      <Input
        placeholder="Payout destination address"
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
      />
      <Textarea
        placeholder="Fulfillment proof note (what was delivered, receipts)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />
      <Input
        placeholder="Proof URL - optional"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <Button
        onClick={() => settle.mutate()}
        disabled={settle.isPending || !destination.trim() || !note.trim()}
      >
        {settle.isPending ? "Settling…" : "Settle & Pay Out"}
      </Button>
    </div>
  );
}

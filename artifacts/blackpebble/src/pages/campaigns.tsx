import { useEffect, useMemo, useState } from "react";
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
  BadgeCheck,
  ChevronLeft,
  CircleCheck,
  Copy,
  Crown,
  ExternalLink,
  Flame,
  Megaphone,
  Plus,
  Radar,
  RefreshCw,
  Shield,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
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
  dex_listing: "DEXScreener Listing",
  dex_boost: "DEXScreener Boost",
  dex_ads: "DEXScreener Advertising",
  dex_trending: "DEXScreener Trending Bar",
  dextools_listing: "DEXTools Listing",
  dextools_nitro: "DEXTools Nitro Boost",
  dextools_ads: "DEXTools Ads",
  community_takeover: "CTO (Community Takeover)",
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

const STATE_META: Record<
  CampaignState,
  { label: string; className: string }
> = {
  live: { label: "Live", className: "bg-accent/15 text-accent" },
  funded: { label: "Funded", className: "bg-success/15 text-success" },
  settled: {
    label: "Completed",
    className: "bg-success/15 text-success",
  },
  failed: { label: "Refunding", className: "bg-warning/15 text-warning" },
  refunded: {
    label: "Refunded",
    className: "bg-white/[0.06] text-muted-foreground",
  },
  frozen: { label: "Frozen", className: "bg-danger/15 text-danger" },
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
  const Icon = TYPE_ICONS[c.typeKey] ?? Megaphone;
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
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {c.imageUrl ? (
              <img
                src={c.imageUrl}
                alt=""
                className="w-11 h-11 rounded-full object-cover shrink-0 ring-1 ring-white/10"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-accent/12 ring-1 ring-accent/20 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-accent" />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-bold text-sm truncate leading-snug">
                {c.title}
              </div>
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                {c.creator.username ? `@${c.creator.username}` : "Anonymous"}
              </div>
            </div>
          </div>
          <StateBadge state={c.state} />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 border border-white/[0.06] px-2.5 py-1 text-[11px] font-semibold">
            <Icon className="w-3 h-3 text-accent" />
            {c.goalLabel
              ? `${TYPE_LABELS[c.typeKey] ?? c.typeKey}: ${c.goalLabel}`
              : (TYPE_LABELS[c.typeKey] ?? c.typeKey)}
          </span>
          {c.state === "live" && (
            <span className="inline-flex items-center rounded-full bg-warning/10 text-warning px-2.5 py-1 text-[11px] font-semibold">
              {timeLeft(c.deadlineAt)}
            </span>
          )}
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

        {c.tokenMint && (
          <div className="rounded-xl bg-surface-2 border border-white/[0.05] px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground">
                Contract Address
              </div>
              <div className="font-mono text-[11px] truncate">
                {c.tokenMint.slice(0, 10)}...{c.tokenMint.slice(-8)}
              </div>
            </div>
            <button
              type="button"
              className="text-muted-foreground hover:text-accent transition-colors shrink-0"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigator.clipboard.writeText(c.tokenMint!);
              }}
              title="Copy contract address"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

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

function CreateCampaignDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"type" | "details">("type");
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: config } = useQuery({
    queryKey: ["campaigns-config"],
    queryFn: () => api.campaigns.config(),
    enabled: open,
    staleTime: 60_000,
  });
  const types = config?.types ?? [];
  const solPrice = config?.solPriceUsd ?? 0;
  const selectedType = types.find((t) => t.key === typeKey) ?? null;

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
      setOpen(false);
      reset();
      toast({
        title: "Campaign live",
        description:
          "Your escrow address is ready. Contributions are tracked on-chain.",
      });
      navigate(`/campaigns/${res.campaign.publicId}`);
    },
    onError: (e: Error) => {
      toast({
        title: "Could not create campaign",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const tokenOk = !selectedType?.requiresToken || (token?.valid ?? false);
  const goalOk = goalUsd != null;
  const needsBanner = selectedType?.requiredAssets.includes("banner") ?? false;
  const bannerOk = !needsBanner || bannerUrl.trim().length > 8;
  const canSubmit =
    tokenOk &&
    goalOk &&
    bannerOk &&
    title.trim().length >= 4 &&
    brief.trim().length >= 20;

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
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
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
                      return (
                        <button
                          key={def.key}
                          type="button"
                          onClick={() => pickType(def)}
                          className="text-left rounded-xl bg-surface-2 border border-white/[0.05] hover:border-accent/40 hover:bg-surface-2/80 transition-colors p-4 flex flex-col gap-2 group"
                          data-testid={`type-${def.key}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-accent/12 flex items-center justify-center shrink-0">
                                <Icon className="w-4 h-4 text-accent" />
                              </div>
                              <span className="font-bold text-sm truncate">
                                {def.label}
                              </span>
                            </div>
                            <span className="inline-flex items-center rounded-full bg-accent/10 text-accent px-2.5 py-0.5 text-[11px] font-bold shrink-0">
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
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep("type")}
                  className="text-muted-foreground hover:text-accent transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {selectedType?.label}
              </DialogTitle>
              <DialogDescription>{selectedType?.description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {selectedType?.requiresToken && (
                <div className="rounded-xl bg-surface-2 border border-white/[0.05] p-3.5 space-y-2.5">
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
                </div>
              )}

              <div className="rounded-xl bg-surface-2 border border-white/[0.05] p-3.5 space-y-2.5">
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
                    <div className="space-y-1.5">
                      {selectedType.goalOptions.map((opt) => (
                        <button
                          key={opt.usd}
                          type="button"
                          onClick={() => setGoalUsd(opt.usd)}
                          className={cn(
                            "w-full rounded-xl px-4 py-3 text-left transition-colors border flex items-center justify-between gap-3",
                            goalUsd === opt.usd
                              ? "bg-accent/15 border-accent/40"
                              : "bg-background/40 border-white/[0.05] hover:border-white/[0.12]",
                          )}
                          data-testid={`tier-${opt.usd}`}
                        >
                          <div className="min-w-0">
                            <div
                              className={cn(
                                "text-sm font-bold",
                                goalUsd === opt.usd
                                  ? "text-accent"
                                  : "text-foreground",
                              )}
                            >
                              {opt.label}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                              {opt.description}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className={cn(
                                "text-sm font-bold tabular-nums",
                                goalUsd === opt.usd && "text-accent",
                              )}
                            >
                              {fmtUsd(opt.usd)}
                            </div>
                            <div className="text-[10px] text-muted-foreground tabular-nums">
                              {usdToSol(opt.usd) != null
                                ? `≈ ${usdToSol(opt.usd)!.toFixed(2)} SOL`
                                : "goal"}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Priced to the real service cost plus processing, converted to
                  SOL at the live price when the campaign launches. Funded
                  campaigns are fulfilled by BlackPebble; contributors are
                  refunded automatically if the goal isn't reached.
                </p>
              </div>

              {needsBanner && (
                <div className="rounded-xl bg-surface-2 border border-white/[0.05] p-3.5 space-y-2">
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
                </div>
              )}

              <Input
                placeholder="Campaign title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                data-testid="input-campaign-title"
              />
              <Textarea
                placeholder="What is being funded, and what happens when the goal is met? Be specific - complete briefs earn a higher trust score."
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                maxLength={2000}
                data-testid="input-campaign-brief"
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="stat-label">Duration (hours)</label>
                  <Input
                    type="number"
                    min="6"
                    max="336"
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
                    data-testid="input-campaign-duration"
                  />
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
              <Button
                className="w-full"
                disabled={create.isPending || !canSubmit}
                onClick={() => create.mutate()}
                data-testid="button-submit-campaign"
              >
                {create.isPending ? "Creating…" : "Create Campaign"}
              </Button>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Requires an X-linked BlackPebble account. Your platform
                reputation determines the campaign's starting trust score.
              </p>
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
      <div className="space-y-2">
        <Link
          href="/utilities"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Utilities
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Community Campaigns
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Escrow-backed community funding with a fully public money trail.
              Goal not met - automatic refunds, no platform fee. Overfunding
              goes back to contributors, never kept.
            </p>
          </div>
          <CreateCampaignDialog />
        </div>
      </div>

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
          <Megaphone className="w-8 h-8 text-muted-foreground mx-auto" />
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
    setContributing(true);
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(c.escrowAddress),
          lamports: Math.round(amount * SOL),
        }),
      );
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");
      toast({
        title: "Contribution sent",
        description: "It will be credited to the ledger within ~30 seconds.",
      });
      setAmountSol("");
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
          <div className="flex items-center gap-3 min-w-0">
            {c.imageUrl ? (
              <img
                src={c.imageUrl}
                alt=""
                className="w-12 h-12 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-accent/12 flex items-center justify-center shrink-0">
                <Megaphone className="w-5 h-5 text-accent" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">
                {c.title}
              </h1>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <span>
                  {TYPE_LABELS[c.typeKey] ?? c.typeKey}
                  {c.creator.username ? (
                    <>
                      {" · by "}
                      <Link
                        href={`/u/${c.creator.username}`}
                        className="text-accent hover:underline"
                      >
                        @{c.creator.username}
                      </Link>
                    </>
                  ) : null}
                </span>
                {c.goalLabel && (
                  <span className="inline-flex items-center rounded-full bg-accent/10 text-accent px-2 py-0.5 text-[10px] font-bold">
                    {c.goalLabel}
                    {c.goalUsd != null ? ` · ${fmtUsd(c.goalUsd)}` : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrustBadge score={c.trustScore} />
            <StateBadge state={c.state} />
          </div>
        </div>
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
                  disabled={contributing}
                  data-testid="button-contribute"
                >
                  {contributing ? "Sending…" : "Contribute"}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Connect your wallet to contribute directly from the app.
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
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              If the goal isn't reached by the deadline, your full contribution
              is automatically refunded to the sending wallet (network fee
              only). Overfunding is returned pro-rata.
            </p>
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
